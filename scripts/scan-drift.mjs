// scripts/scan-drift.mjs
//
// Deterministic three-way diff for the SKRAFT handbook: contract (book.yml) vs
// files (docs/site/{fr,en}/**) vs sources (plugins/**, .agents/**). Emits a drift
// ledger (JSON) that the docs reconciler agent chain consumes — ONE item per
// drift, each with the context a worker needs to repair it.
//
// This script exists so that drift DETECTION is a deterministic tool call, not an
// LLM assertion. The agents REPAIR; this script DECIDES what is broken.
//
// Usage:
//   node scripts/scan-drift.mjs [--book docs/site/_data/book.yml] [--root .]
//                               [--site-root docs/site] [--out path] [--empty-threshold 4]
//
// Path bases: `source:` globs resolve from --root (repo root); page `fr:`/`en:`
// paths resolve from --site-root (where the Jekyll site lives).
//
// Output: a JSON object { generatedAt, root, summary, items[] } on stdout (or --out).
// Exit code: 0 when no drift, 1 when drift was found (so CI can branch), 2 on usage error.

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { loadBook, iterPages, findFiles, sectionsOf, pagesOfSection, parseYaml } from './lib/book.mjs';

const SEVERITY = { blocker: 0, high: 1, medium: 2, low: 3 };

/** Read a page file and split frontmatter from body. */
function readPage(absPath) {
  if (!existsSync(absPath)) return null;
  const raw = readFileSync(absPath, 'utf-8');
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (fmMatch) return { frontmatter: fmMatch[1], body: fmMatch[2] };
  return { frontmatter: '', body: raw };
}

/** Count meaningful (non-blank, non-comment) body lines. */
function contentLines(body) {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('<!--')).length;
}

function makeItem(items, item) {
  items.push({
    id: `drift-${String(items.length + 1).padStart(4, '0')}`,
    owner: null,
    state: 'open',
    ...item,
  });
}

function readFrontmatter(absPath) {
  if (!existsSync(absPath)) return null;
  const raw = readFileSync(absPath, 'utf-8');
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fm) return null;
  try {
    return parseYaml(fm[1]);
  } catch {
    return null;
  }
}

function extractAgentLinksInOrder(markdownBody, expected) {
  const found = [];
  const seen = new Set();
  const re = /\((?:[a-z]{2}\/reference\/agents\/)?([a-z0-9-]+)(?:\.html)?(?:\s*\|\s*relative_url)?\)/gi;
  let match;
  while ((match = re.exec(markdownBody)) !== null) {
    const slug = match[1];
    if (!expected.includes(slug) || seen.has(slug)) continue;
    seen.add(slug);
    found.push(slug);
  }
  return found;
}

function extractSkillSections(markdownBody) {
  const order = [];
  const bySection = {};
  let current = null;

  for (const line of markdownBody.split('\n')) {
    if (/^###\s+/.test(line)) {
      const agent = line.match(/\/reference\/agents\/([a-z0-9-]+)/i);
      if (agent) {
        current = agent[1];
      } else if (/workers internes|internal workers/i.test(line)) {
        current = 'workers';
      } else if (/hors pipeline|outside pipeline/i.test(line)) {
        current = 'outside';
      } else {
        current = null;
      }
      if (current && !order.includes(current)) order.push(current);
      if (current && !bySection[current]) bySection[current] = [];
      continue;
    }
    if (!current) continue;
    const skill = line.match(/\[[^\]]+\]\(([a-z0-9-]+)\.html\)/i);
    if (!skill) continue;
    bySection[current].push(skill[1]);
  }

  return { order, bySection };
}

function sameOrder(expected, actual) {
  return expected.length === actual.length && expected.every((v, i) => v === actual[i]);
}

