// Minimal front matter reader for the agentic primitives this repository ships.
//
// SKILL.md and *.agent.md front matter uses a tiny YAML subset: scalars, quoted
// scalars, block scalars (`>` / `|`) and sequences. Reading it without a YAML
// dependency keeps every eng/ script runnable from a bare `node`, with no
// install step, in any CI job.

/**
 * Split a markdown document into its front matter data and its body.
 * @param {string} content raw file content
 * @returns {{ data: Record<string, string | string[]>, body: string }}
 */
export function readFrontMatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content)
  if (!match) return { data: {}, body: content }

  const data = {}
  const lines = match[1].split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const entry = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(lines[index])
    if (!entry) continue

    const [, key, rawValue] = entry
    const value = rawValue.trim()

    // Block scalar: `>` folds newlines into spaces, `|` keeps them.
    if (/^[>|][-+]?$/.test(value)) {
      const block = []
      while (index + 1 < lines.length && /^[ \t]+\S/.test(lines[index + 1])) {
        block.push(lines[index + 1].trim())
        index += 1
      }
      data[key] = block.join(value.startsWith('>') ? ' ' : '\n')
      continue
    }

    // Empty value: either a sequence on the following lines, or a blank scalar.
    if (value === '') {
      const items = []
      while (index + 1 < lines.length && /^[ \t]*-[ \t]+/.test(lines[index + 1])) {
        items.push(lines[index + 1].replace(/^[ \t]*-[ \t]+/, '').trim())
        index += 1
      }
      data[key] = items.length ? items : ''
      continue
    }

    data[key] = value.replace(/^"([\s\S]*)"$/, '$1').replace(/^'([\s\S]*)'$/, '$1')
  }

  return { data, body: content.slice(match[0].length) }
}
