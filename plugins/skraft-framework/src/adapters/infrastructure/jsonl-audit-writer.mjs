import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

export const createJsonlAuditWriter = (filePath) => ({
  write: async (entry) => {
    // Audit log stays append-only: one JSON object per line, never rewrite old lines.
    await mkdir(dirname(filePath), { recursive: true })
    await appendFile(filePath, JSON.stringify(entry) + '\n', 'utf8')
  }
})