function deriveAgentUsageOrder(root) {
  const orchestratorPath = join(root, 'plugins/skraft-framework/agents/skraft-orchestrator.agent.md');
  const orchestrator = readFrontmatter(orchestratorPath);
  if (!orchestrator) return null;

  const chain = Array.isArray(orchestrator.agents) ? orchestrator.agents : [];

  // Build display-name → slug map from all agent files so that orchestrator.agents
  // display names (e.g. "Skraft - Solution Researcher") resolve to file slugs
  // (e.g. "solution-researcher") used in handbook links and skill section headings.
  const agentsDir = join(root, 'plugins/skraft-framework/agents');
  const nameToSlug = {};
  for (const file of readdirSync(agentsDir).filter((f) => f.endsWith('.agent.md'))) {
    const slug = file.replace(/\.agent\.md$/, '');
    const fm = readFrontmatter(join(agentsDir, file));
    if (fm?.name) nameToSlug[fm.name] = slug;
  }

  const resolveSlug = (nameOrSlug) => nameToSlug[nameOrSlug] ?? nameOrSlug;

  const orderedAgents = ['skraft-orchestrator', ...chain.map(resolveSlug)];
  const skillsByAgent = {};

  for (const agent of orderedAgents) {
    const path = join(root, 'plugins/skraft-framework/agents', `${agent}.agent.md`);
    const fm = readFrontmatter(path);
    const skills = Array.isArray(fm?.metadata?.skills) ? fm.metadata.skills : [];
    skillsByAgent[agent] = skills;
  }

  return { orderedAgents, skillsByAgent };
}

