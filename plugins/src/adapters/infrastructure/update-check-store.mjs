// Outbound adapter: JSON file store for the machine-global update check
// ({ checkedAt, latestVersion }). Reads fail open to null; writes are
// best-effort (ADR-006: the staleness notice is observability, never a gate).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export const createUpdateCheckStore = ({ storePath } = {}) => ({
  read: async () => {
    try {
      const { checkedAt = null, latestVersion = null } = JSON.parse(await readFile(storePath, 'utf8'))
      return { checkedAt, latestVersion }
    } catch {
      return null
    }
  },

  write: async ({ checkedAt, latestVersion }) => {
    try {
      await mkdir(dirname(storePath), { recursive: true })
      await writeFile(storePath, JSON.stringify({ checkedAt, latestVersion }) + '\n')
    } catch { /* best-effort: an unwritable store never blocks the session */ }
  }
})
