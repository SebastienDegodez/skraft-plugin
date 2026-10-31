// scripts/lint-nav.mjs
//
// Deterministic validator for the SKRAFT handbook NAVIGATION: the multi-level
// sidebar declared in book.yml plus the doc files of the Docusaurus site
// (docs/website/docs for EN, docs/website/i18n/fr/docusaurus-plugin-content-docs/current
// for FR). It enforces the structure the menu promises — Diátaxis mode per part, a
// slug per part, well-formed 3-level sections with their intro, one doc id per page,
// unique/monotonic ordering, no generated index on a doc's route — and that the
// files keep to the site's conventions: every doc declared in book.yml, internal
// links as relative file links that exist, `.mdx` only for JSX, a front matter
// description of at most 160 characters.
//
// It does NOT judge prose or Diátaxis CONTENT purity (that is the diataxis-lens's
// job). It checks STRUCTURE and LINKS — both fully deterministic.
//
// Usage:
//   node scripts/lint-nav.mjs [--book docs/website/book.yml] [--root .]
//                             [--site-root docs/website] [--json]
//
// Exit code: 0 clean, 1 when problems were found, 2 on usage error.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadBook, sectionsOf, pagesOfSection, docFilesOnDisk, iterPages, parseYaml } from './lib/book.mjs';
import { sectionSlug } from '../docs/website/src/book/sidebars-from-book.mjs';

const VALID_MODES = ['tutorial', 'how-to', 'explanation', 'reference'];
const DESCRIPTION_LIMIT = 160;

function problem(list, { severity = 'error', code, where, message }) {
  list.push({ severity, code, where, message });
}

/** The route Docusaurus gives a doc id: a category index (index, README, the folder's name) takes its folder's route. */
function docRoute(doc) {
  const segments = doc.split('/');
  const name = segments[segments.length - 1];
  const folder = segments[segments.length - 2];
  const isIndex = /^(index|readme)$/i.test(name) || name.toLowerCase() === folder?.toLowerCase();
  return `/${(isIndex ? segments.slice(0, -1) : segments).join('/')}`;
}

