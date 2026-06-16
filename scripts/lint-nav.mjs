// scripts/lint-nav.mjs
//
// Deterministic validator for the SKRAFT handbook NAVIGATION: the multi-level
// sidebar declared in book.yml plus the internal links inside the pages. It
// enforces the structure the menu promises — Diátaxis mode per part, well-formed
// 3-level sections, unique/monotonic ordering — and that no page links to a
// target that does not exist (the "never link to a page that does not exist" rule).
//
// It does NOT judge prose or Diátaxis CONTENT purity (that is the diataxis-lens's
// job). It checks STRUCTURE and LINKS — both fully deterministic.
//
// Usage:
//   node scripts/lint-nav.mjs [--book docs/site/_data/book.yml] [--root .]
//                             [--site-root docs/site] [--json]
//
// Exit code: 0 clean, 1 when problems were found, 2 on usage error.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadBook, sectionsOf, pagesOfSection } from './lib/book.mjs';

const VALID_MODES = ['tutorial', 'how-to', 'explanation', 'reference'];

function problem(list, { severity = 'error', code, where, message }) {
  list.push({ severity, code, where, message });
}

/** Validate the multi-level menu structure + ordering declared in book.yml. */
function lintStructure(book, sources, root, problems) {
  const parts = book.parts || [];

  // Parts must be ordered (array order is the menu order) and each must declare a
  // Diátaxis mode (except the home router).
  const partPositions = [];
  parts.forEach((part, idx) => {
    const where = `book.yml > parts[${idx}] (${part.id})`;
    if (part.id !== 'accueil') {
      if (!part.diataxis_mode) {
        problem(problems, { code: 'NAV-MODE-MISSING', where, message: `Part "${part.id}" must declare diataxis_mode (one of ${VALID_MODES.join(' | ')}).` });
      } else if (!VALID_MODES.includes(part.diataxis_mode)) {
        problem(problems, { code: 'NAV-MODE-INVALID', where, message: `Invalid diataxis_mode "${part.diataxis_mode}".` });
      }
    }
    if (part.sidebar_position != null) partPositions.push(part.sidebar_position);

    // Each part is either sectioned (3-level) or flat (2-level). Validate each.
    const secs = sectionsOf(part);
    const multi = Array.isArray(part.sections) && part.sections.length > 0;
    secs.forEach(({ id: sectionId, section }, sIdx) => {
      const swhere = multi ? `${where} > sections[${sIdx}] (${sectionId})` : where;
      if (multi) {
        if (!sectionId) problem(problems, { code: 'NAV-SECTION-ID', where: swhere, message: `Section is missing an id.` });
        if (!section.title_fr || !section.title_en) {
          problem(problems, { code: 'NAV-SECTION-TITLE', where: swhere, message: `Section "${sectionId}" must declare title_fr and title_en.` });
        }
      }
      const pages = section == null ? (part.pages || []) : pagesOfSection(section, { sources, root });
      checkOrdering(pages, swhere, problems);
    });
  });

  // If any part declares sidebar_position, all parts must, uniquely.
  if (partPositions.length > 0) {
    if (partPositions.length !== parts.length) {
      problem(problems, { code: 'NAV-PART-ORDER', where: 'book.yml > parts', message: `Only ${partPositions.length}/${parts.length} parts declare sidebar_position.` });
    }
    if (new Set(partPositions).size !== partPositions.length) {
      problem(problems, { code: 'NAV-PART-ORDER-DUP', where: 'book.yml > parts', message: `Duplicate sidebar_position among parts.` });
    }
  }
}

/** A section's pages must all carry a unique, strictly increasing sidebar_position. */
function checkOrdering(pages, where, problems) {
  const positions = pages.map((p) => p.sidebar_position);
  const declared = positions.filter((p) => p != null);
  if (declared.length === 0) return; // ordering not declared here yet — not a lint error
  if (declared.length !== pages.length) {
    problem(problems, { severity: 'warning', code: 'NAV-ORDER-PARTIAL', where, message: `${declared.length}/${pages.length} pages declare sidebar_position; give every page one.` });
  }
  if (new Set(declared).size !== declared.length) {
    problem(problems, { code: 'NAV-ORDER-DUP', where, message: `Duplicate sidebar_position value(s): ${[...new Set(declared.filter((p, i) => declared.indexOf(p) !== i))].join(', ')}.` });
  }
  const sorted = [...declared].sort((a, b) => a - b);
  if (JSON.stringify(sorted) !== JSON.stringify(declared)) {
    problem(problems, { severity: 'warning', code: 'NAV-ORDER-UNSORTED', where, message: `sidebar_position values are not in ascending document order: [${declared.join(', ')}].` });
  }
}

