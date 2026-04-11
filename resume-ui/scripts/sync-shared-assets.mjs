import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(projectRoot, '..');
const sharedAssetsRoot = path.join(projectRoot, 'shared-assets');

const copies = [
  {
    from: path.join(repoRoot, 'Templates'),
    to: path.join(sharedAssetsRoot, 'Templates')
  },
  {
    from: path.join(repoRoot, '.agent'),
    to: path.join(sharedAssetsRoot, '.agent')
  }
];

fs.rmSync(sharedAssetsRoot, { recursive: true, force: true });
fs.mkdirSync(sharedAssetsRoot, { recursive: true });

for (const entry of copies) {
  if (!fs.existsSync(entry.from)) {
    throw new Error(`Shared asset source not found: ${entry.from}`);
  }

  fs.cpSync(entry.from, entry.to, {
    recursive: true,
    force: true
  });
}

console.log(`Synced shared assets into ${sharedAssetsRoot}`);
