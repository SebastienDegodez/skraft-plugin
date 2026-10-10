import { Ok, Err } from './result.mjs'
import { WRITE_RIGHT_DENIED } from './error-codes.mjs'
import { canonicalAgentName } from './instruction-policy.mjs'
import {
  commandWritesWhere, commandWritesWorkspace, isGlobPath, isUnresolvedPath, isWorkspacePath, shellOpacity, withoutDataHereDocs,
} from './session-guard-policy.mjs'
import { joinPath, UNKNOWN } from './shell-command-reading.mjs'

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
//
// An agent with no right on src/ and tests/ — the closed roles, a RESEARCH or DESIGN
// specialist — must run shell commands the guard can read to the end: a command it cannot
// (shellOpacity: a program reading its input as more than data, eval, a wrapped or file-run
// shell) is refused, and a path it cannot resolve or a glob counts as a write where it
// could land. A transmission file is read against the tracking root of the session, a
// repository file against the session directory.

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

// True when an agent has no right on src/ and tests/: a closed role (orchestrator,
// reviewer, lens), or a specialist or worker outside the workspace phases.
const isClosedRights = (rights) => Boolean(rights) && (CLOSED_ROLES.has(rights.role) || rights.workspace !== true)
export const isClosedWriter = (agent, config) => {
  const name = canonicalAgentName(agent, config)
  return Boolean(name) && Object.hasOwn(config?.writeRights ?? {}, name) && isClosedRights(config.writeRights[name])
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The tracking root a declared output names, and where it is when nothing says otherwise.
const DECLARED_TRACKING_PREFIX = '.copilot-tracking/skraft-plans/'
const DEFAULT_TRACKING_ROOT = '.copilot-tracking/skraft-plans'

// A declared path as a regular expression on a path read from its root (the tracking root
// for a tracked output, the session directory otherwise): {placeholder} is one segment's
// worth of text, **/ any number of directories, ** any text, * any text within a segment.
const patternOf = (rest) => new RegExp(`^${rest.split(/(\{[^}]*\}|\*\*\/|\*\*|\*)/).map((piece) => {
  if (piece === '**/') return '(?:.*/)?'
  if (piece === '**') return '.*'
  if (piece === '*') return '[^/]*'
  if (/^\{[^}]*\}$/.test(piece)) return '[^/]+'
  return escapeRegExp(piece)
}).join('')}$`, 'i')

// One declared file, compiled: its pattern, the pattern of its name, a path that matches
// it, and — for a tracked file — the directories that hold it from the tracking root down.
const compileFile = (declared) => {
  const tracked = declared.startsWith(DECLARED_TRACKING_PREFIX)
  const rest = tracked ? declared.slice(DECLARED_TRACKING_PREFIX.length) : declared
  const segments = rest.split('/')
  return Object.freeze({
    declared,
    tracked,
    pattern: patternOf(rest),
    name: patternOf(segments.at(-1)),
    sample: rest.replace(/\{[^}]*\}|\*\*\/|\*\*|\*/g, 'x'),
    holders: tracked ? segments.slice(0, -1).map((_, k) => patternOf(segments.slice(0, k + 1).join('/'))) : [],
  })
}

// The rights in a form judgeWrite reads fast: compiled once per config and tracking root.
export const compileWriteRights = (config, { trackingRoot } = {}) => {
  const writeRights = config?.writeRights ?? {}
  const owned = new Map(Object.keys(writeRights).map((agent) => [agent, (writeRights[agent]?.files ?? []).map(compileFile)]))
  // Every transmission file, with its owner: what no other agent may write.
  const transmission = [...owned].flatMap(([owner, files]) => files.map((file) => ({ owner, ...file })))
  return Object.freeze({ writeRights, owned, transmission, trackingRoot: isString(trackingRoot) ? trackingRoot : DEFAULT_TRACKING_ROOT })
}

// A path read from a root, or null when it lies elsewhere. Case does not matter (Windows).
const under = (root, path) => {
  if (!root) return path
  if (path.toLowerCase() === root.toLowerCase()) return ''
  return path.toLowerCase().startsWith(`${root.toLowerCase()}/`) ? path.slice(root.length + 1) : null
}

// Where the files of a session are read from: its tracking root and its directory.
const placesOf = (compiled, cwd) => {
  const project = isString(cwd) ? joinPath('', cwd).replace(/\/+$/, '') : ''
  return { project, tracking: joinPath(project, compiled.trackingRoot).replace(/\/+$/, '') }
}

// True when a resolved, literal path is the declared file.
const isFile = (file, path, places) => {
  const read = under(file.tracked ? places.tracking : places.project, path)
  return read !== null && file.pattern.test(read)
}

