// One-off move of published agent verdicts to the behaviour hash.
//
// Verdicts published before eng/lib/descriptor-hash.mjs carry the sha256 of the
// whole descriptor file. The measured content did not change, only the hash that
// names it, so each such verdict is re-keyed to the behaviour hash of the same
// content: the descriptor at the verdict's commit, read back and checked against
// the old hash first. A verdict whose descriptor cannot be read, or whose content
// does not match its old hash, is left as it is and reported.
import { createHash } from 'node:crypto'

import { behaviourHash } from './descriptor-hash.mjs'

const fileHash = (content) => createHash('sha256').update(content).digest('hex')

/**
 * @param {{ agents?: Record<string, Array<{ commit?: string|null, descriptorSha?: string|null }>> }} history
 * @param {(commit: string, agent: string) => string|null} readAt the descriptor of `agent` at `commit`, null when unreadable
 * @returns {{ history: object, moved: number, kept: Array<{ agent: string, commit: string|null, reason: string }> }}
 */
export function migrateHistory(history, readAt) {
  let moved = 0
  const kept = []
  const agents = Object.fromEntries(Object.entries(history.agents ?? {}).map(([agent, entries]) => [agent, entries.map((entry) => {
    if (!entry.descriptorSha) return entry
    const content = entry.commit ? readAt(entry.commit, agent) : null
    if (content === null) {
      kept.push({ agent, commit: entry.commit ?? null, reason: 'descriptor unreadable at this commit' })
      return entry
    }
    const next = behaviourHash(content)
    if (entry.descriptorSha === next) return entry
    if (fileHash(content) !== entry.descriptorSha) {
      kept.push({ agent, commit: entry.commit, reason: 'descriptor at this commit does not match the published hash' })
      return entry
    }
    moved += 1
    return { ...entry, descriptorSha: next }
  })]))
  return { history: { ...history, agents }, moved, kept }
}
