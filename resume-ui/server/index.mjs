import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { createRequestHandler } from './api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appDir, '..');
const distDir = path.join(appDir, 'dist');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function sendFile(res, filePath) {
  const stat = fs.statSync(filePath);
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath)] || 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  fs.createReadStream(filePath).pipe(res);
}

function resolveStaticPath(urlPath) {
  const cleanPath = decodeURIComponent(String(urlPath || '/').split('?')[0]);
  const relativePath = cleanPath === '/' ? 'index.html' : cleanPath.replace(/^\/+/, '');
  const resolvedPath = path.resolve(distDir, relativePath);
  if (!resolvedPath.startsWith(path.resolve(distDir) + path.sep) && resolvedPath !== path.resolve(distDir)) {
    return null;
  }
  return resolvedPath;
}

const apiHandler = createRequestHandler({ basePath: repoRoot });

const server = http.createServer(async (req, res) => {
  if (req.url?.startsWith('/api/')) {
    await apiHandler(req, res);
    return;
  }

  if (!fs.existsSync(distDir)) {
    res.statusCode = 500;
    res.end('Frontend build not found. Run "npm run build" first.');
    return;
  }

  const candidatePath = resolveStaticPath(req.url);
  if (candidatePath && fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
    sendFile(res, candidatePath);
    return;
  }

  const fallbackIndex = path.join(distDir, 'index.html');
  if (fs.existsSync(fallbackIndex)) {
    sendFile(res, fallbackIndex);
    return;
  }

  res.statusCode = 404;
  res.end('Not found');
});

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => {
  console.log(`Resume Builder Studio server running on http://${host}:${port}`);
});