// True when a path the line could not resolve, or a glob, could still be the declared
// file: its last segment can be the file's name.
const WILD = new RegExp(`${UNKNOWN}|[*?[]`)
const couldBeFile = (file, path) => {
  const last = path.split('/').at(-1)
  if (!WILD.test(last)) return file.name.test(last)
  const wild = new RegExp(`^${last.split(/(${UNKNOWN}|\*|\?)/).map((piece) => (piece === UNKNOWN || piece === '*' ? '.*' : piece === '?' ? '.' : escapeRegExp(piece))).join('')}$`, 'i')
  return wild.test(file.sample.split('/').at(-1))
}

const denied = (reason) => Err({ code: WRITE_RIGHT_DENIED, reason })

// G8 — may `agent` make this write? `filePaths` are the files a file tool writes (`filePath`
// for one), `command` the shell line a shell tool runs (`typed` into a program already
// running, which the guard does not see), `opaque` a file tool whose targets cannot be read
// (an apply_patch without file headers). An agent writeRights does not name passes.
export const judgeWrite = ({ agent, command: shellLine, filePath, filePaths, opaque = false, typed = false, cwd } = {}, compiled = compileWriteRights({})) => {
  const rights = isString(agent) ? compiled.writeRights[agent] : undefined
  if (!rights) return Ok({ governed: false })
  const places = placesOf(compiled, cwd)
  const paths = [...(Array.isArray(filePaths) ? filePaths : []), filePath].filter(isString)
  const resolved = paths.map((path) => joinPath(places.project, path))
  const command = withoutDataHereDocs(shellLine)
  const closed = CLOSED_ROLES.has(rights.role)
  const strict = isClosedRights(rights)
  const label = `${agent} (${rights.role})`

  if (opaque) return denied(`${label}: this tool call names no file the guard can read`)
  if (strict) {
    const why = typed ? 'it types into a program already running' : shellOpacity(command)
    if (why) return denied(`${label} has no right on src/ or tests/, and this command cannot be read to the end: ${why}; run each step as a plain command that names its paths`)
  }

  if (closed) {
    const files = compiled.owned.get(agent) ?? []
    const allowed = files.length > 0 ? `only ${files.map((file) => file.declared).join(', ')}` : 'nothing'
    const own = (path) => !isUnresolvedPath(path) && !isGlobPath(path) && files.some((file) => isFile(file, path, places))
    const stray = paths.find((_, k) => !own(resolved[k]))
    if (stray !== undefined) return denied(`${label} writes ${allowed}; ${stray} is not one of them`)
    const outside = (path) => !own(path)
    if (commandWritesWhere(command, { file: outside, tree: outside, landing: outside, rewrite: outside }, { cwd, sample: '/x' })) {
      return denied(`${label} writes ${allowed}; this command writes elsewhere, or where the guard cannot tell`)
    }
    return Ok({ governed: true })
  }

  const theirs = compiled.transmission.filter((file) => file.owner !== agent)
  const ownerOf = (path) => theirs.find((file) => (isUnresolvedPath(path) || isGlobPath(path) ? couldBeFile(file, path) : isFile(file, path, places)))?.owner
  const holds = (path) => {
    const read = under(places.tracking, path)
    return read !== null && (read === '' || theirs.some((file) => file.tracked && file.holders.some((holder) => holder.test(read))))
  }
  // A directory between the session directory and the tracking root (.copilot-tracking).
  const leadsToTracking = (path) => path !== places.project && under(places.project, path) !== null && under(path, places.tracking) !== null
  const stolen = paths.findIndex((_, k) => ownerOf(resolved[k]))
  if (stolen >= 0) return denied(`${agent} never writes ${paths[stolen]}: it is a transmission file of ${ownerOf(resolved[stolen])}`)
  if (theirs.length > 0 && commandWritesWhere(command, {
    file: (path) => Boolean(ownerOf(path)),
    tree: (path) => Boolean(ownerOf(path)) || holds(path),
    landing: (path) => Boolean(ownerOf(path)) || holds(path) || isUnresolvedPath(path),
    rewrite: (path) => holds(path) || leadsToTracking(path),
  }, { cwd, sample: `${places.tracking}/${theirs[0].tracked ? theirs[0].sample : 'x'}` })) {
    return denied(`${agent} never writes the transmission files of a reviewer (${[...new Set(theirs.map((file) => file.owner))].join(', ')})`)
  }
  if (!rights.workspace && (resolved.some((path) => isWorkspacePath(path, { cwd: places.project })) || commandWritesWorkspace(command, { cwd, strict: true }))) {
    return denied(`${agent} works in ${rights.phase}, whose agents never write src/ or tests/`)
  }
  return Ok({ governed: true })
}
