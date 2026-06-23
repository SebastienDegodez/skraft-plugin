#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const DEFAULT_IGNORES = new Set([
  '.git',
  'node_modules',
  '.jekyll-cache',
  '_site',
  'bin',
  'obj',
  'dist',
  'out',
  '.DS_Store',
]);

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.mdx',
  '.txt',
  '.yml',
  '.yaml',
  '.json',
  '.cs',
  '.ts',
  '.js',
  '.mjs',
  '.xml',
]);

function printHelp() {
  console.log(`migrate-adr-layout.mjs

Usage:
  node scripts/migrate-adr-layout.mjs --repo <path> [--repo <path> ...] --renumber-global [--apply]

Options:
  --repo <path>    Repository root to process. Repeatable.
  --renumber-global Mandatory. Renumber ADR filenames to a single global sequence (adr-001..N).
  --apply          Apply changes. Without this flag, script runs in dry-run mode.
  --include <glob> Optional substring filter for text file processing; repeatable.
  --help           Show this help.

What it does:
  1) Rewrites ADR references from per-run adrs paths to docs/adr paths.
  2) Normalizes ADR filenames in references to lowercase (adr-xxx.md).
  3) Moves ADR files from .copilot-tracking/skraft-plans/*/adrs/*.md to docs/adr/*.md.
  4) Renumbers moved ADR files globally when --renumber-global is enabled.
  4) Merges supersession registries into docs/adr/supersessions.md.

Safety:
  - Dry-run by default.
  - If target ADR file already exists with different content, file is not moved and collision is reported.
`);
}

function parseArgs(argv) {
  const repos = [];
  const includeFilters = [];
  let apply = false;
  let renumberGlobal = false;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--repo') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --repo');
      }
      repos.push(value);
      i += 1;
    } else if (a === '--include') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --include');
      }
      includeFilters.push(value);
      i += 1;
    } else if (a === '--apply') {
      apply = true;
    } else if (a === '--renumber-global') {
      renumberGlobal = true;
    } else if (a === '--help' || a === '-h') {
      return { help: true };
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }

  if (repos.length === 0) {
    throw new Error('At least one --repo is required');
  }

  if (!renumberGlobal) {
    throw new Error('--renumber-global is required');
  }

  return { help: false, repos, apply, includeFilters, renumberGlobal };
}

function sha(text) {
  return createHash('sha256').update(text).digest('hex');
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath, apply) {
  if (!apply) {
    return;
  }
  await fs.mkdir(dirPath, { recursive: true });
}

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) {
    return true;
  }
  return filePath.endsWith('.agent.md') || filePath.endsWith('.instructions.md') || filePath.endsWith('.prompt.md');
}

async function walk(dirPath, out) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (DEFAULT_IGNORES.has(entry.name)) {
      continue;
    }
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
}

function normalizeAdrFilenameSegment(segment) {
  return segment.replace(/ADR-([A-Za-z0-9{}*-]+\.md)/g, (_m, p1) => `adr-${p1.toLowerCase()}`);
}

function rewriteContentWithAdrMap(content, adrMap) {
  let next = content;
  for (const [oldName, newName] of adrMap.entries()) {
    const oldUpper = oldName.toUpperCase();
    const oldBase = oldName.replace(/\.md$/i, '');
    const newBase = newName.replace(/\.md$/i, '');

    // Path-like references
    next = next.replaceAll(`/adrs/${oldName}`, `/docs/adr/${newName}`);
    next = next.replaceAll(`/docs/adr/${oldName}`, `/docs/adr/${newName}`);
    next = next.replaceAll(`adrs/${oldName}`, `docs/adr/${newName}`);
    next = next.replaceAll(`docs/adr/${oldName}`, `docs/adr/${newName}`);

    // Markdown relative links
    next = next.replaceAll(`(./${oldName})`, `(./${newName})`);

    // In-text ADR ids (e.g. ADR-007)
    const oldNumber = oldBase.match(/^adr-(\d{3})-/i)?.[1];
    const newNumber = newBase.match(/^adr-(\d{3})-/i)?.[1];
    if (oldNumber && newNumber) {
      next = next.replaceAll(`ADR-${oldNumber}`, `ADR-${newNumber}`);
    }

    // Template-like path variants in uppercase
    next = next.replaceAll(`/adrs/${oldUpper}`, `/docs/adr/${newName}`);
    next = next.replaceAll(`adrs/${oldUpper}`, `docs/adr/${newName}`);
  }
  return next;
}

