// scripts/lib/book.mjs
//
// Zero-dependency reader for the SKRAFT book contract (docs/site/_data/book.yml)
// and a recursive glob matcher, shared by scan-drift.mjs and lint-nav.mjs.
//
// The YAML subset parser itself (`parseYaml`) lives in
// plugins/src/domain/yaml-parser.mjs — it is also the parser behind the shipped
// `artifact` CLI (plugins/src/cli/artifact.mjs), so both consumers share one
// implementation instead of drifting. This module re-exports it and adds the
// book-contract-specific loading/traversal helpers below.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseYaml } from '../../plugins/src/domain/yaml-parser.mjs';

export { parseYaml };

/** Load and parse the book contract. */
export function loadBook(bookPath) {
  const text = readFileSync(resolve(bookPath), 'utf-8');
  return parseYaml(text);
}

/**
 * Normalize a part into an ordered list of sections. A part may either:
 *   - declare `sections: [ { id, pages } ]` (3-level menu), or
 *   - declare `pages: [...]` directly (2-level → one implicit section).
 */
export function sectionsOf(part) {
  if (Array.isArray(part.sections) && part.sections.length > 0) {
    return part.sections.map((s) => ({ id: s.id, section: s, pages: s.pages || [] }));
  }
  return [{ id: null, section: null, pages: part.pages || [] }];
}

/** Derive a page slug from a source file path. */
export function slugFromPath(file, mode = 'basename') {
  const segments = file.split('/');
  const base = segments[segments.length - 1];
  if (mode === 'parent') return segments[segments.length - 2];
  return base.replace(/\.agent\.md$/, '').replace(/\.md$/, '');
}

/**
 * Resolve the concrete pages of a section. Beyond any explicit `pages:` entries,
 * a section may carry a `generate:` directive that materializes ONE derived page
 * per source file (so the Reference menu can list every agent / skill / lens
 * individually and in order). Generated pages are tagged `generated: true`.
 *
 * `generate` shape (book.yml):
 *   generate:
 *     from: agents                 # a key of meta.sources
 *     slug_from: basename|parent   # how to derive the slug from the file path
 *     path_fr: "fr/reference/agents/{slug}.md"
 *     path_en: "en/reference/agents/{slug}.md"
 *     start_position: 2            # sidebar_position of the first generated page
 */
export function pagesOfSection(section, { sources = {}, root = process.cwd() } = {}) {
  if (section == null) return [];
  const explicit = (section.pages || []).map((p) => ({ ...p, generated: false }));
  const gen = section.generate;
  if (!gen || !gen.from || !sources[gen.from]) return explicit;

  const pattern = sources[gen.from].startsWith('/') ? sources[gen.from] : join(root, sources[gen.from]);
  const files = findFiles(pattern).sort();
  const start = Number.isInteger(gen.start_position) ? gen.start_position : explicit.length + 1;
  const generated = files.map((abs, i) => {
    const rel = abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
    const slug = slugFromPath(rel, gen.slug_from);
    return {
      id: `${section.id}-${slug}`,
      type: 'derived',
      generated: true,
      slug,
      source: rel,
      sidebar_position: start + i,
      fr: (gen.path_fr || '').replace('{slug}', slug),
      en: (gen.path_en || '').replace('{slug}', slug),
      label_fr: slug,
      label_en: slug,
    };
  });
  return [...explicit, ...generated];
}

/**
 * Iterate every page with its part + section context. When `opts.sources` is
 * provided, sections with a `generate:` directive are expanded to per-source pages.
 */
export function* iterPages(book, opts = {}) {
  for (const part of book.parts || []) {
    for (const { id: sectionId, section } of sectionsOf(part)) {
      const pages = section == null
        ? (part.pages || []).map((p) => ({ ...p, generated: false }))
        : pagesOfSection(section, opts);
      for (const page of pages) {
        yield { part, sectionId, section, page };
      }
    }
  }
}

/**
 * Recursively expand a simple glob (`*` single-segment, `**` any depth).
 * Mirrors check-citations.mjs semantics so both tools agree on `sources`.
 */
export function findFiles(pattern) {
  const absPattern = resolve(pattern);
  if (!absPattern.includes('*')) {
    try {
      statSync(absPattern);
      return [absPattern];
    } catch {
      return [];
    }
  }
  const parts = absPattern.split('/');
  const rootParts = [];
  let i = 0;
  while (i < parts.length && !parts[i].includes('*')) {
    rootParts.push(parts[i]);
    i++;
  }
  const root = rootParts.join('/') || '/';
  const globParts = parts.slice(i);
  const results = [];
  matchRecursive(root, globParts, results);
  return results;
}

function matchRecursive(dir, patterns, results) {
  if (patterns.length === 0) return;
  const [current, ...rest] = patterns;
  if (current === '**') {
    matchRecursive(dir, rest, results);
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          matchRecursive(join(dir, entry.name), patterns, results);
        }
      }
    } catch { /* ignore */ }
    return;
  }
  const regex = new RegExp('^' + current.replace(/\./g, '\\.').replace(/\*/g, '[^/]*') + '$');
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (regex.test(entry.name)) {
        const full = join(dir, entry.name);
        if (rest.length === 0) {
          if (entry.isFile()) results.push(full);
        } else if (entry.isDirectory()) {
          matchRecursive(full, rest, results);
        }
      }
    }
  } catch { /* ignore */ }
}
