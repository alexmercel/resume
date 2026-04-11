import path from 'path';
import { fileURLToPath } from 'url';
import { createRequestHandler } from '../server/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const basePath = path.resolve(__dirname, '..', '..');

const handler = createRequestHandler({ basePath });

export const config = {
  runtime: 'nodejs'
};

export default async function vercelApiHandler(req, res) {
  const currentUrl = new URL(req.url || '/', 'http://localhost');
  const queryPath = currentUrl.searchParams.get('path') || currentUrl.searchParams.get('__pathname') || '';
  const rawPath = Array.isArray(req.query?.path)
    ? req.query.path.join('/')
    : String(req.query?.path || queryPath || '').trim();

  if (rawPath) {
    currentUrl.searchParams.delete('path');
    currentUrl.searchParams.delete('__pathname');
    const normalizedPath = rawPath.replace(/^\/+/, '');
    const resolvedPath = normalizedPath.startsWith('api/')
      ? `/${normalizedPath}`
      : `/api/${normalizedPath}`;
    req.url = `${resolvedPath}${currentUrl.search || ''}`;
  }

  await handler(req, res);
}