function rewriteAdrReferences(content, adrMap) {
  let next = content;

  next = next.replace(/\.copilot-tracking\/skraft-plans\/\{projectSlug\}\/adrs\//g, 'docs/adr/');
  next = next.replace(/\.copilot-tracking\/skraft-plans\/\{project-slug\}\/adrs\//g, 'docs/adr/');
  next = next.replace(/\.copilot-tracking\/skraft-plans\/\{slug\}\/adrs\//g, 'docs/adr/');

  next = next.replace(/\.copilot-tracking\/skraft-plans\/[^/\s`]+\/adrs\//g, 'docs/adr/');
  next = next.replace(/\badrs\/supersessions\.md\b/g, 'docs/adr/supersessions.md');

  next = next.replace(/\badrs\/(ADR-[A-Za-z0-9{}*-]+\.md)\b/g, (_m, file) => `docs/adr/${file.toLowerCase()}`);
  next = next.replace(/\bdocs\/adr\/(ADR-[A-Za-z0-9{}*-]+\.md)\b/g, (_m, file) => `docs/adr/${file.toLowerCase()}`);

  next = next.replace(/\b(adrs\/ADR-\*\.md)\b/g, 'docs/adr/adr-*.md');
  next = next.replace(/\b(adrs\/ADR-\{NNN\}-\{slug\}\.md)\b/g, 'docs/adr/adr-{NNN}-{slug}.md');

  next = next.replace(/\(\.\/ADR-([A-Za-z0-9-]+\.md)\)/g, (_m, file) => `(./adr-${file.toLowerCase()})`);

  if (adrMap && adrMap.size > 0) {
    next = rewriteContentWithAdrMap(next, adrMap);
  }

  return next;
}

async function rewriteTextFiles(repoRoot, apply, includeFilters, adrMap) {
  const allFiles = [];
  await walk(repoRoot, allFiles);

  let changed = 0;
  let scanned = 0;

  for (const filePath of allFiles) {
    const rel = path.relative(repoRoot, filePath).split(path.sep).join('/');

    // Never rewrite the migration utility itself.
    if (rel === 'scripts/migrate-adr-layout.mjs') {
      continue;
    }

    if (!isTextFile(filePath)) {
      continue;
    }

    if (includeFilters.length > 0 && !includeFilters.some((f) => rel.includes(f))) {
      continue;
    }

    scanned += 1;

    const raw = await fs.readFile(filePath, 'utf8');
    const next = rewriteAdrReferences(raw, adrMap);

    if (next !== raw) {
      changed += 1;
      if (apply) {
        await fs.writeFile(filePath, next, 'utf8');
      }
      console.log(`  ${apply ? 'UPDATED' : 'WOULD UPDATE'} ${rel}`);
    }
  }

  return { scanned, changed };
}

async function findAdrSources(repoRoot) {
  const base = path.join(repoRoot, '.copilot-tracking', 'skraft-plans');
  if (!(await exists(base))) {
    return { adrs: [], supersessions: [] };
  }

  const adrs = [];
  const supersessions = [];

  const projectSlugs = await fs.readdir(base, { withFileTypes: true });
  for (const slugEntry of projectSlugs) {
    if (!slugEntry.isDirectory()) {
      continue;
    }
    const adrDir = path.join(base, slugEntry.name, 'adrs');
    if (!(await exists(adrDir))) {
      continue;
    }
    const files = await fs.readdir(adrDir, { withFileTypes: true });
    for (const fileEntry of files) {
      if (!fileEntry.isFile()) {
        continue;
      }
      if (!fileEntry.name.toLowerCase().endsWith('.md')) {
        continue;
      }
      const full = path.join(adrDir, fileEntry.name);
      if (fileEntry.name.toLowerCase() === 'supersessions.md') {
        supersessions.push(full);
      } else {
        adrs.push(full);
      }
    }
  }

  return { adrs, supersessions };
}

function normalizeAdrTargetName(sourceName) {
  return normalizeAdrFilenameSegment(sourceName).toLowerCase();
}

async function mergeSupersessions(repoRoot, sourceFiles, apply, adrMap) {
  const targetDir = path.join(repoRoot, 'docs', 'adr');
  const target = path.join(targetDir, 'supersessions.md');

  const all = [];
  if (await exists(target)) {
    all.push(target);
  }
  all.push(...sourceFiles);

  if (all.length === 0) {
    return { merged: false, lines: 0 };
  }

  const rows = [];
  for (const filePath of all) {
    const content = rewriteContentWithAdrMap(await fs.readFile(filePath, 'utf8'), adrMap);
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('|')) {
        continue;
      }
      if (trimmed === '|---|---|---|---|') {
        continue;
      }
      if (/^\|\s*date\s*\|/i.test(trimmed)) {
        continue;
      }
      rows.push(trimmed);
    }
  }

  const uniqueRows = [...new Set(rows)];

  const output = [
    '<!-- markdownlint-disable-file -->',
    '# ADR supersession registry (append-only)',
    '',
    '| date | superseded ADR | new ADR | reason |',
    '|---|---|---|---|',
    ...uniqueRows,
    '',
  ].join('\n');

  const shouldWrite = !(await exists(target)) || (await fs.readFile(target, 'utf8')) !== output;

  if (shouldWrite) {
    console.log(`  ${apply ? 'UPDATED' : 'WOULD UPDATE'} docs/adr/supersessions.md`);
    if (apply) {
      await ensureDir(targetDir, true);
      await fs.writeFile(target, output, 'utf8');
    }
  }

  return { merged: true, lines: uniqueRows.length };
}

async function buildAdrRenumberPlan(repoRoot) {
  const { adrs } = await findAdrSources(repoRoot);

  const parsed = [];
  for (const src of adrs) {
    const srcName = path.basename(src).toLowerCase();
    const match = srcName.match(/^adr-(\d{3})-(.+)\.md$/);
    if (!match) {
      continue;
    }
    const [, oldNum, slug] = match;
    parsed.push({ src, srcName, oldNum: Number(oldNum), slug });
  }

  parsed.sort((a, b) => {
    if (a.oldNum !== b.oldNum) return a.oldNum - b.oldNum;
    return a.src.localeCompare(b.src);
  });

  const bySlug = new Map();
  const adrMap = new Map();
  let cursor = 1;

  for (const item of parsed) {
    if (bySlug.has(item.slug)) {
      adrMap.set(item.srcName, bySlug.get(item.slug));
      continue;
    }
    const newName = `adr-${String(cursor).padStart(3, '0')}-${item.slug}.md`;
    bySlug.set(item.slug, newName);
    adrMap.set(item.srcName, newName);
    cursor += 1;
  }

  return { adrMap, total: parsed.length };
}

async function moveAdrFiles(repoRoot, apply, adrMap) {
  const { adrs, supersessions } = await findAdrSources(repoRoot);
  const targetDir = path.join(repoRoot, 'docs', 'adr');

  let moved = 0;
  let skipped = 0;
  let collisions = 0;

  await ensureDir(targetDir, apply);

  for (const src of adrs) {
    const srcName = path.basename(src).toLowerCase();
    const targetName = adrMap.get(srcName) ?? normalizeAdrTargetName(srcName);
    const dst = path.join(targetDir, targetName);

    const srcContent = await fs.readFile(src, 'utf8');
    const normalizedContent = rewriteContentWithAdrMap(
      srcContent.replace(/\(\.\/ADR-([A-Za-z0-9-]+\.md)\)/g, (_m, file) => `(./adr-${file.toLowerCase()})`),
      adrMap,
    );

    if (await exists(dst)) {
      const dstContent = await fs.readFile(dst, 'utf8');
      if (sha(dstContent) === sha(normalizedContent)) {
        skipped += 1;
        if (apply) {
          await fs.rm(src);
        }
        console.log(`  ${apply ? 'REMOVED DUP' : 'WOULD REMOVE DUP'} ${path.relative(repoRoot, src)}`);
        continue;
      }

      collisions += 1;
      console.log(`  COLLISION ${path.relative(repoRoot, src)} -> docs/adr/${targetName}`);
      continue;
    }

    moved += 1;
    console.log(`  ${apply ? 'MOVED' : 'WOULD MOVE'} ${path.relative(repoRoot, src)} -> docs/adr/${targetName}`);

    if (apply) {
      await fs.writeFile(dst, normalizedContent, 'utf8');
      await fs.rm(src);
    }
  }

  const supersessionResult = await mergeSupersessions(repoRoot, supersessions, apply, adrMap);

  if (apply) {
    for (const src of supersessions) {
      if (await exists(src)) {
        await fs.rm(src);
      }
    }
  }

  return {
    sourceAdrCount: adrs.length,
    sourceSupersessionsCount: supersessions.length,
    moved,
    skipped,
    collisions,
    supersessionResult,
  };
}

async function processRepo(repoArg, apply, includeFilters) {
  const repoRoot = path.resolve(repoArg);

  if (!(await exists(repoRoot))) {
    throw new Error(`Repo not found: ${repoRoot}`);
  }

  console.log(`\n==> ${apply ? 'APPLY' : 'DRY-RUN'} ${repoRoot}`);

  const renumber = await buildAdrRenumberPlan(repoRoot);
  const rewriteStats = await rewriteTextFiles(repoRoot, apply, includeFilters, renumber.adrMap);
  const moveStats = await moveAdrFiles(repoRoot, apply, renumber.adrMap);

  return { repoRoot, rewriteStats, moveStats, renumberTotal: renumber.total };
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      return;
    }

    const summaries = [];

    for (const repo of args.repos) {
      summaries.push(await processRepo(repo, args.apply, args.includeFilters));
    }

    console.log('\n=== SUMMARY ===');
    for (const s of summaries) {
      console.log(`- ${s.repoRoot}`);
      console.log(`  adr renumber candidates: ${s.renumberTotal}`);
      console.log(`  text scanned: ${s.rewriteStats.scanned}`);
      console.log(`  text updated: ${s.rewriteStats.changed}`);
      console.log(`  source ADR files: ${s.moveStats.sourceAdrCount}`);
      console.log(`  moved ADR files: ${s.moveStats.moved}`);
      console.log(`  duplicate ADR files removed: ${s.moveStats.skipped}`);
      console.log(`  collisions: ${s.moveStats.collisions}`);
      console.log(`  source supersessions files: ${s.moveStats.sourceSupersessionsCount}`);
      if (s.moveStats.supersessionResult.merged) {
        console.log(`  merged supersession rows: ${s.moveStats.supersessionResult.lines}`);
      }
    }

    if (!args.apply) {
      console.log('\nDry-run complete. Re-run with --apply to write changes.');
    }
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

await main();
