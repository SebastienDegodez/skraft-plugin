import { isErr } from '../domain/result.mjs'
import { compileWriteRights, governingAgent, judgeWrite } from '../domain/write-rights-policy.mjs'

// Use case — G8, write rights per agent role. Host-neutral: each host says who calls and
// hands over the tool calls; the rights come from the config (writeRights) and the
// judgement from write-rights-policy.mjs.
//
//   caller   { chain: [name, …], complete }: the agent that makes the calls, then the
//            agents that spawned it, nearest first, as the host names them; an empty chain
//            is a session no agent runs (Claude Code's main session without --agent).
//            complete: false when the host knows only the start of the chain (Copilot, a
//            sub-agent whose spawner it cannot name): a chain no governed agent starts is
//            then unidentified. null: the host cannot say who calls.
//   calls    framework tool calls ({ toolName, toolInput, filePath }); a Copilot batch is
//            several, and one refusal refuses them all.
//   trackingRoot  where the session's pipelines are tracked (SKRAFT_TRACKING_ROOT, or
//            .copilot-tracking/skraft-plans under the session directory): a transmission
//            file is read from it.
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

// The files an apply_patch body names: added, updated, deleted, or moved to.
const PATCH_FILE_RE = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm
const patchFilesOf = (body) => [...String(body).matchAll(PATCH_FILE_RE)].map((match) => match[1].trim())
const isText = (value) => typeof value === 'string' && value.length > 0

const writeAs = (fields) => ({ command: undefined, filePaths: [], typed: false, opaque: false, ...fields, filePath: fields.filePaths?.[0] })
const patchWrite = (body) => {
  const filePaths = patchFilesOf(body)
  return writeAs({ filePaths, opaque: filePaths.length === 0 })
}

// What one framework tool call writes: the shell line of a Bash call (`typed` when it is
// text typed into a running program, Copilot's write_bash), the files a file tool names
// (`filePath` the first of them), `opaque` when it writes files it does not name.
export const writeOf = (call = {}) => {
  const toolInput = call.toolInput && typeof call.toolInput === 'object' ? call.toolInput : {}
  if (call.toolName === 'Bash') return writeAs({ command: isText(toolInput.command) ? toolInput.command : undefined })
  if (call.toolName === 'WriteBash') {
    const text = isText(toolInput.input) ? toolInput.input : toolInput.command
    return writeAs({ command: isText(text) ? text : undefined, typed: true })
  }
  if (FILE_WRITING_TOOLS.has(call.toolName)) {
    const filePath = call.filePath ?? toolInput.file_path ?? toolInput.filePath ?? toolInput.path ?? toolInput.notebook_path
    if (filePath !== undefined) return writeAs({ filePaths: [filePath] })
    // Copilot reports its apply_patch to Claude-format hooks as Edit, the patch as input.
    return isText(toolInput.input) ? patchWrite(toolInput.input) : writeAs({})
  }
  if (call.toolName === 'StrReplaceEditor') {
    return writeAs({ filePaths: toolInput.command !== 'view' && toolInput.path !== undefined ? [toolInput.path] : [] })
  }
  if (call.toolName === 'ApplyPatch') return patchWrite(isText(toolInput.input) ? toolInput.input : toolInput.patch ?? '')
  return writeAs({})
}

const verdict = (allowed, code, reason, agent = null) => Object.freeze({ allowed, code, reason, agent })

export const createWriteRightsGuard = ({ config, trackingRoot } = {}) => {
  const compiled = compileWriteRights(config, { trackingRoot })
  return Object.freeze({
    judge: ({ caller = null, calls = [], cwd } = {}) => {
      const writes = calls.map(writeOf).filter((write) => write.command !== undefined || write.filePaths.length > 0 || write.opaque || write.typed)
      if (writes.length === 0) return verdict(true, NO_WRITE, 'no write')
      if (!caller || !Array.isArray(caller.chain)) {
        return verdict(true, UNIDENTIFIED_CALLER, 'the host does not say which agent writes; write rights are not applied')
      }
      const agent = governingAgent(caller.chain, config)
      if (!agent && caller.complete === false) {
        return verdict(true, UNIDENTIFIED_CALLER, 'the host does not say which agent spawned this one; write rights are not applied')
      }
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