const LINK_RELURL_RE = /\{\{\s*["']([^"']+?)["']\s*\|\s*relative_url\s*\}\}/g;
const LINK_BARE_RE = /\]\((\/(?:fr|en)\/[^)]*)\)/g;

/** Map a site-absolute link path (e.g. "/fr/reference/agents/") to a source file. */
function resolveLinkTarget(linkPath, siteRoot) {
  let p = linkPath.split('#')[0].split('?')[0];
  if (!p.startsWith('/')) return null;
  p = p.replace(/^\//, '');
  if (p === '' ) return null;
  if (p.endsWith('/')) p += 'index.md';
  else if (p.endsWith('.html')) p = p.replace(/\.html$/, '.md');
  else if (!/\.[a-z0-9]+$/i.test(p)) p += '.md';
  // Only check links that point into the localized book trees.
  if (!/^(fr|en)\//.test(p)) return null;
  return join(siteRoot, p);
}

/** Scan every declared page file for internal links that 404 or skip relative_url. */
function lintLinks(book, siteRoot, sources, root, problems) {
  const seen = new Set();
  const files = [];
  for (const part of book.parts || []) {
    for (const { section } of sectionsOf(part)) {
      const pages = section == null ? (part.pages || []) : pagesOfSection(section, { sources, root });
      for (const page of pages) {
        for (const rel of [page.fr, page.en]) {
          if (rel && !seen.has(rel)) { seen.add(rel); files.push(rel); }
        }
      }
    }
  }

  for (const rel of files) {
    const abs = join(siteRoot, rel);
    if (!existsSync(abs)) continue; // missing files are scan-drift's concern
    const content = readFileSync(abs, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      let m;
      LINK_RELURL_RE.lastIndex = 0;
      while ((m = LINK_RELURL_RE.exec(line)) !== null) {
        const target = resolveLinkTarget(m[1], siteRoot);
        if (target && !existsSync(target)) {
          problem(problems, { code: 'NAV-LINK-DANGLING', where: `${rel}:${i + 1}`, message: `Internal link "${m[1]}" points to a page that does not exist.` });
        }
      }
      LINK_BARE_RE.lastIndex = 0;
      while ((m = LINK_BARE_RE.exec(line)) !== null) {
        problem(problems, { code: 'NAV-LINK-NO-BASEURL', where: `${rel}:${i + 1}`, message: `Bare link "${m[1]}" must use {{ "${m[1]}" | relative_url }} or it 404s under the baseurl.` });
      }
    });
  }
}

export function lintNav({ bookPath, root, siteRoot }) {
  const book = loadBook(bookPath);
  const sources = book.sources || {};
  const problems = [];
  lintStructure(book, sources, root, problems);
  lintLinks(book, siteRoot, sources, root, problems);
  return problems;
}

// ---- CLI ----
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.url.replace('file://', ''));
if (isMain) {
  const { values } = parseArgs({
    options: {
      book: { type: 'string', default: 'docs/site/_data/book.yml' },
      root: { type: 'string', default: '.' },
      'site-root': { type: 'string', default: 'docs/site' },
      json: { type: 'boolean', default: false },
    },
  });

  const problems = lintNav({
    bookPath: values.book,
    root: resolve(values.root),
    siteRoot: resolve(values['site-root']),
  });

  if (values.json) {
    console.log(JSON.stringify({ problems }, null, 2));
  } else if (problems.length === 0) {
    console.log('Navigation valid: structure, ordering and internal links all check out.');
  } else {
    for (const p of problems) {
      console.error(`${p.severity.toUpperCase()} ${p.code} ${p.where}: ${p.message}`);
    }
  }
  const errors = problems.filter((p) => p.severity === 'error');
  process.exit(errors.length > 0 ? 1 : 0);
}
