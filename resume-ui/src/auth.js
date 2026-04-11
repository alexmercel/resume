import { createClient } from '@supabase/supabase-js';

const SESSION_STORAGE_KEY = 'resume-builder-supabase-session';

let browserSupabaseClient = null;
let browserSupabaseConfigKey = '';
let fetchInterceptorInstalled = false;

export function getStoredSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredSession(session) {
  try {
    if (!session) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore local storage failures.
  }
}

export function clearStoredSession() {
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore local storage failures.
  }
}

export function getStoredAccessToken() {
  return getStoredSession()?.access_token || '';
}

export function installApiFetchInterceptor() {
  if (fetchInterceptorInstalled || typeof window === 'undefined') return;
  fetchInterceptorInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const requestUrl = typeof input === 'string' ? input : input?.url || '';
    if (!requestUrl.startsWith('/api/')) {
      return originalFetch(input, init);
    }

    const accessToken = getStoredAccessToken();
    if (!accessToken) {
      return originalFetch(input, init);
    }

    const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined) || {});
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    return originalFetch(input, {
      ...init,
      headers
    });
  };
}

export function getBrowserSupabaseClient(config) {
  if (!config?.url || !config?.anonKey) return null;
  const nextKey = `${config.url}::${config.anonKey}`;
  if (browserSupabaseClient && browserSupabaseConfigKey === nextKey) {
    return browserSupabaseClient;
  }

  browserSupabaseConfigKey = nextKey;
  browserSupabaseClient = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return browserSupabaseClient;
}
