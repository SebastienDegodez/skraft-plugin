import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error('Usage: node scripts/set-version.mjs <semver>');
  process.exit(1);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Every manifest that carries a version: the portable Agent Plugins 1.0 manifest
// plus one per client that needs its own schema. Kept strict on purpose — a missing
// manifest must fail the release rather than silently ship a stale version.
const targets = [
  'plugins/skraft-framework/plugin.json',
  'plugins/skraft-framework/.claude-plugin/plugin.json',
  'plugins/skraft-framework/.codex-plugin/plugin.json',
  'plugins/skraft-framework/.cursor-plugin/plugin.json',
  'plugins/skraft-framework/src/package.json',
];

for (const rel of targets) {
  const path = join(repoRoot, rel);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  json.version = version;
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
  console.log(`set version ${version} in ${rel}`);
}
