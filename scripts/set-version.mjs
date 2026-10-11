import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error('Usage: node scripts/set-version.mjs <semver>');
  process.exit(1);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Every manifest that carries a version: the portable Agent Plugins 1.0 manifest,
// the pre-Agent-Plugins VS Code compatibility manifest, and one per client that needs
// its own schema. Kept strict on purpose — a missing manifest must fail the release.
const targets = [
  'plugins/skraft-framework/plugin.json',
  'plugins/skraft-framework/.claude-plugin/plugin.json',
  'plugins/skraft-framework/.codex-plugin/plugin.json',
  'plugins/skraft-framework/src/package.json',
  // skraft-backlog ships in lockstep with the engineering plugin: one release, one tag.
  'plugins/skraft-backlog/plugin.json',
  'plugins/skraft-backlog/.claude-plugin/plugin.json',
  'plugins/skraft-backlog/.codex-plugin/plugin.json',
];

// Text files that carry the version for a reader that cannot open a manifest: the
// refinement marker and the skraft-refine workflow compare it to decide whether to redo work.
const stamped = [
  ['plugins/skraft-backlog/skills/refinement-proposal/scripts/version.mjs', /export const VERSION = '[^']*'/, `export const VERSION = '${version}'`],
  ['plugins/skraft-backlog/workflows/skraft-refine.md', /SKRAFT_BACKLOG_VERSION: "[^"]*"/, `SKRAFT_BACKLOG_VERSION: "${version}"`],
  // The skills the workflow installs, pinned to the release tag that ships this workflow.
  ['plugins/skraft-backlog/workflows/skraft-refine.md', /(\/plugins\/skraft-backlog\/skills\/[\w-]+)#v[^\s]+/g, `$1#v${version}`],
];

for (const [rel, pattern, replacement] of stamped) {
  const path = join(repoRoot, rel);
  const text = readFileSync(path, 'utf8');
  if (!pattern.test(text)) {
    console.error(`no version to stamp in ${rel}`);
    process.exit(1);
  }
  pattern.lastIndex = 0;
  writeFileSync(path, text.replace(pattern, replacement));
  console.log(`set version ${version} in ${rel}`);
}

for (const rel of targets) {
  const path = join(repoRoot, rel);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  json.version = version;
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
  console.log(`set version ${version} in ${rel}`);
}
