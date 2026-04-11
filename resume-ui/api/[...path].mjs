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
  const rawPath = Array.isArray(req.query?.path)
    ? req.query.path.join('/')
    : String(req.query?.path || '').trim();

  if (rawPath) {
    const currentUrl = new URL(req.url || '/', 'http://localhost');
    currentUrl.searchParams.delete('path');
    const normalizedPath = rawPath.replace(/^\/+/, '');
    req.url = `/api/${normalizedPath}${currentUrl.search || ''}`;
  }

  await handler(req, res);
}
