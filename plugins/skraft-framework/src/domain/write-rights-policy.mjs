import { Ok, Err } from './result.mjs'
import { WRITE_RIGHT_DENIED } from './error-codes.mjs'
import { canonicalAgentName } from './instruction-policy.mjs'
import { commandWritesWhere, commandWritesWorkspace, isWorkspacePath } from './session-guard-policy.mjs'
import { joinPath } from './shell-command-reading.mjs'

// Pure domain: write rights per agent role (G8). No IO.
//
// Who may write what is derived from the pipeline config at config:build
// (deriveWriteRights → skraft-framework.config.json::writeRights) and judged here on each
// write (judgeWrite). Five roles:
//
//   orchestrator  the pipeline launcher, and any agent that dispatches the phase agents:
//                 writes nothing (the pipeline's code writes state, reviews and reports)
//   reviewer      a phase reviewer: writes only its transmission files, the outputs it
//                 declares (its review, the patch its lenses read)
//   lens          an agent a reviewer or a lens dispatches: writes only the outputs it
//                 declares (none for every pipeline lens today)
//   specialist    a phase specialist: writes src/ and tests/ only in a WORKSPACE_PHASES
//                 phase (DISTILL, DELIVER); never another agent's transmission file
//   worker        an agent a specialist or a worker dispatches: the rights of the phase
//                 it works in, as the specialist has them
//
// An agent outside writeRights is not governed: G8 lets it write. A caller that is not
// itself governed takes the rights of its nearest governed ancestor (governingAgent): a
// general-purpose agent a reviewer spawns writes as the reviewer does.

export const WRITE_ROLES = Object.freeze({
  ORCHESTRATOR: 'orchestrator',
  REVIEWER: 'reviewer',
  LENS: 'lens',
  SPECIALIST: 'specialist',
  WORKER: 'worker',
})

// Roles that may write only a closed list of files.
const CLOSED_ROLES = new Set([WRITE_ROLES.ORCHESTRATOR, WRITE_ROLES.REVIEWER, WRITE_ROLES.LENS])

const isString = (value) => typeof value === 'string' && value.length > 0

// The tracking directory as a declared output names it.
const DECLARED_TRACKING_PREFIX = '.copilot-tracking/skraft-plans/'
const DEFAULT_TRACKING_DIR = 'skraft-plans'

// A declared output that is a file path, without its trailing note: the path a write
// right names. "structured result block (…)" and other prose are not paths.
const declaredPathOf = (output) => {
  const path = String(output ?? '').replace(/\s+\(.*\)\s*$/, '').trim()
  return path.includes('/') && !/\s/.test(path) ? path : null
}

const declaredPathsOf = (artifacts) =>
  [...new Set((artifacts?.outputs ?? []).map(declaredPathOf).filter(Boolean))]

// writeRights, keyed by agent display name: { role, phase, workspace } for a specialist
// or a worker, { role, phase?, files } for the closed roles.
export const deriveWriteRights = ({
  launcher = null,
  dispatcher = null,
  phaseOrder = [],
  phaseAgents = {},
  agentDispatchers = {},
  agentArtifacts = {},
  workspacePhases = [],
} = {}) => {
  const isAgent = (name) => isString(name) && Object.hasOwn(agentArtifacts, name)
  const rights = new Map()
  const closed = (role, agent, phase) => ({ role, ...(phase ? { phase } : {}), files: declaredPathsOf(agentArtifacts[agent]) })
  const open = (role, phase) => ({ role, phase, workspace: workspacePhases.includes(phase) })

  const orchestrators = [launcher, ...phaseOrder.flatMap((phase) => [phaseAgents[phase]?.specialist, phaseAgents[phase]?.reviewer])
    .map((agent) => agentDispatchers[agent])]
    .filter((agent) => isAgent(agent) && agent !== dispatcher)
  for (const agent of orchestrators) rights.set(agent, closed(WRITE_ROLES.ORCHESTRATOR, agent))

  for (const phase of phaseOrder) {
    const { specialist, reviewer } = phaseAgents[phase] ?? {}
    if (isAgent(specialist) && !rights.has(specialist)) rights.set(specialist, open(WRITE_ROLES.SPECIALIST, phase))
    if (isAgent(reviewer) && !rights.has(reviewer)) rights.set(reviewer, closed(WRITE_ROLES.REVIEWER, reviewer, phase))
  }

  // What a governed agent dispatches works under it: a worker under a specialist or a
  // worker, a lens under a reviewer or a lens.
  let grew = true
  while (grew) {
    grew = false
    for (const [agent, by] of Object.entries(agentDispatchers)) {
      const parent = rights.get(by)
      if (!isAgent(agent) || rights.has(agent) || !parent || parent.role === WRITE_ROLES.ORCHESTRATOR) continue
      rights.set(agent, CLOSED_ROLES.has(parent.role)
        ? closed(WRITE_ROLES.LENS, agent, parent.phase)
        : { ...open(WRITE_ROLES.WORKER, parent.phase), workspace: parent.workspace })
      grew = true
    }
  }
  return Object.fromEntries([...rights].sort(([a], [b]) => a.localeCompare(b)))
}

