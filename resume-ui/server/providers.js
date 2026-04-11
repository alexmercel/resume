import { Buffer } from 'buffer';

const GOOGLE_DEFAULT_MODELS = [
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite'
];

const OPENAI_DEFAULT_MODELS = [
  'gpt-5.4-mini',
  'gpt-5.4',
  'gpt-5.3-codex',
  'gpt-5.2'
];

const ANTHROPIC_DEFAULT_MODELS = [
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-opus-4-5-20251101'
];

export const PROVIDERS = [
  {
    id: 'google',
    name: 'Google Gemini',
    envKey: 'GOOGLE_AI_API_KEY',
    defaultModel: GOOGLE_DEFAULT_MODELS[1],
    models: GOOGLE_DEFAULT_MODELS
  },
  {
    id: 'openai',
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    defaultModel: OPENAI_DEFAULT_MODELS[0],
    models: OPENAI_DEFAULT_MODELS
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: ANTHROPIC_DEFAULT_MODELS[0],
    models: ANTHROPIC_DEFAULT_MODELS
  }
];

const PROVIDER_MAP = new Map(PROVIDERS.map((provider) => [provider.id, provider]));

function requireApiKey(apiKey, providerName) {
  const trimmed = String(apiKey || '').trim();
  if (!trimmed) {
    throw new Error(`No ${providerName} API key is configured for this account.`);
  }
  return trimmed;
}

function getGoogleGenerateUrl(model, apiKey) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

function getGoogleModelsUrl(apiKey) {
  return `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
}

async function googleGenerateText({ apiKey, model, prompt }) {
  const key = requireApiKey(apiKey, 'Google Gemini');
  const response = await fetch(getGoogleGenerateUrl(model, key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Gemini request failed.');
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

async function googleGenerateWithInlineFile({ apiKey, model, prompt, mimeType, data }) {
  const key = requireApiKey(apiKey, 'Google Gemini');
  const response = await fetch(getGoogleGenerateUrl(model, key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data
            }
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Gemini inline file request failed.');
  }

  const result = await response.json();
  return result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

async function googleListModels(apiKey) {
  const key = requireApiKey(apiKey, 'Google Gemini');
  const response = await fetch(getGoogleModelsUrl(key));
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to list Gemini models.');
  }

  const data = await response.json();
  const items = Array.isArray(data.models) ? data.models : [];
  return items
    .filter((item) => {
      const actions = item.supportedActions || item.supportedGenerationMethods || [];
      return actions.some((action) => /generatecontent/i.test(action));
    })
    .map((item) => ({
      id: String(item.name || '').replace(/^models\//, ''),
      name: String(item.displayName || item.name || '').replace(/^models\//, ''),
      description: item.description || '',
      contextWindow: item.inputTokenLimit || null
    }))
    .filter((item) => item.id);
}

async function openAiGenerateText({ apiKey, model, prompt }) {
  const key = requireApiKey(apiKey, 'OpenAI');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: prompt
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'OpenAI request failed.');
  }

  const data = await response.json();
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const messageChunk = Array.isArray(data.output)
    ? data.output
        .flatMap((item) => Array.isArray(item.content) ? item.content : [])
        .find((item) => item.type === 'output_text' || item.type === 'text')
    : null;

  return messageChunk?.text?.trim() || '';
}

async function openAiListModels(apiKey) {
  const key = requireApiKey(apiKey, 'OpenAI');
  const response = await fetch('https://api.openai.com/v1/models', {
    headers: {
      Authorization: `Bearer ${key}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to list OpenAI models.');
  }

  const data = await response.json();
  const items = Array.isArray(data.data) ? data.data : [];
  return items
    .map((item) => ({
      id: item.id,
      name: item.id,
      description: item.owned_by || '',
      contextWindow: null
    }))
    .filter((item) => item.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function anthropicGenerateText({ apiKey, model, prompt }) {
  const key = requireApiKey(apiKey, 'Anthropic');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Anthropic request failed.');
  }

  const data = await response.json();
  const textParts = Array.isArray(data.content)
    ? data.content.filter((item) => item.type === 'text').map((item) => item.text)
    : [];
  return textParts.join('\n').trim();
}

async function anthropicListModels(apiKey) {
  const key = requireApiKey(apiKey, 'Anthropic');
  const response = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to list Anthropic models.');
  }

  const data = await response.json();
  const items = Array.isArray(data.data) ? data.data : [];
  return items
    .map((item) => ({
      id: item.id,
      name: item.display_name || item.id,
      description: item.type || '',
      contextWindow: item.context_window || null
    }))
    .filter((item) => item.id);
}

export function getProvider(providerId) {
  return PROVIDER_MAP.get(String(providerId || '').trim().toLowerCase()) || PROVIDER_MAP.get('google');
}

export function listProviders() {
  return PROVIDERS.map((provider) => ({ ...provider }));
}

export function getDefaultModelForProvider(providerId) {
  return getProvider(providerId).defaultModel;
}

export function getFallbackModels(providerId) {
  return [...getProvider(providerId).models];
}

export async function listModelsForProvider({ providerId, apiKey }) {
  const provider = getProvider(providerId);
  if (provider.id === 'google') return googleListModels(apiKey);
  if (provider.id === 'openai') return openAiListModels(apiKey);
  return anthropicListModels(apiKey);
}

export async function generateTextWithProvider({ providerId, apiKey, model, prompt }) {
  const provider = getProvider(providerId);
  if (provider.id === 'google') return googleGenerateText({ apiKey, model, prompt });
  if (provider.id === 'openai') return openAiGenerateText({ apiKey, model, prompt });
  return anthropicGenerateText({ apiKey, model, prompt });
}

export async function generateWithUploadedResume({
  providerId,
  apiKey,
  model,
  prompt,
  mimeType,
  base64Data,
  fileName
}) {
  const provider = getProvider(providerId);
  if (provider.id === 'google') {
    return googleGenerateWithInlineFile({
      apiKey,
      model,
      prompt,
      mimeType,
      data: base64Data
    });
  }

  const normalizedMimeType = String(mimeType || '').toLowerCase();
  const looksTextLike = normalizedMimeType.startsWith('text/')
    || /\.md$/i.test(fileName || '')
    || /\.txt$/i.test(fileName || '');

  if (!looksTextLike) {
    throw new Error(
      'Resume import with PDF or DOC content currently requires Google Gemini. For OpenAI or Anthropic, upload a text or markdown resume for onboarding.'
    );
  }

  const text = Buffer.from(base64Data, 'base64').toString('utf-8');
  return generateTextWithProvider({
    providerId: provider.id,
    apiKey,
    model,
    prompt: `${prompt}\n\n=== UPLOADED RESUME CONTENT ===\n${text}`
  });
}