/** Validate the multi-level menu structure + ordering declared in book.yml. */
function lintStructure(book, sources, root, problems) {
  const parts = book.parts || [];
  const routes = new Map([...iterPages(book, { sources, root })].filter(({ page }) => page.doc).map(({ page }) => [docRoute(page.doc), `doc ${page.doc}`]));
  const declared = new Set();

  // Parts must be ordered (array order is the menu order) and each must declare a
  // Diátaxis mode and a slug (except the home router).
  const partPositions = [];
  parts.forEach((part, idx) => {
    const where = `book.yml > parts[${idx}] (${part.id})`;
    if (part.id !== 'accueil') {
      if (!part.diataxis_mode) {
        problem(problems, { code: 'NAV-MODE-MISSING', where, message: `Part "${part.id}" must declare diataxis_mode (one of ${VALID_MODES.join(' | ')}).` });
      } else if (!VALID_MODES.includes(part.diataxis_mode)) {
        problem(problems, { code: 'NAV-MODE-INVALID', where, message: `Invalid diataxis_mode "${part.diataxis_mode}".` });
      }
      if (part.diataxis_mode && !part.slug) {
        problem(problems, { code: 'NAV-PART-SLUG', where, message: `Part "${part.id}" must declare slug, the route of its generated index (e.g. /${part.id}).` });
      }
    }
    if (part.slug) claimRoute(routes, part.slug, `part ${part.id}`, where, problems);
    if (part.sidebar_position != null) partPositions.push(part.sidebar_position);

    // Each part is either sectioned (3-level) or flat (2-level). Validate each.
    const secs = sectionsOf(part);
    const multi = Array.isArray(part.sections) && part.sections.length > 0;
    secs.forEach(({ id: sectionId, section }, sIdx) => {
      const swhere = multi ? `${where} > sections[${sIdx}] (${sectionId})` : where;
      if (multi) lintSection(part, section, swhere, routes, problems);
      const pages = section == null ? (part.pages || []) : pagesOfSection(section, { sources, root });
      lintPages(pages, swhere, declared, problems);
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
  return declared;
}

function lintSection(part, section, where, routes, problems) {
  if (!section.id) problem(problems, { code: 'NAV-SECTION-ID', where, message: `Section is missing an id.` });
  if (!section.title_fr || !section.title_en) {
    problem(problems, { code: 'NAV-SECTION-TITLE', where, message: `Section "${section.id}" must declare title_fr and title_en.` });
  }
  if (!section.intro_fr || !section.intro_en) {
    problem(problems, { code: 'NAV-SECTION-INTRO', where, message: `Section "${section.id}" must declare intro_fr and intro_en, the one-sentence description of its generated index.` });
  }
  if (part.slug) claimRoute(routes, sectionSlug(part, section), `section ${section.id}`, where, problems);
}

/** A generated index takes a route no doc and no other generated index has. */
function claimRoute(routes, route, owner, where, problems) {
  const holder = routes.get(route);
  if (holder) {
    problem(problems, {
      code: 'NAV-SLUG-COLLISION', where,
      message: `${route} is both the generated index of ${owner} and the route of ${holder}; give the ${owner.split(' ')[0]} its own slug.`,
    });
    return;
  }
  routes.set(route, `the generated index of ${owner}`);
}

/** Every page names one doc id, and no doc id is declared twice. */
function lintPages(pages, where, declared, problems) {
  for (const page of pages) {
    if (!page.doc) {
      problem(problems, { code: 'NAV-PAGE-DOC', where, message: `Page "${page.id}" must declare doc, its doc id (English path without extension).` });
    } else if (declared.has(page.doc)) {
      problem(problems, { code: 'NAV-DOC-DUP', where, message: `Doc "${page.doc}" is declared more than once (page "${page.id}").` });
    } else {
      declared.add(page.doc);
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

const LINK_RE = /(?<!!)\[[^\]]*\]\(\s*<?([^)\s>]+)/g;
const LIQUID_RE = /\{\{[^}]*\}\}|\{%[^%]*%\}/g;
const JSX_RE = /^\s*(?:import|export)\s|<[A-Z][\w.]*[\s/>]/;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/** The lines of a page outside fenced code, with inline code removed: [lineNumber, text]. */
function proseLines(content) {
  const lines = [];
  let fence = null;
  content.split('\n').forEach((line, i) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker && (fence === null || marker[1].startsWith(fence))) {
      fence = fence === null ? marker[1] : null;
      return;
    }
    if (fence === null) lines.push([i + 1, line.replace(/`[^`]*`/g, '')]);
  });
  return lines;
}

function frontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  try { return parseYaml(match[1]) || {}; } catch { return {}; }
}

function lintLinks(file, rel, lines, problems) {
  for (const [n, line] of lines) {
    for (const [, target] of line.matchAll(LINK_RE)) {
      if (target.startsWith('/')) {
        problem(problems, { code: 'NAV-LINK-ABSOLUTE', where: `${rel}:${n}`, message: `Link "${target}" must be a relative file link (e.g. ../how-to/run-gates.md); /en/, /fr/ and site-absolute page links break across locales and versions.` });
      } else if (!SCHEME_RE.test(target) && /\.mdx?$/.test(target.split(/[#?]/)[0])) {
        if (!existsSync(join(dirname(file), target.split(/[#?]/)[0]))) {
          problem(problems, { code: 'NAV-LINK-DANGLING', where: `${rel}:${n}`, message: `Internal link "${target}" points to a file that does not exist in this locale.` });
        }
      }
    }
    for (const [liquid] of line.matchAll(LIQUID_RE)) {
      problem(problems, { code: 'NAV-LINK-ABSOLUTE', where: `${rel}:${n}`, message: `Liquid "${liquid}" has no meaning in Docusaurus; write a relative file link.` });
    }
  }
}

/** Every doc file on disk: declared in book.yml, relative links, `.mdx` only for JSX, a short description. */
function lintFiles(siteRoot, root, declared, problems) {
  for (const { doc, file } of docFilesOnDisk(siteRoot)) {
    const rel = relative(root, file).split('\\').join('/');
    if (!declared.has(doc)) {
      problem(problems, { code: 'NAV-DOC-UNDECLARED', where: rel, message: `Doc "${doc}" has a file but no page in book.yml; declare it or remove the file.` });
    }
    const content = readFileSync(file, 'utf-8');
    const lines = proseLines(content.replace(/^---\r?\n[\s\S]*?\r?\n---/, (fm) => fm.replace(/[^\n]/g, '')));
    lintLinks(file, rel, lines, problems);
    if (file.endsWith('.mdx') && !lines.some(([, line]) => JSX_RE.test(line))) {
      problem(problems, { code: 'NAV-MDX-NO-JSX', where: rel, message: `"${doc}" is .mdx but holds no JSX (import, export or component); rename it to .md.` });
    }
    const description = frontMatter(content).description;
    const length = typeof description === 'string' ? [...description].length : 0;
    if (length > DESCRIPTION_LIMIT) {
      // A warning until the readability pass (WP9) shortens the ~75 Jekyll-era descriptions over the limit.
      problem(problems, { severity: 'warning', code: 'NAV-DESCRIPTION-LONG', where: rel, message: `Front matter description has ${length} characters; keep it at ${DESCRIPTION_LIMIT} or fewer.` });
    }
  }
}

export function lintNav({ bookPath, root, siteRoot }) {
  const book = loadBook(bookPath);
  const sources = book.sources || {};
  const problems = [];
  const declared = lintStructure(book, sources, root, problems);
  lintFiles(siteRoot, root, declared, problems);
  return problems;
}

// ---- CLI ----
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { values } = parseArgs({
    options: {
      book: { type: 'string', default: 'docs/website/book.yml' },
      root: { type: 'string', default: '.' },
      'site-root': { type: 'string', default: 'docs/website' },
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
    console.log('Navigation valid: structure, ordering, doc files and internal links all check out.');
  } else {
    for (const p of problems) {
      console.error(`${p.severity.toUpperCase()} ${p.code} ${p.where}: ${p.message}`);
    }
  }
  const errors = problems.filter((p) => p.severity === 'error');
  process.exit(errors.length > 0 ? 1 : 0);
}