// The agent whose rights govern a caller: the first of its chain (the caller, then the
// agents that spawned it, nearest first) that writeRights names, canonically. null when
// none does: the caller is not governed.
export const governingAgent = (chain, config) => {
  const writeRights = config?.writeRights ?? {}
  for (const name of Array.isArray(chain) ? chain : []) {
    const agent = canonicalAgentName(name, config)
    if (agent && Object.hasOwn(writeRights, agent)) return agent
  }
  return null
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A declared path as a regular expression on a '/'-separated path: {placeholder} is one
// segment's worth of text, **/ any number of directories, ** any text, * any text within a
// segment. A path under the
// tracking directory matches wherever the tracking directory is (its name alone counts,
// as G7 reads it).
const pathPattern = (declared, trackingDirs) => {
  const tracked = declared.startsWith(DECLARED_TRACKING_PREFIX)
  const rest = tracked ? declared.slice(DECLARED_TRACKING_PREFIX.length) : declared
  const body = rest.split(/(\{[^}]*\}|\*\*\/|\*\*|\*)/).map((piece) => {
    if (piece === '**/') return '(?:.*/)?'
    if (piece === '**') return '.*'
    if (piece === '*') return '[^/]*'
    if (/^\{[^}]*\}$/.test(piece)) return '[^/]+'
    return escapeRegExp(piece)
  }).join('')
  const head = tracked ? `(?:^|/)(?:${trackingDirs.map(escapeRegExp).join('|')})/` : '(?:^|/)'
  return new RegExp(`${head}${body}$`, 'i')
}

// The directories between the tracking directory's project folder and a tracked file:
// removing one removes the file with it (reviews/ and reviews/{date}/ for a review).
const holdingDirs = (declared, trackingDirs) => {
  if (!declared.startsWith(DECLARED_TRACKING_PREFIX)) return []
  const segments = declared.slice(DECLARED_TRACKING_PREFIX.length).split('/').slice(1, -1)
  return segments.map((_, k) => pathPattern(`${DECLARED_TRACKING_PREFIX}{slug}/${segments.slice(0, k + 1).join('/')}`, trackingDirs))
}

// A path that matches the declared one, for a find -exec the guard reads.
const sampleOf = (declared) => declared.replace(/\{[^}]*\}|\*\*|\*/g, 'x')

const normalised = (path, cwd) => joinPath(isString(cwd) ? cwd : '', String(path))

// A here-document whose body only feeds a command's input (a verdict YAML, a commit
// message) is text, not commands: G8 reads the line without it. A body that a shell or an
// interpreter reads as its program — `bash <<EOF`, `python3 - <<EOF`, `cat <<EOF | sh` — runs,
// and is kept; `node script.mjs <<EOF` hands the script its input.
const HERE_DOC_RE = /<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/
const INTERPRETER_RE = /^(?:sh|bash|zsh|dash|ksh|mksh|ash|eval|source|\.|node|nodejs|deno|bun|python[0-9.]*|perl|ruby|php|pwsh|powershell)$/
const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/
// True when the simple command `words` reads its standard input as a program.
const readsProgram = (words) => {
  const rest = words.filter((word) => !ASSIGNMENT_RE.test(word))
  const verb = (rest[0] ?? '').split(/[/\\]/).pop()
  return INTERPRETER_RE.test(verb) && rest.slice(1).every((word) => word.startsWith('-') || /^<</.test(word))
}
const bodyRuns = (line, at) => {
  const before = line.slice(0, at).split(/\|\||&&|;|\|/).pop()
  const after = line.slice(at).split('|').slice(1)
  const words = (text) => text.trim().split(/\s+/).filter(Boolean)
  return readsProgram(words(before)) || after.some((segment) => readsProgram(words(segment)))
}
export const withoutHereDocBodies = (command) => {
  if (!isString(command)) return command
  const lines = command.split('\n')
  const kept = []
  for (let i = 0; i < lines.length; i += 1) {
    kept.push(lines[i])
    const here = HERE_DOC_RE.exec(lines[i])
    if (!here || bodyRuns(lines[i], here.index)) continue
    const tabs = lines[i].slice(here.index).startsWith('<<-')
    let end = i + 1
    while (end < lines.length && (tabs ? lines[end].replace(/^\t+/, '') : lines[end]) !== here[2]) end += 1
    if (end >= lines.length) continue // no closing delimiter: read the rest as the shell would run it
    kept.push(lines[end])
    i = end
  }
  return kept.join('\n')
}

