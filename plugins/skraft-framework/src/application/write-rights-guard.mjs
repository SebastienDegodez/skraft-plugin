import { isErr } from '../domain/result.mjs'
import { compileWriteRights, governingAgent, judgeWrite } from '../domain/write-rights-policy.mjs'

// Use case — G8, write rights per agent role. Host-neutral: each host says who calls and
// hands over the tool calls; the rights come from the config (writeRights) and the
// judgement from write-rights-policy.mjs.
//
//   caller   { chain: [name, …] }: the agent that makes the calls, then the agents that
//            spawned it, nearest first, as the host names them; an empty chain is a
//            session no agent runs (Claude Code's main session without --agent). null:
//            the host cannot say who calls.
//   calls    framework tool calls ({ toolName, toolInput, filePath }); a Copilot batch is
//            several, and one refusal refuses them all.
//
// An unidentified caller passes (UNIDENTIFIED_CALLER): G8 refuses only a write it can
// attribute to a role that lacks the right. Copilot's settings hooks never name the
// agent; refusing there would refuse the Software Engineer with everyone else.

export const UNIDENTIFIED_CALLER = 'UNIDENTIFIED_CALLER'
export const NOT_GOVERNED = 'NOT_GOVERNED'
export const NO_WRITE = 'NO_WRITE'
export const CONFORMING = 'CONFORMING'

// Tools that write the file they name.
const FILE_WRITING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

// What one framework tool call writes: the shell line of a Bash call, the file a file tool
// names.
export const writeOf = (call = {}) => {
  const toolInput = call.toolInput && typeof call.toolInput === 'object' ? call.toolInput : {}
  const command = call.toolName === 'Bash' && typeof toolInput.command === 'string' ? toolInput.command : undefined
  const filePath = FILE_WRITING_TOOLS.has(call.toolName)
    ? (call.filePath ?? toolInput.file_path ?? toolInput.filePath ?? toolInput.path ?? toolInput.notebook_path ?? undefined)
    : undefined
  return { command, filePath }
}

const verdict = (allowed, code, reason, agent = null) => Object.freeze({ allowed, code, reason, agent })

export const createWriteRightsGuard = ({ config, trackingDir } = {}) => {
  const compiled = compileWriteRights(config, { trackingDir })
  return Object.freeze({
    judge: ({ caller = null, calls = [], cwd } = {}) => {
      const writes = calls.map(writeOf).filter((write) => write.command !== undefined || write.filePath !== undefined)
      if (writes.length === 0) return verdict(true, NO_WRITE, 'no write')
      if (!caller || !Array.isArray(caller.chain)) {
        return verdict(true, UNIDENTIFIED_CALLER, 'the host does not say which agent writes; write rights are not applied')
      }
      const agent = governingAgent(caller.chain, config)
      if (!agent) {
        const named = caller.chain.find((name) => typeof name === 'string' && name.length > 0)
        return verdict(true, NOT_GOVERNED, named ? `${named} has no write rights to apply` : 'no agent runs this session')
      }
      for (const write of writes) {
        const judged = judgeWrite({ agent, ...write, cwd }, compiled)
        if (isErr(judged)) return verdict(false, judged.error.code, judged.error.reason, agent)
      }
      return verdict(true, CONFORMING, `within the write rights of ${agent}`, agent)
    },
  })
}