export function scanDrift({ bookPath, root, siteRoot, emptyThreshold }) {
  const book = loadBook(bookPath);
  const sources = book.sources || {};
  const items = [];

  // Declared FR/EN basename exceptions (book.yml hard rule 5 carve-outs).
  const basenameExceptions = new Set(
    (book.meta?.basename_exceptions || []).map((e) => `${e.fr}|${e.en}`)
  );

  // ---- 1. Per-page structural drift (existence, emptiness, parity, ordering) ----
  for (const { part, sectionId, section, page } of iterPages(book, { sources, root })) {
    const frRel = page.fr;
    const enRel = page.en;
    const frAbs = frRel ? join(siteRoot, frRel) : null;
    const enAbs = enRel ? join(siteRoot, enRel) : null;
    const frExists = frAbs ? existsSync(frAbs) : false;
    const enExists = enAbs ? existsSync(enAbs) : false;

    const base = {
      part: part.id,
      section: sectionId,
      pageId: page.id,
      pageType: page.type || null,
      fr: frRel || null,
      en: enRel || null,
      source: page.source || null,
      generated: page.generated === true,
    };

    // Missing pages.
    if (frRel && !frExists && enRel && !enExists) {
      makeItem(items, {
        type: 'missing-page', severity: 'high', lang: 'both', ...base,
        detail: `Both FR and EN pages are declared in book.yml but absent on disk.`,
        desiredState: `Create ${frRel} and ${enRel} (${page.type || 'page'}), mirrored, same basename.`,
      });
    } else if (frRel && enRel && frExists !== enExists) {
      const missingLang = frExists ? 'en' : 'fr';
      makeItem(items, {
        type: 'parity-break', severity: 'high', lang: missingLang, ...base,
        detail: `Parity break: ${frExists ? frRel : enRel} exists but ${frExists ? enRel : frRel} is missing.`,
        desiredState: `Create the missing ${missingLang.toUpperCase()} mirror with the same heading structure.`,
      });
    } else if (frRel && !frExists) {
      makeItem(items, { type: 'missing-page', severity: 'high', lang: 'fr', ...base, detail: `Declared FR page ${frRel} is absent.`, desiredState: `Create ${frRel}.` });
    } else if (enRel && !enExists) {
      makeItem(items, { type: 'missing-page', severity: 'high', lang: 'en', ...base, detail: `Declared EN page ${enRel} is absent.`, desiredState: `Create ${enRel}.` });
    }

    // Basename parity (book.yml hard rule 5: FR and EN share the English basename).
    if (frRel && enRel && basename(frRel) !== basename(enRel)) {
      const frBase = basename(frRel).replace(/\.md$/, '');
      const enBase = basename(enRel).replace(/\.md$/, '');
      if (!basenameExceptions.has(`${frBase}|${enBase}`)) {
        makeItem(items, {
          type: 'basename-mismatch', severity: 'low', lang: 'both', ...base,
          detail: `FR basename "${basename(frRel)}" != EN basename "${basename(enRel)}".`,
          desiredState: `Align basenames, or declare the pair in meta.basename_exceptions.`,
        });
      }
    }

    // Empty / stub pages.
    for (const [lang, abs, rel, exists] of [['fr', frAbs, frRel, frExists], ['en', enAbs, enRel, enExists]]) {
      if (exists) {
        const page2 = readPage(abs);
        if (page2 && contentLines(page2.body) < emptyThreshold) {
          makeItem(items, {
            type: 'empty-page', severity: 'medium', lang, ...base,
            detail: `${rel} exists but has < ${emptyThreshold} content lines (stub).`,
            desiredState: `Write the complete ${page.type || 'page'} body.`,
          });
        }
      }
    }
  }

  // ---- 2. Ordering drift (sidebar_position) per part/section ----
  for (const part of book.parts || []) {
    for (const { id: sectionId, section } of sectionsOf(part)) {
      const pages = section == null
        ? (part.pages || [])
        : pagesOfSection(section, { sources, root });
      const positions = pages.map((p) => p.sidebar_position).filter((p) => p != null);
      if (positions.length === 0) continue; // ordering not yet declared here — not drift
      if (positions.length !== pages.length) {
        makeItem(items, {
          type: 'ordering-gap', severity: 'medium', part: part.id, section: sectionId,
          pageId: null, lang: null, fr: null, en: null, source: null,
          detail: `Only ${positions.length}/${pages.length} pages in this section declare sidebar_position.`,
          desiredState: `Give every page a unique, monotonic sidebar_position.`,
        });
      }
      const dups = positions.filter((p, i) => positions.indexOf(p) !== i);
      if (dups.length > 0) {
        makeItem(items, {
          type: 'ordering-gap', severity: 'medium', part: part.id, section: sectionId,
          pageId: null, lang: null, fr: null, en: null, source: null,
          detail: `Duplicate sidebar_position value(s): ${[...new Set(dups)].join(', ')}.`,
          desiredState: `Make every sidebar_position unique within the section.`,
        });
      }
    }
  }

  // ---- 3. Diátaxis-mode drift (every part must declare its single mode) ----
  const VALID_MODES = ['tutorial', 'how-to', 'explanation', 'reference'];
  for (const part of book.parts || []) {
    if (part.id === 'accueil') continue; // home is a router, exempt
    if (!part.diataxis_mode) {
      makeItem(items, {
        type: 'missing-diataxis-mode', severity: 'medium', part: part.id, section: null,
        pageId: null, lang: null, fr: null, en: null, source: null,
        detail: `Part "${part.id}" does not declare a diataxis_mode.`,
        desiredState: `Add diataxis_mode (one of ${VALID_MODES.join(' | ')}).`,
      });
    } else if (!VALID_MODES.includes(part.diataxis_mode)) {
      makeItem(items, {
        type: 'invalid-diataxis-mode', severity: 'medium', part: part.id, section: null,
        pageId: null, lang: null, fr: null, en: null, source: null,
        detail: `Part "${part.id}" declares invalid diataxis_mode "${part.diataxis_mode}".`,
        desiredState: `Use one of ${VALID_MODES.join(' | ')}.`,
      });
    }
  }

  // ---- 4. Orphan sources (a source file no derived page covers) ----
  const covered = new Set();
  for (const { page } of iterPages(book, { sources, root })) {
    if (page.type === 'derived' && page.source) {
      const pat = page.source.startsWith('/') ? page.source : join(root, page.source);
      for (const f of findFiles(pat)) covered.add(resolve(f));
    }
  }
  for (const [key, glob] of Object.entries(sources)) {
    if (key === 'citations') continue; // bibliography is a data file, not a per-item page
    const pat = glob.startsWith('/') ? glob : join(root, glob);
    for (const abs of findFiles(pat)) {
      if (!covered.has(resolve(abs))) {
        const rel = resolve(abs).startsWith(resolve(root)) ? resolve(abs).slice(resolve(root).length + 1) : abs;
        makeItem(items, {
          type: 'orphan-source', severity: 'high', part: 'reference', section: key,
          pageId: null, lang: 'both', fr: null, en: null, source: rel,
          detail: `Source ${rel} (sources.${key}) is covered by no derived page.`,
          desiredState: `Place it in the contract (book.yml) and generate its FR+EN reference page.`,
        });
      }
    }
  }

  // ---- 5. Order drift (agent usage order for overview indexes) ----
  const usage = deriveAgentUsageOrder(root);
  if (usage) {
    const expectedAgents = usage.orderedAgents;
    const checks = [
      { kind: 'agents', lang: 'fr', path: join(siteRoot, 'fr/reference/agents/index.md') },
      { kind: 'agents', lang: 'en', path: join(siteRoot, 'en/reference/agents/index.md') },
      { kind: 'skills', lang: 'fr', path: join(siteRoot, 'fr/reference/skills/index.md') },
      { kind: 'skills', lang: 'en', path: join(siteRoot, 'en/reference/skills/index.md') },
    ];
    const findings = [];

    for (const check of checks) {
      const page = readPage(check.path);
      if (!page) continue;

      if (check.kind === 'agents') {
        const found = extractAgentLinksInOrder(page.body, expectedAgents);
        if (!sameOrder(expectedAgents, found)) {
          findings.push(
            `${check.lang.toUpperCase()} agents/index order mismatch: expected [${expectedAgents.join(', ')}], found [${found.join(', ')}].`
          );
        }
      } else {
        const parsed = extractSkillSections(page.body);
        const orderedSections = parsed.order.filter((s) => expectedAgents.includes(s));
        if (!sameOrder(expectedAgents, orderedSections)) {
          findings.push(
            `${check.lang.toUpperCase()} skills/index section order mismatch: expected [${expectedAgents.join(', ')}], found [${orderedSections.join(', ')}].`
          );
        }
        for (const agent of expectedAgents) {
          const expected = usage.skillsByAgent[agent] || [];
          const actual = parsed.bySection[agent] || [];
          if (!sameOrder(expected, actual)) {
            findings.push(
              `${check.lang.toUpperCase()} skills/index section "${agent}" mismatch: expected [${expected.join(', ')}], found [${actual.join(', ')}].`
            );
          }
        }
      }
    }

    if (findings.length > 0) {
      makeItem(items, {
        type: 'order-drift',
        severity: 'medium',
        part: 'reference',
        section: 'agents-skills-overview',
        pageId: 'overview-order',
        pageType: 'derived',
        lang: 'both',
        fr: 'fr/reference/agents/index.md, fr/reference/skills/index.md',
        en: 'en/reference/agents/index.md, en/reference/skills/index.md',
        source: 'plugins/skraft-framework/agents/skraft-orchestrator.agent.md + plugins/skraft-framework/agents/*.agent.md',
        detail: findings.join('\n'),
        desiredState: 'Regenerate FR/EN agents/index + skills/index from live agent chain and metadata.skills order.',
      });
    }
  }

  items.sort((a, b) => (SEVERITY[a.severity] - SEVERITY[b.severity]) || a.type.localeCompare(b.type));

  const byType = {};
  const bySeverity = {};
  for (const it of items) {
    byType[it.type] = (byType[it.type] || 0) + 1;
    bySeverity[it.severity] = (bySeverity[it.severity] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    root: resolve(root),
    siteRoot: resolve(siteRoot),
    book: bookPath,
    summary: { total: items.length, byType, bySeverity },
    items,
  };
}

// ---- CLI ----
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.url.replace('file://', ''));
if (isMain) {
  const { values } = parseArgs({
    options: {
      book: { type: 'string', default: 'docs/site/_data/book.yml' },
      root: { type: 'string', default: '.' },
      'site-root': { type: 'string', default: 'docs/site' },
      out: { type: 'string' },
      'empty-threshold': { type: 'string', default: '4' },
    },
  });

  const ledger = scanDrift({
    bookPath: values.book,
    root: resolve(values.root),
    siteRoot: resolve(values['site-root']),
    emptyThreshold: Number(values['empty-threshold']),
  });

  const json = JSON.stringify(ledger, null, 2);
  if (values.out) {
    const outPath = resolve(values.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, json + '\n');
    console.error(`Wrote ${ledger.summary.total} drift item(s) to ${values.out}`);
  } else {
    console.log(json);
  }
  for (const [type, n] of Object.entries(ledger.summary.byType)) {
    console.error(`  ${type}: ${n}`);
  }
  process.exit(ledger.summary.total > 0 ? 1 : 0);
}