// Where a shell sends what it discards or prints: never a file anybody writes.
const DEVICE_RE = /^\/dev\/(?:null|stdout|stderr|tty|fd\/\d+)$|(?:^|\/)nul$/i

// The rights in a form judgeWrite reads fast: compiled once per config and tracking
// directory.
export const compileWriteRights = (config, { trackingDir } = {}) => {
  const writeRights = config?.writeRights ?? {}
  const trackingDirs = [...new Set([DEFAULT_TRACKING_DIR, trackingDir].filter(isString))]
  const filesOf = (agent) => (writeRights[agent]?.files ?? []).map((declared) => ({
    declared,
    pattern: pathPattern(declared, trackingDirs),
    holders: holdingDirs(declared, trackingDirs),
  }))
  const owned = new Map(Object.keys(writeRights).map((agent) => [agent, filesOf(agent)]))
  // Every transmission file, with its owner: what no other agent may write.
  const transmission = [...owned].flatMap(([owner, files]) => files.map((file) => ({ owner, ...file })))
  return Object.freeze({ writeRights, owned, transmission })
}

const denied = (reason) => Err({ code: WRITE_RIGHT_DENIED, reason })

// G8 — may `agent` make this write? `filePath` is the file a file tool writes, `command`
// the shell line a shell tool runs, read for the files it writes: a closed role may name
// only its own files (and the null device), a specialist or a worker never another agent's
// transmission file, nor src/ or tests/ outside a workspace phase. An agent writeRights
// does not name passes.
export const judgeWrite = ({ agent, command: shellLine, filePath, cwd } = {}, compiled = compileWriteRights({})) => {
  const rights = isString(agent) ? compiled.writeRights[agent] : undefined
  if (!rights) return Ok({ governed: false })
  const path = isString(filePath) ? normalised(filePath, cwd) : null
  const command = withoutHereDocBodies(shellLine)

  if (CLOSED_ROLES.has(rights.role)) {
    const files = compiled.owned.get(agent) ?? []
    const allowed = files.length > 0 ? `only ${files.map((file) => file.declared).join(', ')}` : 'nothing'
    if (path !== null && !files.some((file) => file.pattern.test(path))) {
      return denied(`${agent} (${rights.role}) writes ${allowed}; ${filePath} is not one of them`)
    }
    const outside = (candidate) => !DEVICE_RE.test(candidate) && !files.some((file) => file.pattern.test(candidate))
    if (commandWritesWhere(command, { matches: outside, holds: outside, sample: '/x', cwd })) {
      return denied(`${agent} (${rights.role}) writes ${allowed}; this command writes elsewhere`)
    }
    return Ok({ governed: true })
  }

  const theirs = compiled.transmission.filter((file) => file.owner !== agent)
  const ownerOf = (candidate) => theirs.find((file) => file.pattern.test(candidate))?.owner
  if (path !== null && ownerOf(path)) {
    return denied(`${agent} never writes ${filePath}: it is a transmission file of ${ownerOf(path)}`)
  }
  if (theirs.length > 0 && commandWritesWhere(command, {
    matches: (candidate) => Boolean(ownerOf(candidate)),
    holds: (candidate) => theirs.some((file) => file.holders.some((holder) => holder.test(candidate))),
    sample: sampleOf(theirs[0].declared),
    cwd,
  })) {
    return denied(`${agent} never writes the transmission files of a reviewer (${[...new Set(theirs.map((file) => file.owner))].join(', ')})`)
  }
  if (!rights.workspace && (isWorkspacePath(path, { cwd }) || commandWritesWorkspace(command, { cwd }))) {
    return denied(`${agent} works in ${rights.phase}, whose agents never write src/ or tests/`)
  }
  return Ok({ governed: true })
}
