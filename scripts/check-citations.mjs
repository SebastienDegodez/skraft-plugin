import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

/**
 * Minimal YAML parser for the flat list-of-objects format used by citations.yml.
 * Each entry: `- key: val\n  field: val\n  ...`
 */
function parseCitationsYaml(text) {
  const entries = [];
  let current = null;

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');

    if (/^- \w+:/.test(line)) {
      current = {};
      entries.push(current);
      const [key, ...rest] = line.slice(2).split(':');
      current[key.trim()] = unquote(rest.join(':').trim());
    } else if (/^\s+\w+:/.test(line) && current) {
      const [key, ...rest] = line.trim().split(':');
      const val = rest.join(':').trim();
      const parsed = /^\d+$/.test(val) ? Number(val) : unquote(val);
      current[key.trim()] = parsed;
    }
  }

  return entries;
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Recursively find files matching a simple glob pattern.
 * Supports `**` (any depth) and `*` (single segment wildcard).
 */
function findFiles(pattern) {
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
    // Match zero or more directories
    matchRecursive(dir, rest, results);
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          matchRecursive(join(dir, entry.name), patterns, results);
        }
      }
    } catch { /* ignore permission errors */ }
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
  } catch { /* ignore permission errors */ }
}

const WORD_LIMIT = 25;

// Match: > « ... »  or  > " ... "  (possibly multi-line quote block)
// Followed by: > — Author, *Title*, Year.
const QUOTE_START_RE = /^>\s*[«"]\s*/;
const QUOTE_END_RE = /[»"]\s*$/;
const ATTRIBUTION_RE = /^>\s*—\s*(.+),\s*\*(.+)\*,\s*(\d{4})\.\s*$/;

function extractCitations(content, filePath) {
  const lines = content.split('\n');
  const citations = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Look for a line starting with > « or > "
    if (QUOTE_START_RE.test(line)) {
      // Collect the full quote (may span multiple > lines before attribution)
      const quoteLines = [];
      let quoteStartLine = i + 1; // 1-based
      let j = i;

      // Gather quote lines until we hit the attribution line
      while (j < lines.length) {
        const current = lines[j];

        // Check if this line is the attribution
        if (ATTRIBUTION_RE.test(current)) {
          break;
        }

        // Accumulate quote text from blockquote lines
        if (current.startsWith('>')) {
          quoteLines.push(current.replace(/^>\s*/, ''));
        } else {
          break;
        }
        j++;
      }

      // Check if next line is attribution
      if (j < lines.length && ATTRIBUTION_RE.test(lines[j])) {
        const match = lines[j].match(ATTRIBUTION_RE);
        const quoteText = quoteLines.join(' ')
          .replace(/^[«"]\s*/, '')
          .replace(/\s*[»"]\s*$/, '')
          .trim();

        citations.push({
          file: filePath,
          line: quoteStartLine,
          quoteText,
          author: match[1].trim(),
          title: match[2].trim(),
          year: Number(match[3]),
        });

        i = j + 1;
        continue;
      }
    }

    i++;
  }

  return citations;
}

function countWords(text) {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

export async function checkCitations({ citationsPath, pagesGlob }) {
  const errors = [];

  // Load bibliography
  const yamlText = readFileSync(resolve(citationsPath), 'utf-8');
  const bibliography = parseCitationsYaml(yamlText);

  // Find pages
  const files = findFiles(pagesGlob);

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf-8');
    const rel = relative(process.cwd(), filePath);
    const citations = extractCitations(content, rel);

    for (const cite of citations) {
      // Check word count
      const wordCount = countWords(cite.quoteText);
      if (wordCount > WORD_LIMIT) {
        errors.push({
          file: cite.file,
          line: cite.line,
          message: `Quote exceeds 25 words (${wordCount} words)`,
        });
      }

      // Check citation exists in bibliography
      const found = bibliography.some(entry => {
        const authorMatch = entry.authors && entry.authors.includes(cite.author);
        const yearMatch = entry.year === cite.year;
        return authorMatch && yearMatch;
      });

      if (!found) {
        errors.push({
          file: cite.file,
          line: cite.line,
          message: `Unknown citation: ${cite.author}, ${cite.year}`,
        });
      }
    }
  }

  return { errors };
}

// CLI entry point
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.url.replace('file://', ''));

if (isMain) {
  const { values } = parseArgs({
    options: {
      citations: { type: 'string' },
      pages: { type: 'string' },
    },
  });

  if (!values.citations || !values.pages) {
    console.error('Usage: node scripts/check-citations.mjs --citations PATH --pages GLOB');
    process.exit(2);
  }

  const result = await checkCitations({
    citationsPath: values.citations,
    pagesGlob: values.pages,
  });

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(`${err.file}:${err.line}: ${err.message}`);
    }
    process.exit(1);
  } else {
    console.log('All citations valid.');
    process.exit(0);
  }
}
