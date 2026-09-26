import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024
const unavailable = () => new Error('TRANSCRIPT_UNAVAILABLE')

const readNativeTranscript = async (path, maxBytes) => {
  if (typeof path !== 'string' || !path || extname(path) !== '.jsonl' ||
      !Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw unavailable()

  const absolutePath = resolve(path)
  for (let entry = absolutePath; ; entry = dirname(entry)) {
    const info = await lstat(entry)
    if (info.isSymbolicLink()) throw unavailable()
    if (entry === absolutePath && !info.isFile()) throw unavailable()
    if (entry === dirname(entry)) break
  }

  const file = await open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await file.stat()
    if (!info.isFile() || info.size === 0 || info.size > maxBytes) throw unavailable()

    // Read at most the budget plus one byte, including growth after stat.
    const chunks = []
    let total = 0
    while (total <= maxBytes) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, maxBytes - total + 1))
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null)
      if (bytesRead === 0) break
      total += bytesRead
      if (total > maxBytes) throw unavailable()
      chunks.push(buffer.subarray(0, bytesRead))
    }
    if (total === 0) throw unavailable()
    return Buffer.concat(chunks).toString('utf8')
  } finally {
    await file.close()
  }
}

// Inline arrays retain their existing semantics. Native reads use child evidence
// only; the parent's transcript_path is never a fallback.
export const createJsonlTranscriptReader = ({ transcript, agent_transcript_path, agentTranscriptPath, maxBytes = DEFAULT_MAX_BYTES } = {}) => ({
  read: async () => {
    if (Array.isArray(transcript) && transcript.length > 0) {
      return JSON.stringify(transcript)
    }
    return readNativeTranscript(agentTranscriptPath ?? agent_transcript_path, maxBytes)
  }
})
