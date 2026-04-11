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
  await handler(req, res);
}
