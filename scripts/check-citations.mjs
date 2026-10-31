// scripts/check-citations.mjs
//
// Checks the handbook pages against the bibliography (docs/website/data/citations.yml):
// a quote attributed to an author is at most 25 words and names an author and year the
// bibliography holds; a link to the citations page (`…/reference/citations.mdx#cite-<key>`)
// names a key the bibliography holds.
//
//   node scripts/check-citations.mjs --citations docs/website/data/citations.yml \
//     --pages "docs/website/docs/**/*.md*" \
//     --pages "docs/website/i18n/fr/docusaurus-plugin-content-docs/current/**/*.md*"

import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { findFiles } from './lib/book.mjs';

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

// A link to an entry of the citations page: `…/reference/citations.mdx#cite-<key>`.
const CITE_LINK_RE = /citations\.mdx?#cite-([a-z0-9][a-z0-9-]*)/g;

function unknownCiteKeys(content, file, keys) {
  const errors = [];
  content.split('\n').forEach((line, i) => {
    for (const [, key] of line.matchAll(CITE_LINK_RE)) {
      if (!keys.has(key)) errors.push({ file, line: i + 1, message: `Unknown citation key: ${key}` });
    }
  });
  return errors;
}

/**
 * @param {{ citationsPath: string, pagesGlob: string | string[] }} options one glob or several
 * (the EN docs/ tree and the FR i18n tree)
 */
export async function checkCitations({ citationsPath, pagesGlob }) {
  const errors = [];

  // Load bibliography
  const yamlText = readFileSync(resolve(citationsPath), 'utf-8');
  const bibliography = parseCitationsYaml(yamlText);
  const keys = new Set(bibliography.map((entry) => entry.key));

  // Find pages
  const files = [pagesGlob].flat().flatMap((glob) => findFiles(glob).sort());

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf-8');
    const rel = relative(process.cwd(), filePath);
    errors.push(...unknownCiteKeys(content, rel, keys));
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
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const { values } = parseArgs({
    options: {
      citations: { type: 'string' },
      pages: { type: 'string', multiple: true },
    },
  });

  if (!values.citations || !values.pages) {
    console.error('Usage: node scripts/check-citations.mjs --citations PATH --pages GLOB [--pages GLOB]');
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
