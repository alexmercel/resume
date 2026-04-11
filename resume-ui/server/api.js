import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { Buffer } from 'buffer';
import { createClient } from '@supabase/supabase-js';
import { loadAppEnv } from './env.js';
import {
  getDefaultModelForProvider,
  getFallbackModels,
  getProvider,
  listModelsForProvider,
  listProviders,
  generateTextWithProvider,
  generateWithUploadedResume
} from './providers.js';
import {
  ensureOpportunitiesCacheDir,
  getCachedOpportunitiesPayload,
  getOpportunitiesPayload
} from '../opportunities.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REQUIRED_DATA_FILES = ['profile.md', 'projects.md', 'workex.md', 'education.md', 'skills.md'];
const generationState = {
  status: 'Idle'
};

function setGenerationStatus(status) {
  generationState.status = status || 'Idle';
}

function getGenerationStatus() {
  return generationState.status || 'Idle';
}

function normalizeDailyGoal(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(25, Math.max(1, parsed));
}

export function getPaths(basePath, userId = null) {
  const appDir = path.join(basePath, 'resume-ui');
  const legacyRoot = basePath;
  const workspaceRoot = userId
    ? path.join(basePath, 'Runtime_Data', 'users', userId)
    : legacyRoot;

  const buildLogsDir = userId ? path.join(workspaceRoot, 'Build_Logs') : path.join(basePath, 'Build_Logs');
  const opportunitiesCachePath = path.join(appDir, 'opportunities-cache.json');

  return {
    basePath,
    appDir,
    workspaceRoot,
    dataDir: path.join(workspaceRoot, 'Data'),
    pdfDir: path.join(workspaceRoot, 'PDFs'),
    texDir: path.join(workspaceRoot, 'Tex_Files'),
    coverLettersDir: path.join(workspaceRoot, 'Cover_Letters'),
    buildLogsDir,
    wireframesDir: path.join(basePath, 'Templates', 'Wireframes'),
    genericTemplatesDir: path.join(basePath, 'Templates', 'Generic'),
    settingsPath: path.join(appDir, 'user-settings.json'),
    applicationsPath: path.join(appDir, 'applications.json'),
    opportunitiesCachePath,
    legacyDataDir: path.join(basePath, 'Data'),
    legacyPdfDir: path.join(basePath, 'PDFs'),
    legacyTexDir: path.join(basePath, 'Tex_Files'),
    legacyCoverLettersDir: path.join(basePath, 'Cover_Letters')
  };
}

function ensureDir(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

export function ensureWorkspaceDirs(paths) {
  ensureDir(paths.dataDir);
  ensureDir(paths.pdfDir);
  ensureDir(paths.texDir);
  ensureDir(paths.coverLettersDir);
  ensureDir(paths.buildLogsDir);
  ensureOpportunitiesCacheDir(paths.opportunitiesCachePath);
}

function isAllowedUserDocument(fileName) {
  return REQUIRED_DATA_FILES.includes(String(fileName || '').trim());
}

function resolveSafePath(rootDir, rawName) {
  const normalizedName = decodeURIComponent(String(rawName || '').split('?')[0]);
  const resolved = path.resolve(rootDir, normalizedName);
  if (!resolved.startsWith(path.resolve(rootDir) + path.sep) && resolved !== path.resolve(rootDir)) {
    throw new Error('Invalid path.');
  }
  return resolved;
}

function sendJson(res, payload, statusCode = 200) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || '');
  const normalizedColumn = String(columnName || '').trim();
  return Boolean(
    error
    && (
      error.code === 'PGRST204'
      || (normalizedColumn && message.includes(normalizedColumn) && /column/i.test(message))
    )
  );
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

export function getAppEnv(basePath) {
  return loadAppEnv(path.join(basePath, 'resume-ui'));
}

function getSupabaseConfig(env) {
  return {
    url: env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '',
    anonKey:
      env.SUPABASE_ANON_KEY
      || env.VITE_SUPABASE_ANON_KEY
      || env.VITE_SUPABASE_PUBLISHABLE_KEY
      || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      || '',
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || ''
  };
}

export function isSupabaseEnabled(env) {
  const config = getSupabaseConfig(env);
  return Boolean(config.url && config.anonKey && config.serviceRoleKey);
}

export function getLatexExecutionMode(env) {
  return String(env.LATEX_QUEUE_MODE || '').trim().toLowerCase() === 'worker' && isSupabaseEnabled(env)
    ? 'worker'
    : 'inline';
}

function getPublicAppConfig(basePath) {
  const env = getAppEnv(basePath);
  const supabase = getSupabaseConfig(env);
  const supabaseEnabled = isSupabaseEnabled(env);
  const latexMode = getLatexExecutionMode(env);
  return {
    success: true,
    authEnabled: supabaseEnabled,
    storageMode: supabaseEnabled ? 'database+scoped-files' : 'legacy-files',
    latex: {
      mode: latexMode,
      requiresLocalPdflatex: latexMode !== 'worker'
    },
    supabase: supabaseEnabled
      ? {
          url: supabase.url,
          anonKey: supabase.anonKey
        }
      : null,
    providers: listProviders().map((provider) => ({
      id: provider.id,
      name: provider.name,
      defaultModel: provider.defaultModel,
      configured: Boolean(env[provider.envKey])
    }))
  };
}

function createSupabaseClients(env) {
  const { url, anonKey, serviceRoleKey } = getSupabaseConfig(env);
  if (!url || !anonKey || !serviceRoleKey) return null;

  return {
    auth: createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }),
    admin: createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  };
}

async function getUserFromRequest(req, env) {
  if (!isSupabaseEnabled(env)) {
    return { user: null, userId: null, authEnabled: false };
  }

  const authHeader = req.headers.authorization || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    return { user: null, userId: null, authEnabled: true };
  }

  const clients = createSupabaseClients(env);
  if (!clients) {
    return { user: null, userId: null, authEnabled: true };
  }

  const { data, error } = await clients.auth.auth.getUser(tokenMatch[1]);
  if (error || !data?.user) {
    return { user: null, userId: null, authEnabled: true };
  }

  return {
    user: data.user,
    userId: data.user.id,
    authEnabled: true
  };
}

function hashKeyMaterial(secret) {
  return crypto.createHash('sha256').update(String(secret || '')).digest();
}

function encryptSecret(value, env) {
  const secret = env.APP_ENCRYPTION_KEY || '';
  if (!secret.trim()) {
    throw new Error('APP_ENCRYPTION_KEY must be configured before storing provider keys in the database.');
  }

  const key = hashKeyMaterial(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value || ''), 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSecret(payload, env) {
  if (!payload) return '';
  const [version, ivB64, tagB64, dataB64] = String(payload).split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) return '';
  const secret = env.APP_ENCRYPTION_KEY || '';
  if (!secret.trim()) {
    throw new Error('APP_ENCRYPTION_KEY is required to read encrypted provider keys.');
  }

  const key = hashKeyMaterial(secret);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final()
  ]);
  return decrypted.toString('utf-8');
}

function readLegacySettings(paths) {
  const provider = getProvider('google').id;
  const defaultModel = getDefaultModelForProvider(provider);
  const defaults = {
    provider,
    selectedModel: defaultModel,
    geminiApiKey: '',
    geminiModel: defaultModel,
    dailyApplicationGoal: 5,
    providerKeys: {}
  };

  try {
    if (!fs.existsSync(paths.settingsPath)) return defaults;
    const parsed = JSON.parse(fs.readFileSync(paths.settingsPath, 'utf-8'));
    const normalizedProvider = getProvider(parsed.provider || (parsed.geminiApiKey ? 'google' : provider)).id;
    return {
      ...defaults,
      ...parsed,
      provider: normalizedProvider,
      selectedModel: parsed.selectedModel || parsed.geminiModel || getDefaultModelForProvider(normalizedProvider),
      geminiModel: parsed.geminiModel || parsed.selectedModel || defaultModel,
      dailyApplicationGoal: normalizeDailyGoal(parsed.dailyApplicationGoal),
      providerKeys: parsed.providerKeys || {}
    };
  } catch {
    return defaults;
  }
}

