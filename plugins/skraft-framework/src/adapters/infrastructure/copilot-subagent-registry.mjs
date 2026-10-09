import { createReadStream } from 'node:fs'
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { createInterface } from 'node:readline'

// Copilot sub-agent identity. A Copilot sub-agent's PreToolUse payload carries only its
// own `sessionId` — no agent name. Its name lives in the parent session's transcript
// (events.jsonl), on the `subagent.started` event whose `agentId` is that sessionId.
// SubagentStart is the one event that hands over the parent transcript path, so it is
// remembered there, and PreToolUse resolves a session to its agent from it.
// Never throws: a lost or unreadable registry only leaves the session unnamed.

const MAX_TRANSCRIPTS = 16
const MAX_AGENTS = 256
const SUBAGENT_STARTED = 'subagent.started'

const isText = (value) => typeof value === 'string' && value.length > 0

const empty = () => ({ transcripts: [], agents: {} })

const load = async (path) => {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    return {
      transcripts: Array.isArray(parsed?.transcripts) ? parsed.transcripts.filter(isText) : [],
      agents: parsed?.agents && typeof parsed.agents === 'object' && !Array.isArray(parsed.agents) ? parsed.agents : {},
    }
  } catch {
    return empty()
  }
}

// Written whole, then renamed: a concurrent hook never reads half a file.
const save = async (path, registry) => {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, JSON.stringify(registry), 'utf8')
  await rename(temporary, path)
}

const isTranscriptFile = async (path) => {
  if (!isText(path) || extname(path) !== '.jsonl') return false
  try {
    const info = await lstat(path)
    return info.isFile() && !info.isSymbolicLink()
  } catch {
    return false
  }
}

// The agent name a `subagent.started` event of this transcript records for `sessionId`.
const agentNameInTranscript = async (path, sessionId) => {
  if (!(await isTranscriptFile(path))) return null
  const lines = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      if (!line.includes(SUBAGENT_STARTED) || !line.includes(sessionId)) continue
      let event
      try { event = JSON.parse(line) } catch { continue }
      if (event?.type !== SUBAGENT_STARTED) continue
      const agentId = event.agentId ?? event.data?.agentId
      const agentName = event.data?.agentName ?? event.agentName
      if (agentId === sessionId && isText(agentName)) return agentName
    }
  } finally {
    lines.close()
  }
  return null
}

export const createCopilotSubagentRegistry = ({ path }) => ({
  // SubagentStart: keep the parent transcript the next sub-agent will be recorded in.
  remember: async ({ transcriptPath } = {}) => {
    try {
      if (!isText(transcriptPath)) return
      const transcript = resolve(transcriptPath)
      const registry = await load(path)
      if (registry.transcripts[0] === transcript) return
      registry.transcripts = [transcript, ...registry.transcripts.filter((t) => t !== transcript)].slice(0, MAX_TRANSCRIPTS)
      await save(path, registry)
    } catch { /* registry failure must never reach the harness */ }
  },

  // PreToolUse: the agent name of a sub-agent session, or null when none is recorded.
  agentNameOf: async (sessionId) => {
    try {
      if (!isText(sessionId)) return null
      const registry = await load(path)
      if (isText(registry.agents[sessionId])) return registry.agents[sessionId]
      for (const transcript of registry.transcripts) {
        const agentName = await agentNameInTranscript(transcript, sessionId)
        if (!agentName) continue
        const agents = Object.entries({ ...registry.agents, [sessionId]: agentName }).slice(-MAX_AGENTS)
        await save(path, { ...registry, agents: Object.fromEntries(agents) }).catch(() => {})
        return agentName
      }
      return null
    } catch {
      return null
    }
  },
})
