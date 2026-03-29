import path from 'path';
import { fileURLToPath } from 'url';
import { ensureOpportunitiesCacheDir, getOpportunitiesPayload } from '../opportunities.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cachePath = path.resolve(__dirname, '..', 'opportunities-cache.json');

async function main() {
  ensureOpportunitiesCacheDir(cachePath);
  const payload = await getOpportunitiesPayload({
    forceRefresh: true,
    cachePath
  });

  console.log(`Refreshed ${payload.opportunities.length} opportunities from ${payload.sources.length} sources.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