function writeLegacySettings(paths, payload) {
  const existing = readLegacySettings(paths);
  const provider = getProvider(payload.provider || existing.provider).id;
  const selectedModel = payload.selectedModel || payload.geminiModel || existing.selectedModel || getDefaultModelForProvider(provider);
  const providerKeys = {
    ...(existing.providerKeys || {}),
    ...(payload.providerKeys || {})
  };

  const next = {
    ...existing,
    provider,
    selectedModel,
    geminiModel: provider === 'google' ? selectedModel : existing.geminiModel,
    geminiApiKey: provider === 'google'
      ? (payload.geminiApiKey ?? existing.geminiApiKey ?? providerKeys.google ?? '')
      : (existing.geminiApiKey || ''),
    dailyApplicationGoal: normalizeDailyGoal(payload.dailyApplicationGoal ?? existing.dailyApplicationGoal),
    providerKeys
  };

  fs.writeFileSync(paths.settingsPath, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

function readLegacyApplications(paths) {
  try {
    if (!fs.existsSync(paths.applicationsPath)) return [];
    const parsed = JSON.parse(fs.readFileSync(paths.applicationsPath, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLegacyApplications(paths, applications) {
  fs.writeFileSync(paths.applicationsPath, JSON.stringify(applications, null, 2), 'utf-8');
  return applications;
}

function addLegacyApplication(paths, entry) {
  const applications = readLegacyApplications(paths);
  const existingIndex = applications.findIndex((item) => item.filename === entry.filename);
  const nextEntry = {
    id: existingIndex >= 0 ? applications[existingIndex].id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    company: entry.company?.trim() || 'Untitled Company',
    role: entry.role?.trim() || 'Untitled Role',
    appliedOn: entry.appliedOn || new Date().toISOString().slice(0, 10),
    filename: entry.filename,
    hasCoverLetter: !!entry.hasCoverLetter,
    createdAt: existingIndex >= 0 ? applications[existingIndex].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) applications.splice(existingIndex, 1);
  applications.unshift(nextEntry);
  writeLegacyApplications(paths, applications);
  return applications;
}

export async function getDbClientsOrThrow(env) {
  const clients = createSupabaseClients(env);
  if (!clients) throw new Error('Supabase is not configured.');
  return clients;
}

export async function getUserSettings(paths, env, userId = null) {
  if (!userId || !isSupabaseEnabled(env)) {
    const legacy = readLegacySettings(paths);
    const provider = getProvider(legacy.provider).id;
    const hasUserKey = Boolean(
      legacy.providerKeys?.[provider]
      || (provider === 'google' && legacy.geminiApiKey)
    );
    const hasServerKey = Boolean(env[getProvider(provider).envKey]);
    return {
      provider,
      selectedModel: legacy.selectedModel || getDefaultModelForProvider(provider),
      dailyApplicationGoal: legacy.dailyApplicationGoal || 5,
      providerKeyConfigured: hasUserKey || hasServerKey,
      keySource: hasUserKey ? 'user' : (hasServerKey ? 'server' : 'none'),
      geminiApiKey: legacy.geminiApiKey || '',
      geminiModel: legacy.geminiModel || getDefaultModelForProvider('google')
    };
  }

  const { admin } = await getDbClientsOrThrow(env);
  const [{ data: settingsRow }, { data: keyRows }] = await Promise.all([
    admin
      .from('user_settings')
      .select('preferred_provider, preferred_model, daily_application_goal')
      .eq('user_id', userId)
      .maybeSingle(),
    admin
      .from('user_provider_keys')
      .select('provider, encrypted_key')
      .eq('user_id', userId)
  ]);
  const legacy = readLegacySettings(paths);

  const provider = getProvider(
    settingsRow?.preferred_provider
      || legacy.provider
      || 'google'
  ).id;
  const keyMap = new Map((keyRows || []).map((row) => [row.provider, row.encrypted_key]));
  const legacyProviderKey = provider === 'google'
    ? (legacy.providerKeys?.google || legacy.geminiApiKey || '')
    : (legacy.providerKeys?.[provider] || '');
  const configuredKey = keyMap.get(provider) || legacyProviderKey || env[getProvider(provider).envKey] || '';
  const hasUserKey = Boolean(keyMap.get(provider) || legacyProviderKey);

  return {
    provider,
    selectedModel: settingsRow?.preferred_model || legacy.selectedModel || getDefaultModelForProvider(provider),
    dailyApplicationGoal: normalizeDailyGoal(settingsRow?.daily_application_goal || legacy.dailyApplicationGoal || 5),
    providerKeyConfigured: Boolean(configuredKey),
    keySource: hasUserKey ? 'user' : (env[getProvider(provider).envKey] ? 'server' : 'none'),
    geminiApiKey: '',
    geminiModel: provider === 'google'
      ? (settingsRow?.preferred_model || legacy.geminiModel || legacy.selectedModel || getDefaultModelForProvider('google'))
      : getDefaultModelForProvider('google')
  };
}

async function saveUserSettings(paths, env, userId, incoming) {
  const provider = getProvider(incoming.provider || (incoming.geminiModel || incoming.geminiApiKey ? 'google' : 'google')).id;
  const selectedModel = incoming.selectedModel || incoming.geminiModel || getDefaultModelForProvider(provider);
  const dailyGoal = normalizeDailyGoal(incoming.dailyApplicationGoal);
  const providerApiKey = String(incoming.providerApiKey ?? incoming.geminiApiKey ?? '').trim();

  if (!userId || !isSupabaseEnabled(env)) {
    const existing = readLegacySettings(paths);
    const providerKeys = { ...(existing.providerKeys || {}) };
    if (providerApiKey) {
      providerKeys[provider] = providerApiKey;
    }

    const saved = writeLegacySettings(paths, {
      ...existing,
      provider,
      selectedModel,
      geminiModel: provider === 'google' ? selectedModel : existing.geminiModel,
      geminiApiKey: provider === 'google' && providerApiKey ? providerApiKey : existing.geminiApiKey,
      dailyApplicationGoal: dailyGoal,
      providerKeys
    });

    return {
      provider,
      selectedModel,
      dailyApplicationGoal: saved.dailyApplicationGoal,
      providerKeyConfigured: Boolean(providerKeys[provider] || (provider === 'google' && saved.geminiApiKey) || env[getProvider(provider).envKey]),
      geminiApiKey: provider === 'google' ? saved.geminiApiKey : '',
      geminiModel: saved.geminiModel
    };
  }

  const { admin } = await getDbClientsOrThrow(env);
  const upsertSettings = admin.from('user_settings').upsert({
    user_id: userId,
    preferred_provider: provider,
    preferred_model: selectedModel,
    daily_application_goal: dailyGoal,
    updated_at: new Date().toISOString()
  });

  const operations = [upsertSettings];
  if (providerApiKey) {
    operations.push(
      admin.from('user_provider_keys').upsert({
        user_id: userId,
        provider,
        encrypted_key: encryptSecret(providerApiKey, env),
        key_hint: providerApiKey.slice(-4),
        updated_at: new Date().toISOString()
      })
    );
  }

  const results = await Promise.all(operations);
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(error.message || 'Failed to save settings.');

  return {
    provider,
    selectedModel,
    dailyApplicationGoal: dailyGoal,
    providerKeyConfigured: Boolean(providerApiKey || env[getProvider(provider).envKey]),
    keySource: providerApiKey ? 'user' : (env[getProvider(provider).envKey] ? 'server' : 'none'),
    geminiApiKey: '',
    geminiModel: provider === 'google' ? selectedModel : getDefaultModelForProvider('google')
  };
}

export async function resolveProviderCredential(paths, env, userId, providerId, transientApiKey = '') {
  const provider = getProvider(providerId);
  const transient = String(transientApiKey || '').trim();
  if (transient) return transient;

  if (!userId || !isSupabaseEnabled(env)) {
    const legacy = readLegacySettings(paths);
    if (provider.id === 'google' && legacy.geminiApiKey) return legacy.geminiApiKey;
    if (legacy.providerKeys?.[provider.id]) return legacy.providerKeys[provider.id];
    if (env[provider.envKey]) return env[provider.envKey];
    return '';
  }

  const { admin } = await getDbClientsOrThrow(env);
  const { data, error } = await admin
    .from('user_provider_keys')
    .select('encrypted_key')
    .eq('user_id', userId)
    .eq('provider', provider.id)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Failed to load provider key.');
  if (data?.encrypted_key) return decryptSecret(data.encrypted_key, env);
  const legacy = readLegacySettings(paths);
  if (provider.id === 'google' && legacy.geminiApiKey) return legacy.geminiApiKey;
  if (legacy.providerKeys?.[provider.id]) return legacy.providerKeys[provider.id];
  if (env[provider.envKey]) return env[provider.envKey];
  return '';
}

async function listProviderConfigurations(paths, env, userId = null) {
  const providers = listProviders();

  if (!userId || !isSupabaseEnabled(env)) {
    const legacy = readLegacySettings(paths);
    return providers.map((provider) => {
      const hasUserKey = Boolean(
        legacy.providerKeys?.[provider.id]
        || (provider.id === 'google' && legacy.geminiApiKey)
      );
      const hasServerKey = Boolean(env[provider.envKey]);
      return {
        id: provider.id,
        name: provider.name,
        defaultModel: provider.defaultModel,
        configured: hasUserKey || hasServerKey,
        keySource: hasUserKey ? 'user' : (hasServerKey ? 'server' : 'none')
      };
    });
  }

  const { admin } = await getDbClientsOrThrow(env);
  const { data, error } = await admin
    .from('user_provider_keys')
    .select('provider')
    .eq('user_id', userId);
  if (error) throw new Error(error.message || 'Failed to load provider configuration.');

  const legacy = readLegacySettings(paths);
  const userProviderSet = new Set((data || []).map((row) => row.provider));
  return providers.map((provider) => {
    const hasLegacyUserKey = Boolean(
      legacy.providerKeys?.[provider.id]
      || (provider.id === 'google' && legacy.geminiApiKey)
    );
    const hasUserKey = userProviderSet.has(provider.id) || hasLegacyUserKey;
    const hasServerKey = Boolean(env[provider.envKey]);
    return {
      id: provider.id,
      name: provider.name,
      defaultModel: provider.defaultModel,
      configured: hasUserKey || hasServerKey,
      keySource: hasUserKey ? 'user' : (hasServerKey ? 'server' : 'none')
    };
  });
}

async function getModelsForProvider(paths, env, userId, providerId, transientApiKey = '') {
  const provider = getProvider(providerId);
  const apiKey = await resolveProviderCredential(paths, env, userId, provider.id, transientApiKey);
  if (!apiKey) {
    return getFallbackModels(provider.id).map((model) => ({ id: model, name: model, description: 'Fallback model list' }));
  }

  try {
    const models = await listModelsForProvider({ providerId: provider.id, apiKey });
    return models.length
      ? models
      : getFallbackModels(provider.id).map((model) => ({ id: model, name: model, description: 'Fallback model list' }));
  } catch {
    return getFallbackModels(provider.id).map((model) => ({ id: model, name: model, description: 'Fallback model list' }));
  }
}

async function readUserDocument(paths, env, userId, fileName) {
  if (!userId || !isSupabaseEnabled(env)) {
    const primaryPath = path.join(paths.dataDir, fileName);
    const fallbackPath = path.join(paths.legacyDataDir, fileName);
    if (fs.existsSync(primaryPath)) return fs.readFileSync(primaryPath, 'utf-8');
    if (primaryPath !== fallbackPath && fs.existsSync(fallbackPath)) return fs.readFileSync(fallbackPath, 'utf-8');
    return '';
  }

  const { admin } = await getDbClientsOrThrow(env);
  const { data, error } = await admin
    .from('user_documents')
    .select('content')
    .eq('user_id', userId)
    .eq('document_key', fileName)
    .maybeSingle();

  if (error) throw new Error(error.message || 'Failed to read document.');
  if (data?.content != null) return data.content;

  const fallbackPath = path.join(paths.legacyDataDir, fileName);
  if (fs.existsSync(fallbackPath)) return fs.readFileSync(fallbackPath, 'utf-8');
  return '';
}

async function writeUserDocument(paths, env, userId, fileName, content) {
  if (!userId || !isSupabaseEnabled(env)) {
    ensureDir(paths.dataDir);
    fs.writeFileSync(path.join(paths.dataDir, fileName), content, 'utf-8');
    return;
  }

  const { admin } = await getDbClientsOrThrow(env);
  const { error } = await admin.from('user_documents').upsert({
    user_id: userId,
    document_key: fileName,
    content,
    updated_at: new Date().toISOString()
  });
  if (error) throw new Error(error.message || 'Failed to save document.');
}

async function listUserApplications(paths, env, userId) {
  if (!userId || !isSupabaseEnabled(env)) {
    return readLegacyApplications(paths);
  }

  const { admin } = await getDbClientsOrThrow(env);
  const { data, error } = await admin
    .from('application_records')
    .select('id, company, role, applied_on, filename, has_cover_letter, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to load applications.');
  return (data || []).map((row) => ({
    id: row.id,
    company: row.company,
    role: row.role,
    appliedOn: row.applied_on,
    filename: row.filename,
    hasCoverLetter: row.has_cover_letter,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

async function upsertApplicationRecord(paths, env, userId, entry) {
  const payload = {
    company: entry.company?.trim() || 'Untitled Company',
    role: entry.role?.trim() || 'Untitled Role',
    appliedOn: entry.appliedOn || new Date().toISOString().slice(0, 10),
    filename: entry.filename,
    hasCoverLetter: !!entry.hasCoverLetter
  };

  if (!userId || !isSupabaseEnabled(env)) {
    return addLegacyApplication(paths, payload);
  }

  const { admin } = await getDbClientsOrThrow(env);
  const { error } = await admin.from('application_records').upsert({
    user_id: userId,
    filename: payload.filename,
    company: payload.company,
    role: payload.role,
    applied_on: payload.appliedOn,
    has_cover_letter: payload.hasCoverLetter,
    updated_at: new Date().toISOString()
  }, {
    onConflict: 'user_id,filename'
  });
  if (error) throw new Error(error.message || 'Failed to save application.');
  return listUserApplications(paths, env, userId);
}

function scanHistoryFromFiles(paths) {
  const historyMap = new Map();

  if (fs.existsSync(paths.texDir)) {
    const metadataFiles = fs.readdirSync(paths.texDir).filter((file) => file.endsWith('.json'));
    for (const fileName of metadataFiles) {
      const filePath = path.join(paths.texDir, fileName);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const key = data.company || path.basename(fileName, '.json');
        historyMap.set(key, {
          company: key,
          timestamp: data.timestamp || fs.statSync(filePath).mtime.getTime(),
          template: data.template || 'Unknown',
          jd: data.jd || '',
          coverLetterFile: data.coverLetterFile || `${key}_Cover_Letter.txt`,
          metadataFile: fileName
        });
      } catch {
        // Ignore malformed history metadata.
      }
    }
  }

  if (fs.existsSync(paths.pdfDir)) {
    const files = fs.readdirSync(paths.pdfDir).filter((file) => file.endsWith('.pdf'));
    for (const fileName of files) {
      const key = path.basename(fileName, '.pdf');
      const filePath = path.join(paths.pdfDir, fileName);
      const existing = historyMap.get(key) || {};
      historyMap.set(key, {
        company: key,
        timestamp: existing.timestamp || fs.statSync(filePath).mtime.getTime(),
        template: existing.template || 'Imported / Existing PDF',
        jd: existing.jd || '',
        coverLetterFile: existing.coverLetterFile || `${key}_Cover_Letter.txt`,
        metadataFile: existing.metadataFile || '',
        ...existing
      });
    }
  }

  if (fs.existsSync(paths.coverLettersDir)) {
    const files = fs.readdirSync(paths.coverLettersDir).filter((file) => file.endsWith('.txt'));
    for (const fileName of files) {
      const key = fileName.replace(/_Cover_Letter\.txt$/i, '');
      const filePath = path.join(paths.coverLettersDir, fileName);
      const existing = historyMap.get(key) || {};
      historyMap.set(key, {
        company: key,
        timestamp: existing.timestamp || fs.statSync(filePath).mtime.getTime(),
        template: existing.template || 'Imported / Existing Cover Letter',
        jd: existing.jd || '',
        coverLetterFile: fileName,
        metadataFile: existing.metadataFile || '',
        ...existing
      });
    }
  }

  return [...historyMap.values()]
    .map((item) => {
      const coverLetterPath = item.coverLetterFile
        ? path.join(paths.coverLettersDir, item.coverLetterFile)
        : null;
      const coverLetter = coverLetterPath && fs.existsSync(coverLetterPath)
        ? fs.readFileSync(coverLetterPath, 'utf-8')
        : '';
      return { ...item, coverLetter };
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

async function readUserHistory(paths, env, userId) {
  if (!userId || !isSupabaseEnabled(env)) {
    return scanHistoryFromFiles(paths);
  }

  const { admin } = await getDbClientsOrThrow(env);
  let historyQuery = admin
    .from('generation_history')
    .select('artifact_base_name, template_name, jd, cover_letter_file, cover_letter_content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  let { data, error } = await historyQuery;
  let hasCoverLetterContentColumn = true;
  if (isMissingColumnError(error, 'cover_letter_content')) {
    hasCoverLetterContentColumn = false;
    ({ data, error } = await admin
      .from('generation_history')
      .select('artifact_base_name, template_name, jd, cover_letter_file, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }));
  }
  if (error) throw new Error(error.message || 'Failed to load history.');

  if (!data?.length) {
    return scanHistoryFromFiles(paths);
  }

  return data.map((row) => {
    const coverLetterPath = row.cover_letter_file
      ? path.join(paths.coverLettersDir, row.cover_letter_file)
      : null;
    const coverLetterContent = hasCoverLetterContentColumn && row.cover_letter_content != null
      ? row.cover_letter_content
      : (
          coverLetterPath && fs.existsSync(coverLetterPath)
            ? fs.readFileSync(coverLetterPath, 'utf-8')
            : ''
        );
    return {
      company: row.artifact_base_name,
      timestamp: new Date(row.created_at).getTime(),
      template: row.template_name || 'Unknown',
      jd: row.jd || '',
      coverLetterFile: row.cover_letter_file || '',
      metadataFile: '',
      coverLetter: coverLetterContent
    };
  });
}

async function recordGenerationHistory(paths, env, userId, payload) {
  if (!userId || !isSupabaseEnabled(env)) return;
  const { admin } = await getDbClientsOrThrow(env);
  const timestamp = payload.createdAt || new Date().toISOString();
  let { error } = await admin.from('generation_history').upsert({
    user_id: userId,
    artifact_base_name: payload.artifactBaseName,
    template_name: payload.templateName,
    jd: payload.jd || '',
    cover_letter_file: payload.coverLetterFile || '',
    cover_letter_content: payload.coverLetterContent || '',
    created_at: timestamp,
    updated_at: timestamp
  }, {
    onConflict: 'user_id,artifact_base_name'
  });
  if (isMissingColumnError(error, 'cover_letter_content')) {
    ({ error } = await admin.from('generation_history').upsert({
      user_id: userId,
      artifact_base_name: payload.artifactBaseName,
      template_name: payload.templateName,
      jd: payload.jd || '',
      cover_letter_file: payload.coverLetterFile || '',
      created_at: timestamp,
      updated_at: timestamp
    }, {
      onConflict: 'user_id,artifact_base_name'
    }));
  }
  if (error) throw new Error(error.message || 'Failed to record generation history.');
}

async function enqueueGenerationJob(paths, env, userId, payload) {
  if (!userId || !isSupabaseEnabled(env)) {
    throw new Error('Queued LaTeX jobs require authenticated database mode.');
  }

  const { admin } = await getDbClientsOrThrow(env);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('generation_jobs')
    .insert({
      user_id: userId,
      source: payload.source || 'generate',
      artifact_base_name: payload.artifactBaseName,
      tex_file_name: payload.texFileName,
      pdf_file_name: payload.pdfFileName,
      max_attempts: payload.maxAttempts || 3,
      status: 'queued',
      updated_at: now,
      created_at: now
    })
    .select('id, source, artifact_base_name, tex_file_name, pdf_file_name, status, attempt_count, max_attempts, repaired, error_message, created_at, updated_at, started_at, completed_at')
    .single();
  if (error) throw new Error(error.message || 'Failed to enqueue generation job.');
  return data;
}

function mapGenerationJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    source: job.source,
    artifactBaseName: job.artifact_base_name,
    texFileName: job.tex_file_name,
    pdfFileName: job.pdf_file_name,
    status: job.status,
    attemptCount: job.attempt_count || 0,
    maxAttempts: job.max_attempts || 0,
    repaired: Boolean(job.repaired),
    errorMessage: job.error_message || '',
    createdAt: job.created_at || null,
    updatedAt: job.updated_at || null,
    startedAt: job.started_at || null,
    completedAt: job.completed_at || null
  };
}

async function getGenerationJob(paths, env, userId, jobId) {
  if (!userId || !isSupabaseEnabled(env)) {
    throw new Error('Queued LaTeX jobs require authenticated database mode.');
  }

  const { admin } = await getDbClientsOrThrow(env);
  const { data, error } = await admin
    .from('generation_jobs')
    .select('id, source, artifact_base_name, tex_file_name, pdf_file_name, status, attempt_count, max_attempts, repaired, error_message, created_at, updated_at, started_at, completed_at')
    .eq('user_id', userId)
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Failed to load generation job.');
  return mapGenerationJob(data);
}

async function getStoredCoverLetterContent(paths, env, userId, fileName) {
  const normalizedFileName = String(fileName || '').trim();
  if (!normalizedFileName) return '';

  if (userId && isSupabaseEnabled(env)) {
    const artifactBaseName = normalizedFileName.replace(/_Cover_Letter\.txt$/i, '');
    const { admin } = await getDbClientsOrThrow(env);
    let { data, error } = await admin
      .from('generation_history')
      .select('cover_letter_content')
      .eq('user_id', userId)
      .eq('artifact_base_name', artifactBaseName)
      .maybeSingle();
    if (isMissingColumnError(error, 'cover_letter_content')) {
      data = null;
      error = null;
    }
    if (error) throw new Error(error.message || 'Failed to load cover letter.');
    if (data?.cover_letter_content != null) {
      return data.cover_letter_content;
    }
  }

  const filePath = resolveSafePath(paths.coverLettersDir, normalizedFileName);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

export function cleanupLatexArtifacts(directory, baseName, preserve = []) {
  const artifacts = ['.aux', '.log', '.out', '.fls', '.fdb_latexmk', '.synctex.gz', '.toc'];
  for (const ext of artifacts) {
    const targetPath = path.join(directory, `${baseName}${ext}`);
    if (preserve.includes(targetPath)) continue;
    if (fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
      } catch {
        // Ignore cleanup issues.
      }
    }
  }
}

function checkPdflatexInstalled() {
  return new Promise((resolve) => {
    exec('pdflatex --version', (error, stdout) => {
      if (error) {
        resolve({ installed: false, version: '' });
        return;
      }
      const firstLine = (stdout || '').split('\n')[0]?.trim() || '';
      resolve({ installed: true, version: firstLine });
    });
  });
}

function getPlatformInfo() {
  const platform = os.platform();
  if (platform === 'darwin') {
    return {
      platform,
      label: 'macOS',
      recommendedDistribution: 'MiKTeX or MacTeX',
      installUrl: 'https://miktex.org/download',
      alternateUrl: 'https://tug.org/mactex/',
      installSteps: [
        'Install MiKTeX for macOS for a lighter setup with automatic package installs, or install MacTeX if you prefer a full TeX distribution.',
        'Restart the terminal or the app after installation so pdflatex is available in PATH.',
        'Run the readiness check below to confirm the template packages compile correctly.'
      ]
    };
  }

  if (platform === 'win32') {
    return {
      platform,
      label: 'Windows',
      recommendedDistribution: 'MiKTeX',
      installUrl: 'https://miktex.org/download',
      alternateUrl: 'https://www.tug.org/texlive/windows.html',
      installSteps: [
        'Install MiKTeX for Windows and allow on-the-fly package installation when prompted.',
        'Finish the installer, then reopen the app so pdflatex is available in PATH.',
        'Run the readiness check below to verify the template packages compile successfully.'
      ]
    };
  }

  return {
    platform,
    label: 'Linux',
    recommendedDistribution: 'TeX Live',
    installUrl: 'https://tug.org/texlive/',
    alternateUrl: '',
    installSteps: [
      'Install TeX Live with the packages your distribution provides, such as texlive-latex-base, texlive-fonts-recommended, and texlive-latex-extra.',
      'Reopen the app after installation so pdflatex is available in PATH.',
      'Run the readiness check below to verify the template packages compile successfully.'
    ]
  };
}

function getTemplatePackages(basePath) {
  const templateDirs = [
    path.join(basePath, 'Templates', 'Wireframes'),
    path.join(basePath, 'Templates', 'Generic')
  ];
  const packages = new Set();

  for (const directory of templateDirs) {
    if (!fs.existsSync(directory)) continue;
    for (const fileName of fs.readdirSync(directory)) {
      if (!fileName.endsWith('.tex')) continue;
      const content = fs.readFileSync(path.join(directory, fileName), 'utf-8');
      const matches = [...content.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g)];
      matches.forEach((match) => {
        String(match[1] || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
          .forEach((pkg) => packages.add(pkg));
      });
    }
  }

  return [...packages];
}

function runLatexReadinessCheck(basePath, packages) {
  return new Promise((resolve) => {
    const workingDir = path.join(basePath, 'Tex_Files');
    ensureDir(workingDir);
    const checkName = 'codex_latex_setup_check';
    const checkPath = path.join(workingDir, `${checkName}.tex`);
    const packageLines = packages.map((pkg) => `\\usepackage{${pkg}}`).join('\n');
    const content = `\\documentclass{article}
${packageLines}
\\begin{document}
LaTeX setup check for Resume Builder Studio.
\\end{document}
`;

    fs.writeFileSync(checkPath, content, 'utf-8');
    exec(`pdflatex -interaction=nonstopmode "${checkName}.tex"`, { cwd: workingDir }, (error, stdout, stderr) => {
      const pdfPath = path.join(workingDir, `${checkName}.pdf`);
      const success = !error && fs.existsSync(pdfPath);
      cleanupLatexArtifacts(workingDir, checkName);
      if (fs.existsSync(checkPath)) {
        try {
          fs.unlinkSync(checkPath);
        } catch {
          // Ignore cleanup issues.
        }
      }
      if (fs.existsSync(pdfPath)) {
        try {
          fs.unlinkSync(pdfPath);
        } catch {
          // Ignore cleanup issues.
        }
      }

      resolve({
        success,
        output: success ? 'Template packages compiled successfully.' : (stderr || stdout || 'Failed to compile the LaTeX setup check.'),
        packages
      });
    });
  });
}

function extractLatexErrorSnippet(output) {
  const text = String(output || '').trim();
  if (!text) return 'No compiler output was captured.';
  const errorLine = text.split('\n').find((line) => line.trim().startsWith('!'));
  if (errorLine) return errorLine.trim();
  return text.split('\n').slice(-12).join('\n').trim();
}

function detectLatexStructuralIssues(content) {
  const text = String(content || '');
  const issues = [];
  const openBraces = (text.match(/\{/g) || []).length;
  const closeBraces = (text.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    issues.push(`Brace count mismatch: ${openBraces} opening vs ${closeBraces} closing braces.`);
  }

  const begins = [...text.matchAll(/\\begin\{([^}]+)\}/g)].map((match) => match[1]);
  const ends = [...text.matchAll(/\\end\{([^}]+)\}/g)].map((match) => match[1]);
  const beginCounts = new Map();
  const endCounts = new Map();
  begins.forEach((name) => beginCounts.set(name, (beginCounts.get(name) || 0) + 1));
  ends.forEach((name) => endCounts.set(name, (endCounts.get(name) || 0) + 1));

  for (const name of new Set([...beginCounts.keys(), ...endCounts.keys()])) {
    const beginCount = beginCounts.get(name) || 0;
    const endCount = endCounts.get(name) || 0;
    if (beginCount !== endCount) {
      issues.push(`Environment mismatch for ${name}: \\begin count ${beginCount}, \\end count ${endCount}.`);
    }
  }

  return issues;
}

function runPdflatexOnce(workingDir, fileName) {
  return new Promise((resolve) => {
    exec(`pdflatex -interaction=nonstopmode "${fileName}"`, { cwd: workingDir }, (error, stdout, stderr) => {
      resolve({
        success: !error,
        output: `${stdout || ''}\n${stderr || ''}`.trim()
      });
    });
  });
}

async function attemptLatexRepair({ providerId, apiKey, model, content, compilerOutput }) {
  if (!apiKey || !content.trim()) return null;

  const repairPrompt = `
You are a strict LaTeX syntax repair utility.
Your task is to repair compile-breaking LaTeX issues in the document below while preserving the resume's content and layout intent.

Rules:
1. Fix only LaTeX syntax or structural issues.
2. Do NOT invent experience, projects, or personal data.
3. Do NOT change candidate facts.
4. Keep the same overall template structure.
5. Return ONLY raw LaTeX. No markdown fences or explanation.

Compiler output:
${extractLatexErrorSnippet(compilerOutput)}

Document to repair:
${content}
`;

  const repaired = await generateTextWithProvider({
    providerId,
    apiKey,
    model,
    prompt: repairPrompt
  });

  return repaired
    .replace(/^```latex\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim() || null;
}

export async function compileLatexWithRetries({
  workingDir,
  fileName,
  content = null,
  providerId,
  apiKey = '',
  model,
  maxAttempts = 3,
  allowRepair = false,
  statusPrefix = 'Compiling LaTeX'
}) {
  ensureDir(workingDir);

  const normalizedFileName = fileName.endsWith('.tex') ? fileName : `${fileName}.tex`;
  const baseName = normalizedFileName.replace(/\.tex$/i, '');
  const texPath = path.join(workingDir, normalizedFileName);
  const pdfPath = path.join(workingDir, `${baseName}.pdf`);

  let currentContent = content === null ? fs.readFileSync(texPath, 'utf-8') : String(content);
  fs.writeFileSync(texPath, currentContent, 'utf-8');
  let lastOutput = '';
  let repaired = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const structuralIssues = detectLatexStructuralIssues(currentContent);
    if (attempt === 1 && structuralIssues.length) {
      lastOutput = structuralIssues.join(' ');
    }

    setGenerationStatus(`${statusPrefix} (attempt ${attempt}/${maxAttempts})...`);
    const compileResult = await runPdflatexOnce(workingDir, normalizedFileName);
    lastOutput = compileResult.output || lastOutput;

    if (compileResult.success && fs.existsSync(pdfPath)) {
      return {
        success: true,
        pdfPath,
        texPath,
        attempts: attempt,
        repaired,
        output: compileResult.output,
        content: currentContent
      };
    }

    const shouldRepair = allowRepair && apiKey && attempt < maxAttempts;
    if (shouldRepair) {
      setGenerationStatus(`Repairing LaTeX syntax after compile failure (attempt ${attempt}/${maxAttempts})...`);
      const repairedContent = await attemptLatexRepair({
        providerId,
        apiKey,
        model,
        content: currentContent,
        compilerOutput: lastOutput
      });
      if (repairedContent && repairedContent !== currentContent) {
        currentContent = repairedContent;
        fs.writeFileSync(texPath, currentContent, 'utf-8');
        repaired = true;
        continue;
      }
    }
  }

  return {
    success: false,
    pdfPath,
    texPath,
    attempts: maxAttempts,
    repaired,
    output: lastOutput,
    content: currentContent
  };
}

function normalizeKeyword(value) {
  return (value || '')
    .toLowerCase()
    .replace(/\\textbf\{([^}]+)\}/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/\b(language|programming language|framework|frameworks|library|libraries|tool|tools|platform|platforms|database|databases|cloud|service|services)\b/g, '')
    .replace(/[^a-z0-9#+.\- ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getKeywordAliases(keyword) {
  const raw = (keyword || '').trim();
  const normalized = normalizeKeyword(raw);
  const aliases = new Set([raw.toLowerCase(), normalized]);

  if (normalized === 'r') {
    aliases.add('r language');
    aliases.add('r programming');
    aliases.add('r programming language');
  }

  if (normalized === 'sql') {
    aliases.add('structured query language');
  }

  if (normalized === 'aws') {
    aliases.add('amazon web services');
  }

  if (normalized === 'gcp') {
    aliases.add('google cloud platform');
  }

  return [...aliases].filter(Boolean);
}

function contentContainsKeyword(content, keyword) {
  const haystack = normalizeKeyword(content);
  const rawHaystack = String(content || '').toLowerCase();

  return getKeywordAliases(keyword).some((alias) => {
    if (!alias) return false;
    if (alias.length === 1) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const singleTokenRegex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
      return singleTokenRegex.test(rawHaystack);
    }
    return haystack.includes(normalizeKeyword(alias)) || rawHaystack.includes(alias);
  });
}

function calculateMatchedKeywords(jdKeywords, content) {
  const deduped = [...new Map((jdKeywords || []).map((keyword) => [normalizeKeyword(keyword), keyword])).values()];
  return deduped.filter((keyword) => contentContainsKeyword(content, keyword));
}

function extractApplicationInfoFromJd(jd, fallbackCompany = '', fallbackRole = '') {
  const text = String(jd || '').trim();
  const normalizedFallbackCompany = String(fallbackCompany || '').replace(/_/g, ' ').trim();
  const normalizedFallbackRole = String(fallbackRole || '').replace(/_/g, ' ').trim();

  const companyPatterns = [
    /\bat\s+([A-Z][A-Za-z0-9&.,'/ -]{1,60})/i,
    /\bjoin\s+([A-Z][A-Za-z0-9&.,'/ -]{1,60})/i,
    /\bcompany:\s*([A-Z][A-Za-z0-9&.,'/ -]{1,60})/i
  ];

  const rolePatterns = [
    /\b(?:seeking|hiring|looking for|looking to hire)\s+(?:an?\s+)?([A-Z][A-Za-z0-9/,+ -]{3,80})/i,
    /\bposition:\s*([A-Z][A-Za-z0-9/,+ -]{3,80})/i,
    /\brole:\s*([A-Z][A-Za-z0-9/,+ -]{3,80})/i
  ];

  const cleanValue = (value) => String(value || '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[.,:;\-\s]+$/g, '')
    .trim();

  const companyMatch = companyPatterns.map((pattern) => text.match(pattern)?.[1]).find(Boolean);
  const roleMatch = rolePatterns.map((pattern) => text.match(pattern)?.[1]).find(Boolean);

  return {
    company: cleanValue(companyMatch) || normalizedFallbackCompany || 'Untitled Company',
    role: cleanValue(roleMatch) || normalizedFallbackRole || 'Untitled Role'
  };
}

async function requireAuthenticatedContext(req, res, basePath) {
  const env = getAppEnv(basePath);
  const authContext = await getUserFromRequest(req, env);
  if (authContext.authEnabled && !authContext.userId) {
    sendJson(res, { success: false, error: 'Authentication required.' }, 401);
    return null;
  }
  return {
    env,
    authContext,
    paths: getPaths(basePath, authContext.userId)
  };
}

async function handleStatusRoute(res) {
  sendJson(res, { status: getGenerationStatus() });
}

async function handleAppConfigRoute(res, basePath) {
  sendJson(res, getPublicAppConfig(basePath));
}

async function handleSessionRoute(req, res, basePath) {
  const env = getAppEnv(basePath);
  const authContext = await getUserFromRequest(req, env);
  sendJson(res, {
    success: true,
    authEnabled: authContext.authEnabled,
    user: authContext.user
      ? {
          id: authContext.user.id,
          email: authContext.user.email || '',
          userMetadata: authContext.user.user_metadata || {}
        }
      : null
  });
}

async function handleSettingsGet(res, basePath, context) {
  const settings = await getUserSettings(context.paths, context.env, context.authContext.userId);
  const providerConfigurations = await listProviderConfigurations(
    context.paths,
    context.env,
    context.authContext.userId
  );
  const models = await getModelsForProvider(
    context.paths,
    context.env,
    context.authContext.userId,
    settings.provider
  );

  sendJson(res, {
    success: true,
    settings: {
      ...settings,
      geminiModel: settings.provider === 'google' ? settings.selectedModel : settings.geminiModel
    },
    models: models.map((item) => item.id),
    modelDetails: models,
    providers: providerConfigurations
  });
}

async function handleSettingsPost(req, res, basePath, context) {
  const body = await readJsonBody(req);
  const savedSettings = await saveUserSettings(
    context.paths,
    context.env,
    context.authContext.userId,
    body
  );
  const models = await getModelsForProvider(
    context.paths,
    context.env,
    context.authContext.userId,
    savedSettings.provider,
    body.providerApiKey || body.geminiApiKey || ''
  );
  const providerConfigurations = await listProviderConfigurations(
    context.paths,
    context.env,
    context.authContext.userId
  );
  const activeProviderConfig = providerConfigurations.find((provider) => provider.id === savedSettings.provider);

  sendJson(res, {
    success: true,
    settings: {
      ...savedSettings,
      keySource: activeProviderConfig?.keySource || savedSettings.keySource || 'none'
    },
    models: models.map((item) => item.id),
    modelDetails: models,
    providers: providerConfigurations
  });
}

async function handleProvidersGet(res, basePath, context) {
  sendJson(res, {
    success: true,
    providers: await listProviderConfigurations(context.paths, context.env, context.authContext.userId)
  });
}

async function handleModelsGet(req, res, basePath, context) {
  const url = new URL(req.url, 'http://localhost');
  const settings = await getUserSettings(context.paths, context.env, context.authContext.userId);
  const providerId = getProvider(url.searchParams.get('provider') || settings.provider).id;
  const models = await getModelsForProvider(
    context.paths,
    context.env,
    context.authContext.userId,
    providerId
  );
  sendJson(res, {
    success: true,
    provider: providerId,
    models: models.map((item) => item.id),
    modelDetails: models
  });
}

async function handleTestLlm(req, res, basePath, context) {
  const body = await readJsonBody(req);
  const persistedSettings = await getUserSettings(context.paths, context.env, context.authContext.userId);
  const providerId = getProvider(body.provider || persistedSettings.provider).id;
  const model = body.selectedModel || body.geminiModel || persistedSettings.selectedModel || getDefaultModelForProvider(providerId);
  const apiKey = await resolveProviderCredential(
    context.paths,
    context.env,
    context.authContext.userId,
    providerId,
    body.providerApiKey || body.geminiApiKey || ''
  );

  if (!apiKey) {
    sendJson(res, { success: false, error: `No ${getProvider(providerId).name} API key configured yet.` }, 400);
    return;
  }

  const responseText = await generateTextWithProvider({
    providerId,
    apiKey,
    model,
    prompt: 'Reply with a short hello world confirmation for a resume builder connection test.'
  });

  sendJson(res, {
    success: true,
    provider: providerId,
    model,
    response: responseText || 'Received an empty response.'
  });
}

async function handleSystemCheck(res, basePath) {
  const pdflatex = await checkPdflatexInstalled();
  const platform = getPlatformInfo();
  const packages = getTemplatePackages(basePath);
  sendJson(res, { pdflatex, platform, packages });
}

async function handleOnboardingStatus(res, basePath, context) {
  const settings = await getUserSettings(context.paths, context.env, context.authContext.userId);
  const providerConfigurations = await listProviderConfigurations(
    context.paths,
    context.env,
    context.authContext.userId
  );
  const models = await getModelsForProvider(context.paths, context.env, context.authContext.userId, settings.provider);
  const pdflatex = await checkPdflatexInstalled();
  const platform = getPlatformInfo();
  const packages = getTemplatePackages(basePath);

  const fileStatuses = await Promise.all(REQUIRED_DATA_FILES.map(async (fileName) => {
    const content = await readUserDocument(context.paths, context.env, context.authContext.userId, fileName);
    return {
      fileName,
      exists: Boolean(content),
      hasContent: Boolean(String(content || '').trim())
    };
  }));

  sendJson(res, {
    needsOnboarding: fileStatuses.some((file) => !file.hasContent),
    fileStatuses,
    settings,
    models: models.map((item) => item.id),
    modelDetails: models,
    providers: providerConfigurations,
    pdflatex,
    platform,
    packages
  });
}

async function handleLatexSetupCheck(req, res, basePath) {
  const pdflatex = await checkPdflatexInstalled();
  const packages = getTemplatePackages(basePath);
  if (!pdflatex.installed) {
    sendJson(res, { success: false, error: 'pdflatex is not installed yet.', packages }, 400);
    return;
  }

  const result = await runLatexReadinessCheck(basePath, packages);
  sendJson(res, result);
}

async function handleOnboardingImport(req, res, basePath, context) {
  const incoming = await readJsonBody(req);
  const persisted = await getUserSettings(context.paths, context.env, context.authContext.userId);
  const providerId = getProvider(incoming.provider || persisted.provider).id;
  const model = incoming.selectedModel || incoming.geminiModel || persisted.selectedModel || getDefaultModelForProvider(providerId);
  const apiKey = await resolveProviderCredential(
    context.paths,
    context.env,
    context.authContext.userId,
    providerId,
    incoming.providerApiKey || incoming.geminiApiKey || ''
  );

  const mimeType = incoming.mimeType || 'application/pdf';
  const fileName = incoming.fileName || 'resume.pdf';
  const fileData = incoming.base64Data || '';

  if (!apiKey) {
    sendJson(res, { success: false, error: `No ${getProvider(providerId).name} API key configured yet.` }, 400);
    return;
  }

  if (!fileData) {
    sendJson(res, { success: false, error: 'No resume file was uploaded.' }, 400);
    return;
  }

  await saveUserSettings(
    context.paths,
    context.env,
    context.authContext.userId,
    {
      provider: providerId,
      selectedModel: model,
      providerApiKey: incoming.providerApiKey || incoming.geminiApiKey || '',
      dailyApplicationGoal: incoming.dailyApplicationGoal || persisted.dailyApplicationGoal
    }
  );

  const onboardingPrompt = `
You are a resume ingestion and normalization utility for a resume builder app.

Your task is to read the uploaded resume and convert whatever information you can confidently extract into FIVE markdown files that match this app's storage format.

Return ONLY valid raw JSON with this exact schema:
{
  "profile.md": "markdown string",
  "projects.md": "markdown string",
  "workex.md": "markdown string",
  "education.md": "markdown string",
  "skills.md": "markdown string"
}

STRICT FORMAT REQUIREMENTS:

profile.md format:
# Personal Profile

- **Name:** value
- **Location:** value
- **Phone:** value
- **Email:** value
- **LinkedIn:** value (store without https:// or www.)
- **GitHub:** value (store without https:// or www.)
- **Portfolio:** value (store without https:// or www.)

projects.md format:
# Projects

## Project Name
*Date or Year*
- bullet

workex.md format:
# Experience

## Company | Location
*Overall Date Range*

**Role Title**
*Role Date Range*
- bullet

education.md format:
# Education

## School, Location
**Date Range**
- **Degree in Major** | GPA: value
- **Relevant Coursework:** item1, item2
- bullet

skills.md format:
# Technical Skills

## Category
- **Subcategory:** item1, item2

RULES:
1. Extract only what is actually supported by the uploaded resume.
2. If a section is missing, still return a valid file with just its top-level heading and no invented content.
3. Preserve truthfulness. Never guess names, dates, metrics, companies, or technologies.
4. For work experience and projects, keep bullets concise and factual.
5. Put technical skills into grouped skill categories when possible.
6. If personal profile fields are missing, leave them blank but preserve the line.
7. Do not include markdown code fences.
8. Return all five files every time.
`;

  const rawResponse = await generateWithUploadedResume({
    providerId,
    apiKey,
    model,
    prompt: onboardingPrompt,
    mimeType,
    base64Data: fileData,
    fileName
  });

  const parsed = JSON.parse(
    String(rawResponse || '')
      .replace(/^```json/i, '')
      .replace(/^```/i, '')
      .replace(/```$/i, '')
      .trim()
  );

  const defaults = {
    'profile.md': '# Personal Profile\n\n- **Name:** \n- **Location:** \n- **Phone:** \n- **Email:** \n- **LinkedIn:** \n- **GitHub:** \n- **Portfolio:** \n',
    'projects.md': '# Projects\n',
    'workex.md': '# Experience\n',
    'education.md': '# Education\n',
    'skills.md': '# Technical Skills\n'
  };

  const createdFiles = [];
  for (const fileNameKey of REQUIRED_DATA_FILES) {
    const nextContent = (parsed[fileNameKey] || defaults[fileNameKey] || '').trim();
    const finalContent = `${nextContent || defaults[fileNameKey].trim()}\n`;
    await writeUserDocument(context.paths, context.env, context.authContext.userId, fileNameKey, finalContent);
    createdFiles.push({
      fileName: fileNameKey,
      created: true,
      hasContent: Boolean(finalContent.trim())
    });
  }

  sendJson(res, {
    success: true,
    uploadedFile: fileName,
    createdFiles,
    savedSettings: {
      provider: providerId,
      selectedModel: model,
      providerKeyConfigured: true
    }
  });
}

async function handleDataFile(req, res, basePath, context) {
  const fileName = req.url.split('/api/data/')[1];
  if (!isAllowedUserDocument(fileName)) {
    sendJson(res, { error: 'Invalid document key.' }, 400);
    return;
  }
  if (req.method === 'GET') {
    const content = await readUserDocument(context.paths, context.env, context.authContext.userId, fileName);
    if (!content) {
      sendJson(res, { error: 'File not found' }, 404);
      return;
    }
    sendJson(res, { content });
    return;
  }

  const body = await readJsonBody(req);
  await writeUserDocument(context.paths, context.env, context.authContext.userId, fileName, body.content || '');
  sendJson(res, { success: true });
}

async function handleApplicationsGet(res, basePath, context) {
  const applications = await listUserApplications(context.paths, context.env, context.authContext.userId);
  sendJson(res, { applications });
}

async function handleHistoryGet(res, basePath, context) {
  const history = await readUserHistory(context.paths, context.env, context.authContext.userId);
  sendJson(res, { history });
}

async function handleGenerationJobGet(req, res, basePath, context) {
  const jobId = decodeURIComponent(req.url.split('/api/generation-jobs/')[1].split('?')[0]);
  const job = await getGenerationJob(context.paths, context.env, context.authContext.userId, jobId);
  if (!job) {
    sendJson(res, { success: false, error: 'Job not found.' }, 404);
    return;
  }
  sendJson(res, { success: true, job });
}

async function handleCoverLetterDownload(req, res, basePath, context) {
  const fileName = decodeURIComponent(req.url.split('/api/cover-letter/')[1].split('?')[0]);
  const content = await getStoredCoverLetterContent(
    context.paths,
    context.env,
    context.authContext.userId,
    fileName
  );
  if (!content) {
    res.statusCode = 404;
    res.end('Cover letter not found');
    return;
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(fileName)}"`);
  res.end(content);
}

async function handleTexFile(req, res, basePath, context) {
  const fileName = decodeURIComponent(req.url.split('/api/tex/')[1].split('?')[0]);
  const filePath = resolveSafePath(context.paths.texDir, fileName);
  ensureDir(context.paths.texDir);

  if (req.method === 'GET') {
    if (!fs.existsSync(filePath)) {
      sendJson(res, { error: 'File not found' }, 404);
      return;
    }
    sendJson(res, { content: fs.readFileSync(filePath, 'utf-8') });
    return;
  }

  const body = await readJsonBody(req);
  fs.writeFileSync(filePath, body.content || '', 'utf-8');
  sendJson(res, { success: true });
}

async function handleTemplatesGet(req, res, basePath) {
  const type = req.url.split('/api/templates/')[1];
  const folder = type === 'generic' ? 'Generic' : 'Wireframes';
  const templateDir = path.join(basePath, 'Templates', folder);
  const templates = fs.existsSync(templateDir)
    ? fs.readdirSync(templateDir).filter((file) => file.endsWith('.tex'))
    : [];
  sendJson(res, { templates });
}

async function handleTemplateFile(req, res, basePath) {
  const parts = req.url.split('/api/template/')[1].split('?')[0].split('/');
  const type = parts[0];
  const fileName = decodeURIComponent(parts[1]);
  const folder = type === 'generic' ? 'Generic' : 'Wireframes';
  const templateDir = path.join(basePath, 'Templates', folder);
  const filePath = resolveSafePath(templateDir, fileName);

  if (req.method === 'GET') {
    if (!fs.existsSync(filePath)) {
      sendJson(res, { error: 'File not found' }, 404);
      return;
    }
    sendJson(res, { content: fs.readFileSync(filePath, 'utf-8') });
    return;
  }

  const body = await readJsonBody(req);
  fs.writeFileSync(filePath, body.content || '', 'utf-8');
  sendJson(res, { success: true });
}

async function handleCompileTemplate(req, res, basePath, context) {
  const parts = req.url.split('/api/compile-template/')[1].split('?')[0].split('/');
  const type = parts[0];
  const fileName = decodeURIComponent(parts[1]);
  const folder = type === 'generic' ? 'Generic' : 'Wireframes';
  const templatePath = resolveSafePath(path.join(basePath, 'Templates', folder), fileName);
  if (!fs.existsSync(templatePath)) {
    sendJson(res, { success: false, error: 'Template not found' }, 404);
    return;
  }

  ensureWorkspaceDirs(context.paths);
  const previewName = `Preview_${type}_${fileName}`;
  const previewTexPath = path.join(context.paths.texDir, previewName);
  fs.copyFileSync(templatePath, previewTexPath);

  const settings = await getUserSettings(context.paths, context.env, context.authContext.userId);
  const apiKey = await resolveProviderCredential(
    context.paths,
    context.env,
    context.authContext.userId,
    settings.provider
  );
  const compileResult = await compileLatexWithRetries({
    workingDir: context.paths.texDir,
    fileName: previewName,
    providerId: settings.provider,
    apiKey,
    model: settings.selectedModel,
    maxAttempts: 3,
    allowRepair: true,
    statusPrefix: 'Compiling template preview'
  });
  cleanupLatexArtifacts(context.paths.texDir, previewName.replace('.tex', ''));

  if (!compileResult.success || !fs.existsSync(compileResult.pdfPath)) {
    sendJson(res, { success: false, error: extractLatexErrorSnippet(compileResult.output) || 'Failed to compile template preview.' }, 500);
    return;
  }

  sendJson(res, {
    success: true,
    attempts: compileResult.attempts,
    repaired: compileResult.repaired
  });
}

async function handleTemplatePdf(req, res, basePath, context) {
  const rawUrl = req.url.split('?')[0];
  const parts = rawUrl.split('/api/template-pdf/')[1].split('/');
  const type = parts[0];
  const fileName = parts[1];
  const baseName = fileName.replace('.tex', '').replace('.pdf', '');
  const filePath = path.join(context.paths.texDir, `Preview_${type}_${baseName}.pdf`);
  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  const stat = fs.statSync(filePath);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', stat.size);
  fs.createReadStream(filePath).pipe(res);
}

async function handleCompileSavedTex(req, res, basePath, context) {
  const fileName = decodeURIComponent(req.url.split('/api/compile/')[1].split('?')[0]);
  ensureWorkspaceDirs(context.paths);
  const baseName = fileName.replace('.tex', '');
  const latexMode = getLatexExecutionMode(context.env);

  if (latexMode === 'worker' && context.authContext.userId) {
    const job = await enqueueGenerationJob(context.paths, context.env, context.authContext.userId, {
      source: 'saved-tex',
      artifactBaseName: baseName,
      texFileName: `${baseName}.tex`,
      pdfFileName: `${baseName}.pdf`
    });
    sendJson(res, {
      success: true,
      queued: true,
      job,
      filename: `${baseName}.pdf`,
      message: 'Compilation queued for the LaTeX worker.'
    });
    return;
  }

  const settings = await getUserSettings(context.paths, context.env, context.authContext.userId);
  const apiKey = await resolveProviderCredential(
    context.paths,
    context.env,
    context.authContext.userId,
    settings.provider
  );

  const compileResult = await compileLatexWithRetries({
    workingDir: context.paths.texDir,
    fileName,
    providerId: settings.provider,
    apiKey,
    model: settings.selectedModel,
    maxAttempts: 3,
    allowRepair: true,
    statusPrefix: 'Recompiling saved LaTeX'
  });
  const finalPdfPath = path.join(context.paths.pdfDir, `${baseName}.pdf`);
  if (!compileResult.success || !fs.existsSync(compileResult.pdfPath)) {
    sendJson(res, { success: false, error: extractLatexErrorSnippet(compileResult.output) || 'Failed to compile PDF.' }, 500);
    return;
  }

  fs.renameSync(compileResult.pdfPath, finalPdfPath);
  cleanupLatexArtifacts(context.paths.texDir, baseName);
  sendJson(res, {
    success: true,
    attempts: compileResult.attempts,
    repaired: compileResult.repaired
  });
}

async function handleOutputsGet(res, basePath, context) {
  if (!fs.existsSync(context.paths.pdfDir)) {
    sendJson(res, { files: [] });
    return;
  }
  const files = fs.readdirSync(context.paths.pdfDir)
    .filter((file) => file.endsWith('.pdf'))
    .map((file) => {
      const stats = fs.statSync(path.join(context.paths.pdfDir, file));
      return { name: file, time: stats.mtime.getTime() };
    })
    .sort((a, b) => b.time - a.time);
  sendJson(res, { files });
}

async function handleOutputDownload(req, res, basePath, context) {
  const fileName = req.url.split('/api/output/')[1].split('?')[0];
  const filePath = resolveSafePath(context.paths.pdfDir, fileName);
  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  const stat = fs.statSync(filePath);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', stat.size);
  fs.createReadStream(filePath).pipe(res);
}

async function handleHighlight(req, res, basePath, context) {
  const body = await readJsonBody(req);
  const settings = await getUserSettings(context.paths, context.env, context.authContext.userId);
  const apiKey = await resolveProviderCredential(
    context.paths,
    context.env,
    context.authContext.userId,
    settings.provider
  );
  if (!apiKey) {
    sendJson(res, { error: `No ${getProvider(settings.provider).name} API key configured. Save one in the Profile tab first.` }, 400);
    return;
  }

  const aiPrompt = `You are a strict data formatter. I am supplying a block of resume markdown text.
Your ONLY directive is to identify the most critical technical keywords, metrics, or technologies, and wrap them in markdown bold tags \`**like this**\`.
DO NOT change any other text, DO NOT add preambles, DO NOT remove text. Return only the EXACT SAME TEXT with the **bolded** keywords.

=== TEXT ===
${body.content || ''}
`;

  const aiText = await generateTextWithProvider({
    providerId: settings.provider,
    apiKey,
    model: settings.selectedModel,
    prompt: aiPrompt
  });

  sendJson(res, {
    content: String(aiText || '')
      .replace(/^```markdown\n/g, '')
      .replace(/^```\n/g, '')
      .replace(/\n```$/g, '')
      .trim()
  });
}

async function readGenerationInputs(paths, env, userId, template) {
  const readDoc = (fileName) => readUserDocument(paths, env, userId, fileName);
  const [dataProfile, dataProj, dataSkills, dataWork, dataEdu] = await Promise.all([
    readDoc('profile.md'),
    readDoc('projects.md'),
    readDoc('skills.md'),
    readDoc('workex.md'),
    readDoc('education.md')
  ]);
  const ruleText = fs.readFileSync(path.join(paths.basePath, '.agent', 'rules', 'resume-generation-rule.md'), 'utf-8');
  let clRuleText = '';
  try {
    clRuleText = fs.readFileSync(path.join(paths.basePath, '.agent', 'rules', 'cover-letter-rule.md'), 'utf-8');
  } catch {
    clRuleText = '';
  }
  const skillText = fs.readFileSync(path.join(paths.basePath, '.agent', 'skills', 'resume_builder', 'SKILL.md'), 'utf-8');
  const templateText = fs.readFileSync(path.join(paths.wireframesDir, template), 'utf-8');

  return {
    dataProfile,
    dataProj,
    dataSkills,
    dataWork,
    dataEdu,
    ruleText,
    clRuleText,
    skillText,
    templateText
  };
}

async function handleHumanizeCoverLetter(req, res, basePath, context) {
  const body = await readJsonBody(req);
  const settings = await getUserSettings(context.paths, context.env, context.authContext.userId);
  const apiKey = await resolveProviderCredential(
    context.paths,
    context.env,
    context.authContext.userId,
    settings.provider
  );
  if (!apiKey) {
    sendJson(res, { success: false, error: `No ${getProvider(settings.provider).name} API key configured. Save one in the Profile tab first.` }, 400);
    return;
  }

  const coverLetter = body.coverLetter || '';
  const jd = body.jd || '';
  if (!coverLetter.trim()) {
    sendJson(res, { success: false, error: 'No cover letter content to humanize.' }, 400);
    return;
  }

  const humanizePrompt = `
You are a professional job application writing editor.

Your task is to humanize and improve the tone of the cover letter below while preserving truthfulness, role relevance, and all factual claims.

RULES:
1. Keep the letter professional, warm, and natural.
2. Do NOT invent any experience, metrics, technologies, or company-specific facts.
3. Do NOT make it generic or robotic.
4. Keep it concise and realistic for an actual application.
5. Keep the output near the original length.
6. Return ONLY the revised raw cover letter text with no markdown code fences.

=== TARGET JOB DESCRIPTION ===
${jd}

=== CURRENT COVER LETTER ===
${coverLetter}
`;

  const text = await generateTextWithProvider({
    providerId: settings.provider,
    apiKey,
    model: settings.selectedModel,
    prompt: humanizePrompt
  });

  sendJson(res, {
    success: true,
    coverLetter: String(text || '')
      .replace(/^```text\n/i, '')
      .replace(/^```\n/i, '')
      .replace(/\n```$/g, '')
      .trim()
  });
}

async function handleGenerate(req, res, basePath, context) {
  const body = await readJsonBody(req);
  const { prompt, template } = body;
  setGenerationStatus('Initializing Core Evaluators and Loading System Context...');
  ensureWorkspaceDirs(context.paths);

  const settings = await getUserSettings(context.paths, context.env, context.authContext.userId);
  const apiKey = await resolveProviderCredential(
    context.paths,
    context.env,
    context.authContext.userId,
    settings.provider
  );
  if (!apiKey) {
    sendJson(res, { success: false, error: `No ${getProvider(settings.provider).name} API key configured. Save one in the Profile tab before generating.` }, 400);
    setGenerationStatus('Idle');
    return;
  }

  const {
    dataProfile,
    dataProj,
    dataSkills,
    dataWork,
    dataEdu,
    ruleText,
    clRuleText,
    skillText,
    templateText
  } = await readGenerationInputs(context.paths, context.env, context.authContext.userId, template);

  setGenerationStatus('Pass 1: AI actively analyzing target JD and generating mapping overlaps...');
  const pass1Prompt = `
You are an expert AI Career Coach and Resume Optimizer.
I am providing you with a Target Job Description and a Candidate's Current Experience.
You must use ONLY the data explicitly included in this request.
You must IGNORE any prior resumes, prior candidates, prior PDFs, prior TeX files, prior history entries, or any cached assumptions.

=== IMPORTANT SYSTEM RULES AND CONSTRAINTS (Read Carefully) ===
${ruleText}

=== TARGET JOB DESCRIPTION ===
${prompt}

=== CANDIDATE CURRENT EXPERIENCE ===
Projects:
${dataProj}

Skills:
${dataSkills}

Work Experience:
${dataWork}

=== INSTRUCTIONS ===
1. Analyze the Target Job Description and extract ONLY technology-focused keywords and technical hiring signals.
2. Prioritize concrete technical terms such as languages, frameworks, libraries, SDKs, APIs, protocols, cloud platforms, databases, data tools, DevOps tools, operating systems, infrastructure, AI/ML technologies, and named technical methods.
3. DO NOT extract generic soft skills or vague business phrases.
4. Normalize keywords to concise resume-friendly technology labels.
5. Prefer explicit, repeated, or high-signal technical terms from the JD.
6. Cross-reference these JD technology keywords against the Candidate Current Experience exactly as written.
7. DO NOT rewrite, paraphrase, optimize, inject, expand, or modify any candidate bullets, skills, or project text.
8. Return the original Candidate Current Experience back unchanged inside the response field named \`optimizedExperience\`.
9. Preserve ALL existing \`**markdown bold**\` tags exactly as they appear.
10. Return your response AS A STRICT RAW JSON OBJECT matching this exact schema:
{
  "jdKeywords": ["keyword"],
  "matchedKeywords": ["keyword"],
  "optimizationPercentage": 0,
  "optimizedExperience": "original text"
}
CRITICAL: Output ONLY valid JSON with no markdown wrappers.
`;

  let optimizedExperience = '';
  let pass1Metrics = null;

  try {
    const pass1Response = await generateTextWithProvider({
      providerId: settings.provider,
      apiKey,
      model: settings.selectedModel,
      prompt: pass1Prompt
    });
    const parsedObj = JSON.parse(
      String(pass1Response || '')
        .replace(/^```json/i, '')
        .replace(/^```/i, '')
        .replace(/```$/i, '')
        .trim()
    );

    optimizedExperience = parsedObj.optimizedExperience || '';
    const jdKeywords = [...new Map((parsedObj.jdKeywords || []).map((keyword) => [normalizeKeyword(keyword), keyword])).values()];
    const matchedKeywords = calculateMatchedKeywords(jdKeywords, optimizedExperience);
    const calcPct = jdKeywords.length
      ? Math.min(100, Math.round((matchedKeywords.length / jdKeywords.length) * 100))
      : 0;

    pass1Metrics = {
      jdKeywords,
      matchedKeywords,
      optimizationPercentage: calcPct
    };
  } catch {
    optimizedExperience = `Projects:\n${dataProj}\nSkills:\n${dataSkills}\nWork Experience:\n${dataWork}`;
  }

  setGenerationStatus('Pass 2: AI actively converting your targeting metrics into robust LaTeX formatting...');
  const aiPrompt = `
You are an expert ATS resume builder acting as a backend API utility. Your task is to output a fully valid LaTeX file tailored to the user's TARGET JOB DESCRIPTION accurately using ONLY the Data files.
You must use ONLY the JD, the selected template text, and the Data markdown content provided below.
You must IGNORE any prior resumes, PDFs, TeX files, generated history, previously compiled outputs, or assumptions from earlier runs.

=== IMPORTANT SYSTEM RULES AND CONSTRAINTS (Read Carefully) ===
${ruleText}
${skillText}

=== TARGET JOB DESCRIPTION ===
${prompt}

=== OPTIMIZED USER DATA ===
Profile Information (Name, Contact, Links):
${dataProfile}

Education:
${dataEdu}

==== READ-ONLY EXPERIENCE SNAPSHOT (PRESERVE BOLDINGS EXACTLY, DO NOT REPHRASE) ====
${optimizedExperience}

=== BASE TEMPLATE (DO NOT MODIFY THE MACROS/FORMATTING, JUST SWAP OUT THE CONTENT DATA) ===
You must completely swap out structural placeholders explicitly with exact metrics from the User Data section.
IMPORTANT: Replace personal identity placeholders using the exact Profile Information context above.
You will also see a placeholder named \`[Suggested Job Title based on JD]\`. Synthesize a concise, compelling role title derived from the JD and candidate's competencies.

CRITICAL FORMATTING INSTRUCTION:
The Optimized User Data contains markdown bold tags like \`**keyword**\`.
When injecting these points into the LaTeX document, convert EVERY markdown bold block into native LaTeX bolding: \`\\textbf{keyword}\`.
STRICT SKILLS FORMATTING: Individual skills MUST NEVER be bolded in the Skills section.
STRICT CONTENT LOCK: Do NOT rewrite, paraphrase, optimize, or invent any resume bullet text. Use the candidate content exactly as provided.

${templateText}
`;

  const coverLetterPrompt = `
You are an expert personalized cover letter writer.
You must use ONLY the JD and candidate data included below.
You must IGNORE any prior resumes, PDFs, TeX files, previous candidates, generated history, or assumptions from earlier runs.

=== STRICT RULES ===
${clRuleText}

=== TARGET JOB DESCRIPTION ===
${prompt}

=== CANDIDATE PROFILE (Use this identity exactly to sign the letter) ===
${dataProfile}

=== CANDIDATE EXPERIENCE DATA FROM MARKDOWN FILES ===
Projects:
${dataProj}

Skills:
${dataSkills}

Work Experience:
${dataWork}

Education:
${dataEdu}

=== READ-ONLY EXPERIENCE SNAPSHOT ===
${optimizedExperience}

=== INSTRUCTIONS ===
Write a cover letter for the position of <position> in <company> using the JD above.
The cover letter must:
1. Begin with a powerful idea, insight, or value statement.
2. Connect the candidate's specific experience directly to the company's exact needs from the JD.
3. Build trust by referencing concrete evidence from the candidate's markdown experience data only.
4. Stay below 200 words total.
5. Sound sharp, credible, and tailored rather than generic.
6. Do NOT invent experience, companies, metrics, or technologies not present in the data files above.
7. Use today's date (${new Date().toLocaleDateString()}).
8. Return ONLY the raw cover letter text, with no markdown fences, labels, or explanation.
`;

  setGenerationStatus('Compiling valid LaTeX structures while drafting a tailored cover letter in parallel...');
  const [latexResponse, coverLetterResponse] = await Promise.all([
    generateTextWithProvider({
      providerId: settings.provider,
      apiKey,
      model: settings.selectedModel,
      prompt: aiPrompt
    }),
    generateTextWithProvider({
      providerId: settings.provider,
      apiKey,
      model: settings.selectedModel,
      prompt: coverLetterPrompt
    }).catch(() => '')
  ]);

  let aiText = String(latexResponse || '').replace(/^```latex\n/g, '').replace(/\n```$/g, '');
  if (pass1Metrics?.jdKeywords?.length) {
    const finalMatchedKeywords = calculateMatchedKeywords(pass1Metrics.jdKeywords, aiText);
    pass1Metrics = {
      ...pass1Metrics,
      matchedKeywords: finalMatchedKeywords,
      optimizationPercentage: Math.min(
        100,
        Math.round((finalMatchedKeywords.length / pass1Metrics.jdKeywords.length) * 100)
      )
    };
  }

  let coverLetterText = String(coverLetterResponse || '')
    .replace(/^```text\n/i, '')
    .replace(/\n```$/g, '')
    .trim();

  let filename = 'Generated_Resume';
  const firstLineBreak = aiText.indexOf('\n');
  const firstLine = firstLineBreak >= 0 ? aiText.substring(0, firstLineBreak) : aiText;
  if (firstLine.startsWith('FILENAME:')) {
    filename = firstLine
      .replace('FILENAME:', '')
      .trim()
      .replace('.tex', '')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    aiText = aiText.substring(firstLineBreak + 1).trim();
  }

  const texPath = path.join(context.paths.texDir, `${filename}.tex`);
  fs.writeFileSync(texPath, aiText, 'utf-8');
  const coverLetterFile = `${filename}_Cover_Letter.txt`;
  fs.writeFileSync(path.join(context.paths.coverLettersDir, coverLetterFile), coverLetterText, 'utf-8');

  const applicationInfo = extractApplicationInfoFromJd(
    prompt,
    filename,
    template.replace(/\.tex$/i, '').replace(/_/g, ' ')
  );

  const applications = await upsertApplicationRecord(
    context.paths,
    context.env,
    context.authContext.userId,
    {
      ...applicationInfo,
      filename: `${filename}.pdf`,
      hasCoverLetter: Boolean(coverLetterText)
    }
  );

  await recordGenerationHistory(context.paths, context.env, context.authContext.userId, {
    artifactBaseName: filename,
    templateName: template,
    jd: prompt,
    coverLetterFile,
    coverLetterContent: coverLetterText,
    createdAt: new Date().toISOString()
  }).catch(() => {});

  if (getLatexExecutionMode(context.env) === 'worker' && context.authContext.userId) {
    const job = await enqueueGenerationJob(context.paths, context.env, context.authContext.userId, {
      source: 'generate',
      artifactBaseName: filename,
      texFileName: `${filename}.tex`,
      pdfFileName: `${filename}.pdf`
    });
    setGenerationStatus('Idle');
    sendJson(res, {
      success: true,
      queued: true,
      job,
      filename: `${filename}.pdf`,
      metrics: pass1Metrics,
      coverLetter: coverLetterText,
      applicationInfo,
      applications,
      message: 'Resume drafted. PDF compilation has been queued for the LaTeX worker.'
    });
    return;
  }

  setGenerationStatus('Compiling generated LaTeX syntax to PDF locally...');
  const compileResult = await compileLatexWithRetries({
    workingDir: context.paths.texDir,
    fileName: `${filename}.tex`,
    content: aiText,
    providerId: settings.provider,
    apiKey,
    model: settings.selectedModel,
    maxAttempts: 3,
    allowRepair: true,
    statusPrefix: 'Compiling generated LaTeX syntax to PDF locally'
  });

  const finalPdfPath = path.join(context.paths.pdfDir, `${filename}.pdf`);
  if (!compileResult.success || !fs.existsSync(compileResult.pdfPath)) {
    cleanupLatexArtifacts(context.paths.texDir, filename);
    setGenerationStatus('Idle');
    sendJson(res, {
      success: false,
      error: extractLatexErrorSnippet(compileResult.output) || 'Failed to compile PDF. Ensure pdflatex is installed on this machine.'
    }, 500);
    return;
  }

  fs.renameSync(compileResult.pdfPath, finalPdfPath);
  cleanupLatexArtifacts(context.paths.texDir, filename);

  setGenerationStatus('Idle');
  sendJson(res, {
    success: true,
    filename: `${filename}.pdf`,
    metrics: pass1Metrics,
    coverLetter: coverLetterText,
    applicationInfo,
    applications,
    compileMeta: {
      attempts: compileResult.attempts,
      repaired: compileResult.repaired
    }
  });
}

async function handleOpportunities(req, res, basePath, context) {
  const url = new URL(req.url, 'http://localhost');
  const refresh = url.searchParams.get('refresh') === '1';
  const cacheOnly = url.searchParams.get('cache_only') === '1';
  const payload = cacheOnly
    ? getCachedOpportunitiesPayload(context.paths.opportunitiesCachePath)
    : await getOpportunitiesPayload({
        forceRefresh: refresh,
        cachePath: context.paths.opportunitiesCachePath
      });

  sendJson(res, {
    success: true,
    updatedAt: payload.updatedAt,
    fetchedAt: payload.fetchedAt,
    fromCache: Boolean(payload.fromCache),
    stale: Boolean(payload.stale),
    opportunities: payload.opportunities || [],
    sources: payload.sources || []
  });
}

export function createRequestHandler({ basePath } = {}) {
  const resolvedBasePath = basePath || path.resolve(__dirname, '..', '..');
  return async function handleRequest(req, res, next = null) {
    try {
      if (!req.url?.startsWith('/api/')) {
        if (typeof next === 'function') next();
        return;
      }

      if (req.url === '/api/status' && req.method === 'GET') {
        await handleStatusRoute(res);
        return;
      }

      if (req.url === '/api/app-config' && req.method === 'GET') {
        await handleAppConfigRoute(res, resolvedBasePath);
        return;
      }

      if (req.url === '/api/session' && req.method === 'GET') {
        await handleSessionRoute(req, res, resolvedBasePath);
        return;
      }

      const context = await requireAuthenticatedContext(req, res, resolvedBasePath);
      if (!context) return;
      ensureOpportunitiesCacheDir(context.paths.opportunitiesCachePath);

      if (req.url === '/api/settings' && req.method === 'GET') {
        await handleSettingsGet(res, resolvedBasePath, context);
        return;
      }

      if (req.url === '/api/settings' && req.method === 'POST') {
        await handleSettingsPost(req, res, resolvedBasePath, context);
        return;
      }

      if (req.url === '/api/providers' && req.method === 'GET') {
        await handleProvidersGet(res, resolvedBasePath, context);
        return;
      }

      if (req.url.startsWith('/api/models') && req.method === 'GET') {
        await handleModelsGet(req, res, resolvedBasePath, context);
        return;
      }

      if (req.url === '/api/test-llm' && req.method === 'POST') {
        await handleTestLlm(req, res, resolvedBasePath, context);
        return;
      }

      if (req.url === '/api/system-check' && req.method === 'GET') {
        await handleSystemCheck(res, resolvedBasePath);
        return;
      }

      if (req.url === '/api/onboarding-status' && req.method === 'GET') {
        await handleOnboardingStatus(res, resolvedBasePath, context);
        return;
      }

      if (req.url === '/api/latex-setup-check' && req.method === 'POST') {
        await handleLatexSetupCheck(req, res, resolvedBasePath);
        return;
      }

      if (req.url === '/api/onboarding-import' && req.method === 'POST') {
        await handleOnboardingImport(req, res, resolvedBasePath, context);
        return;
      }

      if (req.url.startsWith('/api/data/')) {
        await handleDataFile(req, res, resolvedBasePath, context);
        return;
      }

      if (req.url === '/api/applications' && req.method === 'GET') {
        await handleApplicationsGet(res, resolvedBasePath, context);
        return;
      }

      if (req.url.startsWith('/api/opportunities') && req.method === 'GET') {
        await handleOpportunities(req, res, resolvedBasePath, context);
        return;
      }

      if (req.url === '/api/history' && req.method === 'GET') {
        await handleHistoryGet(res, resolvedBasePath, context);
        return;
      }

      if (req.url.startsWith('/api/generation-jobs/') && req.method === 'GET') {
        await handleGenerationJobGet(req, res, resolvedBasePath, context);
        return;
      }

      if (req.url.startsWith('/api/cover-letter/') && req.method === 'GET') {
        await handleCoverLetterDownload(req, res, resolvedBasePath, context);
        return;
      }

      if (req.url.startsWith('/api/tex/')) {
        await handleTexFile(req, res, resolvedBasePath, context);
        return;
      }

      if (req.url.startsWith('/api/templates/') && req.method === 'GET') {
        await handleTemplatesGet(req, res, resolvedBasePath);
        return;
      }

      if (req.url.startsWith('/api/template/')) {
        await handleTemplateFile(req, res, resolvedBasePath);
        return;
      }

      if (req.url.startsWith('/api/compile-template/') && req.method === 'POST') {
        await handleCompileTemplate(req, res, resolvedBasePath, context);
        return;
      }

      if (req.url.startsWith('/api/template-pdf/') && req.method === 'GET') {
        await handleTemplatePdf(req, res, resolvedBasePath, context);
        return;
      }

      if (req.url.startsWith('/api/compile/') && req.method === 'POST') {
        await handleCompileSavedTex(req, res, resolvedBasePath, context);
        return;
      }

      if (req.url === '/api/outputs' && req.method === 'GET') {
        await handleOutputsGet(res, resolvedBasePath, context);
        return;
      }

      if (req.url.startsWith('/api/output/') && req.method === 'GET') {
        await handleOutputDownload(req, res, resolvedBasePath, context);
        return;
      }

      if (req.url === '/api/highlight' && req.method === 'POST') {
        await handleHighlight(req, res, resolvedBasePath, context);
        return;
      }

      if (req.url === '/api/humanize-cover-letter' && req.method === 'POST') {
        await handleHumanizeCoverLetter(req, res, resolvedBasePath, context);
        return;
      }

      if (req.url === '/api/generate' && req.method === 'POST') {
        await handleGenerate(req, res, resolvedBasePath, context);
        return;
      }

      if (typeof next === 'function') {
        next();
        return;
      }

      sendJson(res, { success: false, error: 'Not found.' }, 404);
    } catch (error) {
      setGenerationStatus('Idle');
      sendJson(res, { success: false, error: error.message || 'Server error.' }, 500);
    }
  };
}

export function createApiPlugin({ basePath } = {}) {
  const handler = createRequestHandler({ basePath });
  return {
    name: 'resume-api-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => handler(req, res, next));
    }
  };
}
