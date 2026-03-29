import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'
import os from 'os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let currentGenStatus = "Idle";
const SETTINGS_PATH = path.resolve(__dirname, 'user-settings.json');
const COMMON_FREE_TIER_MODELS = [
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite'
];
const DEFAULT_SETTINGS = {
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash-lite'
};
const REQUIRED_DATA_FILES = ['profile.md', 'projects.md', 'workex.md', 'education.md', 'skills.md'];

function readSettings() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings) {
  const payload = { ...DEFAULT_SETTINGS, ...settings };
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(payload, null, 2), 'utf-8');
  return payload;
}

function getGeminiConfig() {
  const settings = readSettings();
  return {
    apiKey: settings.geminiApiKey?.trim() || '',
    model: settings.geminiModel || DEFAULT_SETTINGS.geminiModel
  };
}

function getGeminiUrl(model, apiKey) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

function getDataDir() {
  return path.resolve(__dirname, '../Data');
}

function getRequiredDataFileStatuses() {
  const dataDir = getDataDir();
  return REQUIRED_DATA_FILES.map((fileName) => {
    const filePath = path.join(dataDir, fileName);
    const exists = fs.existsSync(filePath);
    const content = exists ? fs.readFileSync(filePath, 'utf-8') : '';
    return {
      fileName,
      exists,
      hasContent: !!content.trim()
    };
  });
}

function getOnboardingStatusPayload() {
  const fileStatuses = getRequiredDataFileStatuses();
  return {
    needsOnboarding: fileStatuses.some((file) => !file.exists || !file.hasContent),
    fileStatuses
  };
}

