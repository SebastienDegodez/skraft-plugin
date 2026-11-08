// The hash of what an agent descriptor makes the agent do.
//
// A published verdict and a carried PR cell vouch for the agent the model ran:
// its prompt and the frontmatter the host reads (name, description, tools,
// model, skills). The `metadata` block reaches no model — Claude Code and the
// Copilot CLI ignore it, only the repository's tooling reads it — so a change
// there (a field dropped, a list moved) must not mark a verdict stale nor
// re-run an evaluation. Everything else counts, byte for byte.
import { createHash } from 'node:crypto'

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/

/**
 * The descriptor without its frontmatter `metadata` block. A content without
 * frontmatter, or without a `metadata` key, is returned unchanged.
 *
 * @param {string} content
 * @returns {string}
 */
export function withoutMetadata(content) {
  const text = String(content ?? '')
  const match = FRONTMATTER.exec(text)
  if (!match) return text
  const lines = match[1].split(/\r?\n/)
  const kept = []
  let inMetadata = false
  for (const line of lines) {
    if (/^\S/.test(line)) inMetadata = /^metadata:/.test(line)
    if (!inMetadata) kept.push(line)
  }
  return `---\n${kept.join('\n')}\n---${match[2]}${text.slice(match[0].length)}`
}

/**
 * The behaviour hash of an agent descriptor, hex sha256.
 *
 * @param {string} content
 * @returns {string}
 */
export const behaviourHash = (content) => createHash('sha256').update(withoutMetadata(content)).digest('hex')

/** The repository paths that hold an agent descriptor: a plugin's agent trees. */
export const isAgentDescriptor = (path) => /^plugins\/[^/]+\/com\.[^/]+\/agents\/.+\.md$/.test(String(path))
