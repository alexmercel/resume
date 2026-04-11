import fs from 'fs';
import path from 'path';
import process from 'process';

function parseEnvFile(content) {
  const parsed = {};
  const lines = String(content || '').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    let [, key, value] = match;
    value = value.trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

export function loadAppEnv(appDir) {
  const envFiles = [
    path.join(appDir, '.env'),
    path.join(appDir, '.env.local'),
    path.join(appDir, '.env.development'),
    path.join(appDir, '.env.production')
  ];

  const fileEnv = {};
  for (const filePath of envFiles) {
    if (!fs.existsSync(filePath)) continue;
    Object.assign(fileEnv, parseEnvFile(fs.readFileSync(filePath, 'utf-8')));
  }

  return {
    ...fileEnv,
    ...process.env
  };
}