function cleanupLatexArtifacts(directory, baseName, preserve = []) {
  const artifacts = ['.aux', '.log', '.out', '.fls', '.fdb_latexmk', '.synctex.gz', '.toc'];
  artifacts.forEach((ext) => {
    const targetPath = path.join(directory, `${baseName}${ext}`);
    if (preserve.includes(targetPath)) return;
    if (fs.existsSync(targetPath)) {
      try { fs.unlinkSync(targetPath); } catch {}
    }
  });
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
  const rawHaystack = (content || '').toLowerCase();

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

const API_PLUGIN = () => ({
  name: 'api-plugin',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      
      // Global Telemetry Tracker API
      if (req.url === '/api/status' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: currentGenStatus }));
          return;
      }

      if (req.url === '/api/settings' && req.method === 'GET') {
          const settings = readSettings();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            settings,
            models: COMMON_FREE_TIER_MODELS
          }));
          return;
      }

      if (req.url === '/api/onboarding-status' && req.method === 'GET') {
          const settings = readSettings();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            ...getOnboardingStatusPayload(),
            settings,
            models: COMMON_FREE_TIER_MODELS
          }));
          return;
      }

      if (req.url === '/api/settings' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
          const incoming = JSON.parse(body || '{}');
          const settings = writeSettings({
            ...readSettings(),
            geminiApiKey: incoming.geminiApiKey ?? '',
            geminiModel: COMMON_FREE_TIER_MODELS.includes(incoming.geminiModel)
              ? incoming.geminiModel
              : DEFAULT_SETTINGS.geminiModel
          });
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, settings, models: COMMON_FREE_TIER_MODELS }));
        });
        return;
      }

      if (req.url === '/api/test-llm' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
          try {
            const incoming = JSON.parse(body || '{}');
            const saved = readSettings();
            const apiKey = (incoming.geminiApiKey ?? saved.geminiApiKey ?? '').trim();
            const model = COMMON_FREE_TIER_MODELS.includes(incoming.geminiModel)
              ? incoming.geminiModel
              : (saved.geminiModel || DEFAULT_SETTINGS.geminiModel);

            if (!apiKey) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'No Gemini API key configured yet.' }));
              return;
            }

            const geminiRes = await fetch(getGeminiUrl(model, apiKey), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: 'Reply with a short hello world confirmation for a resume builder connection test.' }] }]
              })
            });

            if (!geminiRes.ok) {
              const errorText = await geminiRes.text();
              throw new Error(errorText || 'Gemini test request failed');
            }

            const geminiData = await geminiRes.json();
            const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, model, response: responseText || 'Received an empty response.' }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
        return;
      }

      if (req.url === '/api/onboarding-import' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
          try {
            const incoming = JSON.parse(body || '{}');
            const apiKey = (incoming.geminiApiKey ?? readSettings().geminiApiKey ?? '').trim();
            const model = COMMON_FREE_TIER_MODELS.includes(incoming.geminiModel)
              ? incoming.geminiModel
              : (readSettings().geminiModel || DEFAULT_SETTINGS.geminiModel);
            const mimeType = incoming.mimeType || 'application/pdf';
            const fileName = incoming.fileName || 'resume.pdf';
            const fileData = incoming.base64Data || '';

            if (!apiKey) throw new Error('No Gemini API key configured yet.');
            if (!fileData) throw new Error('No resume file was uploaded.');

            writeSettings({
              ...readSettings(),
              geminiApiKey: apiKey,
              geminiModel: model
            });

            const onboardingPrompt = `
You are a resume ingestion and normalization utility for a local resume builder app.

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
- **LinkedIn:** value

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

            const geminiRes = await fetch(getGeminiUrl(model, apiKey), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: onboardingPrompt },
                    {
                      inlineData: {
                        mimeType,
                        data: fileData
                      }
                    }
                  ]
                }]
              })
            });

            if (!geminiRes.ok) {
              const errorText = await geminiRes.text();
              throw new Error(errorText || 'Gemini onboarding import failed');
            }

            const geminiData = await geminiRes.json();
            let rawJson = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            rawJson = rawJson.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
            const parsed = JSON.parse(rawJson);

            const defaults = {
              'profile.md': '# Personal Profile\n\n- **Name:** \n- **Location:** \n- **Phone:** \n- **Email:** \n- **LinkedIn:** \n',
              'projects.md': '# Projects\n',
              'workex.md': '# Experience\n',
              'education.md': '# Education\n',
              'skills.md': '# Technical Skills\n'
            };

            const dataDir = getDataDir();
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

            const createdFiles = REQUIRED_DATA_FILES.map((fileName) => {
              const nextContent = (parsed[fileName] || defaults[fileName] || '').trim();
              const finalContent = `${nextContent || defaults[fileName].trim()}\n`;
              fs.writeFileSync(path.join(dataDir, fileName), finalContent, 'utf-8');
              return {
                fileName,
                created: true,
                hasContent: !!finalContent.trim()
              };
            });

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: true,
              uploadedFile: fileName,
              createdFiles,
              savedSettings: {
                geminiApiKey: !!apiKey,
                geminiModel: model
              },
              onboarding: getOnboardingStatusPayload()
            }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
        return;
      }
      
      // Data Read/Write API
      if (req.url.startsWith('/api/data/')) {
        const fileName = req.url.split('/api/data/')[1];
        const filePath = path.resolve(__dirname, '../Data', fileName);
        
        if (req.method === 'GET') {
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ content }));
          } else {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'File not found' }));
          }
          return;
        }
        
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', () => {
             const { content } = JSON.parse(body);
             fs.writeFileSync(filePath, content, 'utf-8');
             res.setHeader('Content-Type', 'application/json');
             res.end(JSON.stringify({ success: true }));
          });
          return;
        }
      }

      // Metadata History API
      if (req.url === '/api/history' && req.method === 'GET') {
        const texDir = path.resolve(__dirname, '../Tex_Files');
        const coverLettersDir = path.resolve(__dirname, '../Cover_Letters');
        const pdfDir = path.resolve(__dirname, '../PDFs');
        const historyMap = new Map();

        if (fs.existsSync(texDir)) {
          const metadataFiles = fs.readdirSync(texDir).filter(f => f.endsWith('.json'));
          metadataFiles.forEach((f) => {
            const filePath = path.join(texDir, f);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              const key = data.company || path.basename(f, '.json');
              historyMap.set(key, {
                company: key,
                timestamp: data.timestamp || fs.statSync(filePath).mtime.getTime(),
                template: data.template || 'Unknown',
                jd: data.jd || '',
                coverLetterFile: data.coverLetterFile || `${key}_Cover_Letter.txt`,
                metadataFile: f
              });
            } catch (e) {}
          });
        }

        if (fs.existsSync(pdfDir)) {
          fs.readdirSync(pdfDir)
            .filter(f => f.endsWith('.pdf'))
            .forEach((f) => {
              const key = path.basename(f, '.pdf');
              const pdfPath = path.join(pdfDir, f);
              const existing = historyMap.get(key) || {};
              historyMap.set(key, {
                company: key,
                timestamp: existing.timestamp || fs.statSync(pdfPath).mtime.getTime(),
                template: existing.template || 'Imported / Existing PDF',
                jd: existing.jd || '',
                coverLetterFile: existing.coverLetterFile || `${key}_Cover_Letter.txt`,
                metadataFile: existing.metadataFile || '',
                ...existing
              });
            });
        }

        if (fs.existsSync(coverLettersDir)) {
          fs.readdirSync(coverLettersDir)
            .filter(f => f.endsWith('.txt'))
            .forEach((f) => {
              const key = f.replace(/_Cover_Letter\.txt$/i, '');
              const clPath = path.join(coverLettersDir, f);
              const existing = historyMap.get(key) || {};
              historyMap.set(key, {
                company: key,
                timestamp: existing.timestamp || fs.statSync(clPath).mtime.getTime(),
                template: existing.template || 'Imported / Existing Cover Letter',
                jd: existing.jd || '',
                coverLetterFile: f,
                metadataFile: existing.metadataFile || '',
                ...existing
              });
            });
        }

        const history = [...historyMap.values()]
          .map((item) => {
            const coverLetterPath = item.coverLetterFile ? path.join(coverLettersDir, item.coverLetterFile) : null;
            const coverLetter = coverLetterPath && fs.existsSync(coverLetterPath)
              ? fs.readFileSync(coverLetterPath, 'utf-8')
              : '';
            return { ...item, coverLetter };
          })
          .sort((a, b) => b.timestamp - a.timestamp);

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ history }));
        return;
      }

      if (req.url.startsWith('/api/cover-letter/') && req.method === 'GET') {
        const fileName = decodeURIComponent(req.url.split('/api/cover-letter/')[1].split('?')[0]);
        const filePath = path.resolve(__dirname, '../Cover_Letters', fileName);

        if (!fs.existsSync(filePath)) {
          res.statusCode = 404;
          res.end('Cover letter not found');
          return;
        }

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      // Raw TeX Read/Write API
      if (req.url.startsWith('/api/tex/')) {
        const fileName = decodeURIComponent(req.url.split('/api/tex/')[1].split('?')[0]);
        const filePath = path.resolve(__dirname, '../Tex_Files', fileName);
        
        if (req.method === 'GET') {
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ content }));
          } else {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'File not found' }));
          }
          return;
        }
        
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk.toString());
          req.on('end', () => {
             const { content } = JSON.parse(body);
             fs.writeFileSync(filePath, content, 'utf-8');
             res.setHeader('Content-Type', 'application/json');
             res.end(JSON.stringify({ success: true }));
          });
          return;
        }
      }

      // Templates API
      if (req.url.startsWith('/api/templates/') && req.method === 'GET') {
        const type = req.url.split('/api/templates/')[1];
        const folder = type === 'generic' ? 'Generic' : 'Wireframes';
        const tplDir = path.resolve(__dirname, `../Templates/${folder}`);
        if (fs.existsSync(tplDir)) {
          const files = fs.readdirSync(tplDir).filter(f => f.endsWith('.tex'));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ templates: files }));
        } else {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ templates: [] }));
        }
        return;
      }
      
      if (req.url.startsWith('/api/template/')) {
        const parts = req.url.split('/api/template/')[1].split('?')[0].split('/');
        const type = parts[0];
        const fileName = decodeURIComponent(parts[1]);
        const folder = type === 'generic' ? 'Generic' : 'Wireframes';
        const filePath = path.resolve(__dirname, `../Templates/${folder}`, fileName);
        
        if (req.method === 'GET') {
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ content }));
          } else {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'File not found' }));
          }
          return;
        }
        
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk.toString());
          req.on('end', () => {
             const { content } = JSON.parse(body);
             fs.writeFileSync(filePath, content, 'utf-8');
             res.setHeader('Content-Type', 'application/json');
             res.end(JSON.stringify({ success: true }));
          });
          return;
        }
      }

      // Live Template Compilation API
      if (req.url.startsWith('/api/compile-template/') && req.method === 'POST') {
        const parts = req.url.split('/api/compile-template/')[1].split('?')[0].split('/');
        const type = parts[0];
        const fileName = decodeURIComponent(parts[1]);
        const folder = type === 'generic' ? 'Generic' : 'Wireframes';
        const basePath = path.resolve(__dirname, '..');
        const exec = require('child_process').exec;
        
        const templatePath = path.join(basePath, `Templates/${folder}`, fileName);
        if(!fs.existsSync(templatePath)) {
           res.statusCode = 404;
           res.end(JSON.stringify({ error: 'Template not found' }));
           return;
        }

        // Clone to Tex_Files to compile without polluting the Templates folder
        const previewName = `Preview_${type}_${fileName}`;
        const previewTexPath = path.join(basePath, 'Tex_Files', previewName);
        fs.copyFileSync(templatePath, previewTexPath);

        exec(`pdflatex -interaction=nonstopmode "${previewName}"`, { cwd: path.join(basePath, 'Tex_Files') }, (err, stdout, stderr) => {
           cleanupLatexArtifacts(path.join(basePath, 'Tex_Files'), previewName.replace('.tex', ''));
           res.setHeader('Content-Type', 'application/json');
           res.end(JSON.stringify({ success: true }));
        });
        return;
      }

      // Stream Template PDF Preview API
      if (req.url.startsWith('/api/template-pdf/') && req.method === 'GET') {
        const rawUrl = req.url.split('?')[0]; 
        const parts = rawUrl.split('/api/template-pdf/')[1].split('/');
        const type = parts[0];
        const fileName = parts[1];
        const baseName = fileName.replace('.tex', '').replace('.pdf', '');
        const filePath = path.resolve(__dirname, '../Tex_Files', `Preview_${type}_${baseName}.pdf`);
        
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Length', stat.size);
          const stream = fs.createReadStream(filePath);
          stream.pipe(res);
          return;
        } else {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
      }

      // Re-Compile PDF API
      if (req.url.startsWith('/api/compile/') && req.method === 'POST') {
        const fileName = decodeURIComponent(req.url.split('/api/compile/')[1].split('?')[0]);
        const basePath = path.resolve(__dirname, '..');
        const exec = require('child_process').exec;
        
        exec(`pdflatex -interaction=nonstopmode "${fileName}"`, { cwd: path.join(basePath, 'Tex_Files') }, (err, stdout, stderr) => {
           const baseName = fileName.replace('.tex', '');
           const genPdfPath = path.join(basePath, 'Tex_Files', `${baseName}.pdf`);
           const finalPdfPath = path.join(basePath, 'PDFs', `${baseName}.pdf`);
           
           if (fs.existsSync(genPdfPath)) {
              fs.renameSync(genPdfPath, finalPdfPath);
           }
           cleanupLatexArtifacts(path.join(basePath, 'Tex_Files'), baseName);
           
           res.setHeader('Content-Type', 'application/json');
           res.end(JSON.stringify({ success: true }));
        });
        return;
      }

      // Output PDFs API
      if (req.url === '/api/outputs' && req.method === 'GET') {
        const pdfDir = path.resolve(__dirname, '../PDFs');
        if (fs.existsSync(pdfDir)) {
          const files = fs.readdirSync(pdfDir)
            .filter(f => f.endsWith('.pdf'))
            .map(f => {
              const stats = fs.statSync(path.join(pdfDir, f));
              return { name: f, time: stats.mtime.getTime() };
            })
            .sort((a, b) => b.time - a.time); // Newest first
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ files }));
        } else {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ files: [] }));
        }
        return;
      }

      // Stream PDF API
      if (req.url.startsWith('/api/output/') && req.method === 'GET') {
        const rawUrl = req.url.split('?')[0]; // Strip out query params
        const fileName = rawUrl.split('/api/output/')[1];
        const filePath = path.resolve(__dirname, '../PDFs', fileName);
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Length', stat.size);
          const stream = fs.createReadStream(filePath);
          stream.pipe(res);
          return;
        } else {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
      }

      // AI Generation Trigger
      if (req.url === '/api/highlight' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
          try {
            const { content } = JSON.parse(body);
            const { apiKey, model } = getGeminiConfig();
            if (!apiKey) throw new Error('No Gemini API key configured. Save one in the Profile tab first.');
            const aiPrompt = `You are a strict data formatter. I am supplying a block of Resume markdown text.
Your ONLY directive is to identify the most critical technical keywords, metrics, or technologies, and wrap them in markdown bold tags \`**like this**\`. 
DO NOT change any other text, DO NOT add preambles, DO NOT remove text. Return only the EXACT SAME TEXT with the **bolded** keywords.

=== TEXT ===
${content}
`;
            const geminiRes = await fetch(getGeminiUrl(model, apiKey), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: aiPrompt }] }] })
            });

            if (!geminiRes.ok) throw new Error("Highlight API Error");
            const geminiData = await geminiRes.json();
            let aiText = geminiData.candidates[0].content.parts[0].text;
            
            aiText = aiText.replace(/^```markdown\n/g, '').replace(/^```\n/g, '').replace(/\n```$/g, '');
            
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ content: aiText.trim() }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }

      if (req.url === '/api/generate' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
          try {
            currentGenStatus = "Initializing Core Evaluators and Loading System Context...";
            const { prompt, template } = JSON.parse(body);
            const basePath = path.resolve(__dirname, '..');
            const { apiKey, model } = getGeminiConfig();
            if (!apiKey) throw new Error('No Gemini API key configured. Save one in the Profile tab before generating.');
            
            // 1. Gather Context
            const read = p => fs.readFileSync(path.join(basePath, p), 'utf-8');
            const dataProfile = read('Data/profile.md');
            const dataProj = read('Data/projects.md');
            const dataSkills = read('Data/skills.md');
            const dataWork = read('Data/workex.md');
            const dataEdu = read('Data/education.md');
            const ruleText = read('.agent/rules/resume-generation-rule.md');
            let clRuleText = "";
            try { clRuleText = read('.agent/rules/cover-letter-rule.md'); } catch(e){}
            const skillText = read('.agent/skills/resume_builder/SKILL.md');
            const templateText = read(`Templates/Wireframes/${template}`);

            currentGenStatus = "Pass 1: AI actively analyzing Target JD and generating mapping overlaps...";
            // 2. Build Pipeline: Pass 1 (Content Optimization)
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
2. Prioritize concrete technical terms such as:
   - programming languages, query languages, markup languages
   - frameworks, libraries, SDKs, APIs, protocols
   - cloud platforms and cloud services
   - databases, data warehouses, ETL tools, BI tools
   - developer tools, DevOps tools, CI/CD tools, version control, IDE/platform names
   - operating systems, infrastructure, containers, orchestration, security tools
   - software products, vendor platforms, enterprise systems
   - AI/ML technologies, data technologies, architecture patterns, algorithms when explicitly stated
3. DO NOT extract generic soft skills or vague business phrases such as "communication", "leadership", "team player", "problem solving", "fast-paced environment", "stakeholder management", or broad verbs/responsibilities unless they are attached to a named technology.
4. Normalize keywords to concise resume-friendly technology labels. Examples:
   - "Amazon Web Services" -> "AWS"
   - "Google Cloud Platform" -> "GCP"
   - "Structured Query Language" -> "SQL"
   - keep official product names like "Salesforce", "Snowflake", "Kubernetes", "TensorFlow", "Databricks"
5. Prefer high-signal keywords that are explicitly required, preferred, used daily, or repeated in the JD. Avoid filler and avoid extracting long phrases when a precise product/tool name is better.
6. Cross-reference these extracted JD technology keywords against the Candidate's Current Experience exactly as written.
7. DO NOT rewrite, rephrase, paraphrase, optimize, inject, expand, or modify any candidate bullets, skills, or project text.
8. Treat the Candidate Current Experience as read-only source material. Resume generation must NEVER propose content that would alter the source markdown files.
9. Return the original Candidate Current Experience content back unchanged inside the response field named \`optimizedExperience\`. This field is only a passthrough for downstream rendering and must remain text-identical to the input sections.
10. Preserve ALL existing \`**markdown bold**\` tags exactly as they appear. Do not add new bold tags around injected terms because you must not inject new terms at all. Individual skills inside the "Skills:" section must remain unmodified.
11. Return your response AS A STRICT RAW JSON OBJECT matching this exact schema:
{
  "jdKeywords": ["list of STRICTLY ONLY technology-focused keywords extracted from JD such as languages, tools, software, frameworks, cloud services, databases, platforms, or named technical methods"],
  "matchedKeywords": ["list of specifically the JD keywords from the array above that already exist in the unmodified Candidate Current Experience"],
  "optimizationPercentage": 0, // Ignore this value, it will be calculated natively.
  "optimizedExperience": "<The original unmodified markdown string containing Projects, Skills, and Work Experience headers identical to the input structure>"
}
CRITICAL: Output ONLY valid JSON. Do not use Markdown JSON wrappers (\`\`\`json). Just output the raw \{...\} brace structure.
`;
            
            let optimizedExperience = "";
            let pass1Metrics = null;
            try {
               const pass1Res = await fetch(getGeminiUrl(model, apiKey), {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ contents: [{ parts: [{ text: pass1Prompt }] }] })
               });
               if (!pass1Res.ok) throw new Error("Optimization Pipeline Error");
               const pass1Data = await pass1Res.json();
               let rawJsonString = pass1Data.candidates[0].content.parts[0].text;
               
               // Clean up any stray markdown Wrappers
               rawJsonString = rawJsonString.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
               
               const parsedObj = JSON.parse(rawJsonString);
               optimizedExperience = parsedObj.optimizedExperience || "";
               
               const jdKeywords = [...new Map((parsedObj.jdKeywords || []).map((keyword) => [normalizeKeyword(keyword), keyword])).values()];
               const matchedKeywords = calculateMatchedKeywords(jdKeywords, optimizedExperience);
               const calcPct = jdKeywords.length > 0
                 ? Math.min(100, Math.round((matchedKeywords.length / jdKeywords.length) * 100))
                 : 0;

               pass1Metrics = {
                  jdKeywords,
                  matchedKeywords,
                  optimizationPercentage: calcPct
               };
            } catch (e) {
               console.error("Pass 1 Optimization Failed. Falling back to unmodified raw tracking:", e);
               optimizedExperience = `Projects:\n${dataProj}\nSkills:\n${dataSkills}\nWork Experience:\n${dataWork}`;
            }

            currentGenStatus = "Pass 2: AI actively converting your targeting metrics into robust LaTeX formatting...";
            // 3. Build Pipeline: Pass 2 (LaTeX Compilation)
            const aiPrompt = `
You are an expert ATS Resume Builder acting as a backend API utility. Your task is to output a fully valid LaTeX file tailored to the user's TARGET JOB DESCRIPTION accurately using ONLY the Data files.
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
IMPORTANT: In the header block of the template, you will find personal identity placeholders mapping to the Profile Information section (like \`[Candidate Name]\` or \`[Location]\` or \`[LinkedIn URL]\`). Replace these tightly with the exact Profile Information context above.
Additionally, you will see a placeholder named \`[Suggested Job Title based on JD]\`. You MUST synthesize a compelling, short Role Title mapping directly to the Target Job Description and the candidate's core competencies to fill this placeholder natively! Make the synthesized title look like a generic industry title (e.g "Software Engineer | Backend Systems")!

CRITICAL FORMATTING INSTRUCTION:
The Optimized User Data natively contains markdown bold tags mapped like \`**keyword**\`. 
When injecting these structural points into the LaTeX Document, you MUST convert EVERY SINGLE markdown bold block into native LaTeX bolding: \`\\textbf{keyword}\`! 
DO NOT STRIP OUT THE BOLD METRICS! Preserving the highlighted metrics natively via \`\\textbf{}\` is an absolute requirement for successful ATS tracking algorithms!
STRICT SKILLS FORMATTING: Individual skills MUST NEVER be bolded in the Skills section! ONLY the category headings should be bold. Do NOT wrap individual skill names in \`\\textbf{}\`.
STRICT CONTENT LOCK: Do NOT rewrite, paraphrase, optimize, or invent any resume bullet text. Use the candidate content exactly as provided. You may choose which existing items to include in the template, but their wording must remain unchanged.

${templateText}
`;

            const coverLetterPrompt = `
You are an expert personalized Cover Letter writer.
You must use ONLY the JD and candidate data included below.
You must IGNORE any prior resumes, PDFs, TeX files, previous candidates, generated history, or assumptions from earlier runs.

=== STRICT RULES ===
${clRuleText}

=== TARGET JOB DESCRIPTION ===
${prompt}

=== CANDIDATE PROFILE (Use this identity exactly to sign the letter) ===
${dataProfile}

=== CANDIDATE OPTIMIZED EXPERIENCE ===
${optimizedExperience}

=== INSTRUCTIONS ===
Draft a strict 300-400 word highly targeted Cover Letter explaining why this specific candidate is the perfect fit. Do NOT use fake placeholders. Use today's date (${new Date().toLocaleDateString()}). Return ONLY the raw Cover Letter text, no conversational filler or markdown code blocks!
`;

            // 4. Call Gemini API (Pass 2 & Pass 2B Parallel Threads)
            currentGenStatus = "Compiling valid LaTeX structures while actively drafting human-like Cover Letter natively in absolute parallel threads...";
            const reqPass2 = fetch(getGeminiUrl(model, apiKey), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: aiPrompt }] }] })
            });

            const reqPass2B = fetch(getGeminiUrl(model, apiKey), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: coverLetterPrompt }] }] })
            });

            const [geminiRes, clRes] = await Promise.all([reqPass2, reqPass2B]);

            if (!geminiRes.ok) {
               const error = await geminiRes.text();
               throw new Error(`Gemini API Error: ${error}`);
            }

            const geminiData = await geminiRes.json();
            let aiText = geminiData.candidates[0].content.parts[0].text;
            aiText = aiText.replace(/^```latex\n/g, '').replace(/\n```$/g, '');

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

            let coverLetterText = "";
            if (clRes.ok) {
               const clData = await clRes.json();
               coverLetterText = clData.candidates[0]?.content?.parts[0]?.text || "";
               coverLetterText = coverLetterText.replace(/^```text\n/i, '').replace(/\n```$/g, '');
            }

            // 5. Parse Filename
            let filename = "Generated_Resume";
            const firstLineBreak = aiText.indexOf('\n');
            const firstLine = aiText.substring(0, firstLineBreak);
            if (firstLine.startsWith("FILENAME:")) {
               filename = firstLine.replace("FILENAME:", "").trim().replace('.tex', '').replace(/[^a-zA-Z0-9_-]/g, '_');
               aiText = aiText.substring(firstLineBreak + 1).trim();
            }

            // 6. Compilation
            const exec = require('child_process').exec;
            
            currentGenStatus = "Compiling generated LaTeX syntax to PDF locally...";
            const texPath = path.join(basePath, 'Tex_Files', `${filename}.tex`);
            fs.writeFileSync(texPath, aiText, 'utf-8');

            exec(`pdflatex -interaction=nonstopmode "${filename}.tex"`, { cwd: path.join(basePath, 'Tex_Files') }, (err, stdout, stderr) => {
               // File system cleanup
               const genPdfPath = path.join(basePath, 'Tex_Files', `${filename}.pdf`);
               const finalPdfPath = path.join(basePath, 'PDFs', `${filename}.pdf`);
               
               if (fs.existsSync(genPdfPath)) {
                  fs.renameSync(genPdfPath, finalPdfPath);
               }

               // Cover Letter Saving
               const clDir = path.join(basePath, 'Cover_Letters');
               if (!fs.existsSync(clDir)) {
                  fs.mkdirSync(clDir, { recursive: true });
               }
               const clTextFile = path.join(clDir, `${filename}_Cover_Letter.txt`);
               fs.writeFileSync(clTextFile, coverLetterText, 'utf-8');
               cleanupLatexArtifacts(path.join(basePath, 'Tex_Files'), filename);

               // Respond success regardless of pdflatex warning squiggles
               res.setHeader('Content-Type', 'application/json');
               res.end(JSON.stringify({ 
                  success: true, 
                  filename: `${filename}.pdf`, 
                  metrics: pass1Metrics, 
                  coverLetter: coverLetterText 
               }));
               currentGenStatus = "Idle";
            });
            currentGenStatus = "Idle";

          } catch (e) {
            currentGenStatus = "Idle";
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
        return;
      }
      
      next();
    });
  }
});

export default defineConfig({
  plugins: [react(), API_PLUGIN()],
})
