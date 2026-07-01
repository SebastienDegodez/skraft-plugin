// scripts/lib/book.mjs
//
// Zero-dependency reader for the SKRAFT book contract (docs/site/_data/book.yml)
// and a recursive glob matcher, shared by scan-drift.mjs and lint-nav.mjs.
//
// The repo deliberately ships NO YAML runtime dependency (see check-citations.mjs
// which hand-rolls a flat parser). book.yml is NESTED, so this module implements
// a small indentation-stack parser scoped to the subset book.yml actually uses:
//   - nested maps (`key:` then indented children)
//   - lists of maps (`- key: value` then indented siblings)
//   - scalars (quoted strings, integers, booleans)
//   - inline flow arrays (`[a, b, c]`)
//   - `#` line/trailing comments (respecting quotes)
// It does NOT support block scalars, anchors, or bare scalar sequences — book.yml
// uses none. If the contract grows such constructs, extend this parser (and its
// self-test below) rather than reaching for a dependency.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Strip a trailing/`#` comment that is not inside quotes. */
function stripComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble) {
      // Treat as a comment only at line start or after whitespace.
      if (i === 0 || /\s/.test(line[i - 1])) return line.slice(0, i);
    }
  }
  return line;
}

function unquote(s) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Coerce a scalar token into string | number | boolean | array | null. */
function coerce(raw) {
  const v = raw.trim();
  if (v === '') return null;
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (inner === '') return [];
    return splitFlow(inner).map((x) => coerce(x));
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  return unquote(v);
}

/** Split a flow array body on commas that are not inside quotes. */
function splitFlow(inner) {
  const out = [];
  let buf = '';
  let inSingle = false;
  let inDouble = false;
  for (const c of inner) {
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    if (c === ',' && !inSingle && !inDouble) {
      out.push(buf.trim());
      buf = '';
    } else {
      buf += c;
    }
  }
  if (buf.trim() !== '') out.push(buf.trim());
  return out;
}

/** Split `key: value` on the first quote-free colon followed by EOL/space. */
function splitKeyValue(content) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === ':' && !inSingle && !inDouble) {
      const after = content.slice(i + 1);
      if (after === '' || after.startsWith(' ')) {
        return { key: content.slice(0, i).trim(), value: after.trim() };
      }
    }
  }
  return null;
}

/**
 * Parse the subset of YAML used by book.yml into a nested JS object.
 *
 * Indentation-stack invariant: `stack` holds container frames ordered by strictly
 * increasing indent. A frame is { indent, node, container, key } where `node` is
 * the map/array being filled, and (container, key) is its slot in the parent so a
 * bare-key container can be upgraded to an array when its first `- ` child appears.
 */
export function parseYaml(text) {
  const root = {};
  const stack = [{ indent: -1, node: root, container: null, key: null }];
  const rawLines = text.split('\n');

  for (let li = 0; li < rawLines.length; li++) {
    const line = stripComment(rawLines[li].replace(/\r$/, ''));
    if (line.trim() === '') continue;

    const indent = line.length - line.trimStart().length;
    let content = line.trim();
    const isItem = content.startsWith('- ') || content === '-';
    if (isItem) content = content.replace(/^-\s*/, '');

    // Pop until the top frame is a strict parent of this line.
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1];

    if (isItem) {
      // The parent container must be an array; upgrade it in place if needed.
      let arr = parent.node;
      if (!Array.isArray(arr)) {
        arr = [];
        if (parent.container !== null) parent.container[parent.key] = arr;
        parent.node = arr;
      }
      const kv = content === '' ? null : splitKeyValue(content);
      if (kv === null && content !== '') {
        arr.push(coerce(content)); // bare scalar list item
        continue;
      }
      const element = {};
      arr.push(element);
      stack.push({ indent, node: element, container: arr, key: arr.length - 1 });
      if (kv) {
        const bs = blockStyle(kv.value);
        if (bs) {
          const block = readBlockScalar(rawLines, li + 1, indent, bs);
          element[kv.key] = block.value;
          li = block.nextIndex - 1;
        } else {
          assignInto(element, kv, stack, indent);
        }
      }
      continue;
    }

    const kv = splitKeyValue(content);
    if (kv) {
      const bs = blockStyle(kv.value);
      if (bs) {
        const block = readBlockScalar(rawLines, li + 1, indent, bs);
        parent.node[kv.key] = block.value;
        li = block.nextIndex - 1;
      } else {
        assignInto(parent.node, kv, stack, indent);
      }
    }
  }

  return root;
}

/** Detect a YAML block-scalar indicator (`|`, `>`, with optional `-`/`+` chomping). */
function blockStyle(value) {
  const m = /^([|>])([+-]?)\d*$/.exec(value);
  if (!m) return null;
  return { style: m[1], chomp: m[2] === '-' ? 'strip' : m[2] === '+' ? 'keep' : 'clip' };
}

/**
 * Read a literal (`|`) or folded (`>`) block scalar starting at `start`.
 * Lines are consumed while blank OR indented deeper than `keyIndent`. Content is
 * taken from RAW lines (never comment-stripped) so markdown `#` survives.
 * Returns { value, nextIndex } where nextIndex is the first unconsumed line.
 */
function readBlockScalar(rawLines, start, keyIndent, { style, chomp }) {
  const collected = [];
  let i = start;
  for (; i < rawLines.length; i++) {
    const raw = rawLines[i].replace(/\r$/, '');
    if (raw.trim() === '') { collected.push(''); continue; }
    const ind = raw.length - raw.trimStart().length;
    if (ind <= keyIndent) break;
    collected.push(raw);
  }
  // Trailing blank lines are re-applied per the chomping indicator.
  let end = collected.length;
  while (end > 0 && collected[end - 1] === '') end--;
  const body = collected.slice(0, end);
  const trailingBlanks = collected.length - end;

  // Strip the common leading indentation (the least-indented non-blank line).
  let blockIndent = Infinity;
  for (const l of body) {
    if (l === '') continue;
    const ind = l.length - l.trimStart().length;
    if (ind < blockIndent) blockIndent = ind;
  }
  if (!Number.isFinite(blockIndent)) blockIndent = 0;
  const stripped = body.map((l) => (l === '' ? '' : l.slice(blockIndent)));

  let value;
  if (style === '|') {
    value = stripped.join('\n');
  } else {
    let out = '';
    for (const l of stripped) {
      if (l === '') out += '\n';
      else {
        if (out !== '' && !out.endsWith('\n')) out += ' ';
        out += l;
      }
    }
    value = out;
  }

  if (chomp === 'clip') value += '\n';
  else if (chomp === 'keep') value += '\n'.repeat(trailingBlanks + 1);
  return { value, nextIndex: i };
}

/** Assign `key: value` into `node`; a bare key opens a child container frame. */
function assignInto(node, { key, value }, stack, indent) {
  if (value === '') {
    const child = {};
    node[key] = child;
    stack.push({ indent, node: child, container: node, key });
  } else {
    node[key] = coerce(value);
  }
}

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
