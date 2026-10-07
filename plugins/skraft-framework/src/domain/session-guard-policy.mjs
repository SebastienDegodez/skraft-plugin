import { Ok, Err } from './result.mjs'
import { STATE_WRITE_FORBIDDEN, UNMONITORED_WRITE } from './error-codes.mjs'
import { readCommandLine, joinPath, UNKNOWN } from './shell-command-reading.mjs'

// Pure domain: session-guard policy (G7/G8). No IO.
//
// G7 — the recorded pipeline state (state.json) and the DELIVER execution-log are
// mutable ONLY through the state CLI (S7 deterministic tool bridge). Any attempt to
// edit them directly — a shell redirection/mutation command, or a Write/Edit file
// tool targeting them — is denied. Reads stay allowed (the CLI is the sanctioned
// write path; #57 deny + #60 CLI = A9 strong form).
//
// G8 — during DELIVER, edits to the workspace (src/ and tests/) must happen inside
// the monitored DELIVER sub-agent. A write attempted outside that agent (e.g. the
// orchestrator session itself) is blocked so the phase boundary stays inviolable.

// Artifacts that may only change through the state CLI, all under the tracking directory
// (default .copilot-tracking/skraft-plans): each project's state.json and execution log,
// and the active-pipeline pointer the hooks trust. Any other state.json is not ours.
const DEFAULT_TRACKING_DIR = 'skraft-plans'
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const protectedPathRe = (trackingDir) => new RegExp(
  `(?:^|[\\s/\\\\"'=(])(?:${[...new Set([DEFAULT_TRACKING_DIR, trackingDir].filter(Boolean))].map(escapeRegExp).join('|')})[/\\\\](?:[a-z0-9]+(?:-[a-z0-9]+)*[/\\\\](?:state\\.json|execution-log\\.jsonl?)|\\.active-slug)(?=$|["'\\s|;&)<>,])`,
  'i'
)

// Shell commands whose first word rewrites or removes the files it names. For the
// copy-like verbs only the destination (last operand, or -t DIR) is written; the sources
// are read.
const REWRITING_VERBS = new Set(['rm', 'mv', 'tee', 'truncate', 'dd', 'shred', 'unlink', 'touch', 'vi', 'vim', 'nano', 'emacs', 'ex', 'ed', 'patch', 'sponge'])
const COPYING_VERBS = new Set(['cp', 'install', 'ln', 'rsync'])
const INLINE_INTERPRETERS = /^(?:node|nodejs|deno|bun|python[0-9.]*|perl|ruby|php)$/
const INLINE_SCRIPT_FLAGS = new Set(['-e', '--eval', '-c', '-p', '--print', '-r'])
const SHELLS = /^(?:sh|bash|zsh|dash|ksh|mksh|ash)$/
const GIT_WRITING_SUBCOMMANDS = new Set(['checkout', 'restore', 'rm', 'mv', 'clean'])
const FIND_ACTIONS = new Set(['-delete', '-exec', '-execdir', '-ok', '-okdir', '-fprint', '-fprintf', '-fls'])
const FIND_FILTERS = new Set(['-name', '-iname', '-path', '-ipath', '-wholename', '-iwholename', '-regex', '-iregex'])
const SHELL_KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'while', 'until', 'do', '!', '{', 'coproc'])
// Wrappers that run the command after them, and their options that take a value.
const WRAPPERS = new Map([
  ['sudo', new Set(['-u', '-g', '-C', '-h', '-p', '-r', '-t', '-U', '-D', '--user', '--group', '--chdir', '--prompt'])],
  ['doas', new Set(['-u', '-C'])],
  ['env', new Set(['-u', '--unset', '-C', '--chdir', '-S', '--split-string'])],
  ['xargs', new Set(['-I', '-n', '-L', '-P', '-d', '-E', '-s', '-a', '--arg-file', '--delimiter', '--max-args', '--max-procs', '--max-lines'])],
  ['time', new Set(['-f', '-o', '--format', '--output'])],
  ['nice', new Set(['-n', '--adjustment'])],
  ['timeout', new Set(['-s', '-k', '--signal', '--kill-after'])],
  ['stdbuf', new Set(['-i', '-o', '-e'])],
  ['ionice', new Set(['-c', '-n', '-p'])],
  ['command', new Set()], ['builtin', new Set()], ['exec', new Set(['-a'])], ['nohup', new Set()],
])
const ASSIGNMENT_WORD = /^[A-Za-z_][A-Za-z0-9_]*=/
const PROTECTED_NAME = /(?:^|\/)(?:state\.json|execution-log\.jsonl?|\.active-slug)$/i
const PATHS_IN_SCRIPT = /[^\s'"`(),;[\]{}]*?(?:state\.json|execution-log\.jsonl?|\.active-slug)/gi

const baseName = (path) => String(path).replace(/[/\\]+$/, '').split(/[/\\]/).pop()
const optionValue = (word, long) => (word.startsWith(`${long}=`) ? word.slice(long.length + 1) : null)

// The verb of a simple command once assignments, wrappers (with their options) and shell
// keywords are set aside, its operands, and what the wrappers changed: a directory
// (env -C, sudo -D), a command string (env -S), input from xargs.
const commandOf = (words) => {
  let i = 0
  let chdir = null
  let split = null
  let viaXargs = false
  while (i < words.length) {
    const word = words[i]
    if (ASSIGNMENT_WORD.test(word) || SHELL_KEYWORDS.has(word)) { i += 1; continue }
    const wrapper = WRAPPERS.get(baseName(word))
    if (!wrapper) break
    const name = baseName(word)
    if (name === 'xargs') viaXargs = true
    i += 1
    while (i < words.length && words[i].startsWith('-') && words[i] !== '-') {
      const option = words[i]
      const takesValue = wrapper.has(option)
      const value = takesValue ? words[i + 1] : (optionValue(option, '--chdir') ?? optionValue(option, '--split-string') ?? (/^-[CDS]./.test(option) ? option.slice(2) : null))
      if ((option === '-C' || option === '--chdir' || option === '-D' || option.startsWith('--chdir=') || /^-[CD]./.test(option)) && value) chdir = value
      if ((option === '-S' || option === '--split-string' || option.startsWith('--split-string=') || /^-S./.test(option)) && value) split = value
      i += takesValue ? 2 : 1
      if (option === '--') break
    }
    while (i < words.length && ASSIGNMENT_WORD.test(words[i])) i += 1 // env NAME=value cmd
    if (name === 'timeout' && i < words.length) i += 1 // its duration
  }
  const [verb = '', ...operands] = words.slice(i)
  return { verb: baseName(verb), operands, chdir, split, viaXargs }
}

const nonOptions = (operands) => operands.filter((w) => !w.startsWith('-') || w === '-')
const REMOVING_VERBS = new Set(['rm', 'rmdir', 'shred', 'unlink'])
const GIT_OPTIONS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix'])

// What a simple command changes: `files` it writes, `trees` it removes or restores
// whole (a directory takes every file under it along), command lines it runs
// (`scripts`: sh -c, eval, find -exec), and a directory it runs from (git -C).
const writesOf = ({ verb, operands }) => {
  const files = []
  const trees = []
  const scripts = []
  let chdir = null
  const inPlace = operands.some((w) => /^-[A-Za-z]*i/.test(w) || w.startsWith('--in-place'))
  if (REMOVING_VERBS.has(verb)) {
    trees.push(...nonOptions(operands))
  } else if (verb === 'mv') {
    const paths = nonOptions(operands)
    const destination = paths.at(-1)
    trees.push(...(paths.length > 1 ? paths.slice(0, -1) : paths)) // a lone operand: refuse it too
    if (paths.length > 1) files.push(destination, ...paths.slice(0, -1).map((source) => `${destination}/${baseName(source)}`))
  } else if (REWRITING_VERBS.has(verb)) {
    // dd reads its if=; anything else it names (of=, a stray operand) counts as written.
    if (verb === 'dd') files.push(...operands.filter((w) => !w.startsWith('if=')).map((w) => w.replace(/^of=/, '')))
    else files.push(...nonOptions(operands))
  } else if (COPYING_VERBS.has(verb)) {
    const target = operands.find((w, k) => operands[k - 1] === '-t' || operands[k - 1] === '--target-directory') ?? operands.map((w) => optionValue(w, '--target-directory')).find(Boolean)
    const paths = nonOptions(operands).filter((w) => w !== target)
    if (target) files.push(...paths.map((source) => `${target}/${baseName(source)}`))
    else if (paths.length > 1) {
      const destination = paths.at(-1)
      files.push(destination, ...paths.slice(0, -1).map((source) => `${destination}/${baseName(source)}`))
    }
  } else if (verb === 'sed' || (verb === 'perl' && inPlace)) {
    if (inPlace) files.push(...nonOptions(operands))
  } else if ((verb === 'awk' || verb === 'gawk') && operands.some((w, k) => w === 'inplace' && operands[k - 1] === '-i')) {
    files.push(...nonOptions(operands).slice(1))
  } else if (INLINE_INTERPRETERS.test(verb) && operands.some((w) => INLINE_SCRIPT_FLAGS.has(w))) {
    // An inline script naming a target (node -e, python -c…) may write it: refuse, reads
    // have cat, grep and jq. Its arguments and the paths its text names are candidates.
    files.push(...operands)
    for (const text of operands) files.push(...(text.match(PATHS_IN_SCRIPT) ?? []))
  } else if (SHELLS.test(verb)) {
    const flag = operands.findIndex((w) => /^-[A-Za-z]*c[A-Za-z]*$/.test(w))
    if (flag >= 0 && operands[flag + 1] !== undefined) scripts.push(operands[flag + 1])
  } else if (verb === 'eval') {
    scripts.push(operands.join(' '))
  } else if (verb === 'git') {
    let k = 0
    while (k < operands.length && operands[k].startsWith('-')) {
      if (operands[k] === '-C') chdir = operands[k + 1]
      k += GIT_OPTIONS_WITH_VALUE.has(operands[k]) ? 2 : 1
    }
    // checkout/restore rewrite what they name, rm/clean remove it, mv moves it away.
    if (GIT_WRITING_SUBCOMMANDS.has(operands[k])) trees.push(...nonOptions(operands.slice(k + 1)).filter((w) => !w.startsWith('--source=')))
  } else if (verb === 'find' && operands.some((w) => FIND_ACTIONS.has(w))) {
    const starts = []
    for (const w of operands) { if (w.startsWith('-') || w === '(' || w === '!') break; starts.push(w) }
    const patterns = operands.filter((w, k) => FIND_FILTERS.has(operands[k - 1]))
    // Every file under a start point may go: the walk counts when it covers a protected
    // file and either looks for no name, or for one a protected file has.
    trees.push(...(starts.length > 0 ? starts : ['.']).map((start) => ({ start, patterns })))
    const exec = operands.findIndex((w) => FIND_ACTIONS.has(w) && w !== '-delete')
    if (exec >= 0) scripts.push(operands.slice(exec + 1).filter((w) => w !== ';' && w !== '+' && w !== '{}').join(' '))
  }
  return { files, trees, scripts, chdir }
}

// True when a command line changes a path `target` accepts — G7's tracked state, G8's
// workspace. `target.file(path, cwd)` judges a written file, `target.tree(path, cwd)` a
// removed path (itself or what it contains). `cwd` is the directory the line starts in
// ('' = the session directory, null = unknown); `cd` and `pushd` move it as it runs.
const lineWrites = (command, target, cwd = '', depth = 0) => {
  if (depth > 4) return false
  const commands = readCommandLine(command)
  const everyWord = commands.flatMap((c) => [...c.words, ...c.redirects.map((r) => r.target)])
  let dir = cwd
  for (const { words, redirects } of commands) {
    const parsed = commandOf(words)
    let here = parsed.chdir === null ? dir : moveTo(dir, parsed.chdir)
    if (redirects.some((r) => target.file(r.target, here))) return true
    if (parsed.verb === 'cd' || parsed.verb === 'pushd') {
      dir = moveTo(dir, nonOptions(parsed.operands)[0])
      continue
    }
    if (parsed.verb === 'popd') { dir = null; continue }
    if (parsed.split && lineWrites(parsed.split, target, here, depth + 1)) return true
    const { files, trees, scripts, chdir } = writesOf(parsed)
    if (chdir !== null) here = moveTo(here, chdir)
    if (files.some((path) => target.file(path, here))) return true
    if (trees.some((tree) => (typeof tree === 'string' ? target.tree(tree, here) : target.walk(tree, here)))) return true
    // xargs hands the command the words the rest of the line produces.
    if (parsed.viaXargs && (files.length > 0 || trees.length > 0 || REWRITING_VERBS.has(parsed.verb) || COPYING_VERBS.has(parsed.verb) || REMOVING_VERBS.has(parsed.verb))) {
      const judge = REMOVING_VERBS.has(parsed.verb) || parsed.verb === 'mv' ? target.tree : target.file
      if (everyWord.some((word) => judge(word, here))) return true
    }
    if (scripts.some((script) => lineWrites(script, target, here, depth + 1))) return true
  }
  return false
}

// The directory after `cd target`: unknown when the target is (~, -, $HOME, nothing).
const moveTo = (dir, target) => {
  if (dir === null || target === undefined || target === '-' || target.startsWith('~') || target.includes(UNKNOWN)) return null
  return joinPath(dir, target)
}

const PROTECTED_NAMES = ['state.json', 'execution-log.json', 'execution-log.jsonl', '.active-slug']
const GLOB = /[*?[]/
const globRe = (pattern) => new RegExp(`^${pattern.split('').map((char) => (char === '*' ? '[^/]*' : char === '?' ? '[^/]' : /[.+^${}()|\\\]]/.test(char) ? `\\${char}` : char)).join('')}$`, 'i')
const safeGlobRe = (pattern) => { try { return globRe(pattern) } catch { return /^$/ } }

// G7's target: the tracked state, execution log and active pointer, once the path is
// resolved from `cwd`. A path the guard cannot resolve (an unknown variable or directory)
// counts when it ends in a protected file name — refusing a stray state.json is cheaper
// than missing ours. A glob counts when it can match a protected path. Removing a path
// counts when it holds a protected file: a project directory, the tracking directory, its
// parent, or the session directory and above (`root`, where the line started).
const protectedTarget = (trackingDir, root) => {
  const re = protectedPathRe(trackingDir)
  const dirName = trackingDir || DEFAULT_TRACKING_DIR
  const rootPath = joinPath(root ?? '', '.')
  // What a glob segment could stand for where it stands: a protected file name anywhere,
  // the tracking directory under .copilot-tracking, its parent in the session directory,
  // a project slug under the tracking directory.
  const namesAt = (parts, k) => {
    const parent = (parts[k - 1] ?? '').toLowerCase()
    const parentPath = joinPath(parts.slice(0, k).join('/') || '.', '.')
    return [
      ...PROTECTED_NAMES,
      ...(parent === '.copilot-tracking' ? [dirName] : []),
      ...(parent === dirName.toLowerCase() || parent === DEFAULT_TRACKING_DIR ? ['x'] : []),
      ...(parentPath === rootPath ? ['.copilot-tracking', dirName] : []),
    ]
  }
  // A glob path becomes the concrete paths it could name, glob segments at most 3.
  const expansions = (path) => {
    const segments = path.split('/')
    const globbed = segments.map((segment, k) => (GLOB.test(segment) ? k : -1)).filter((k) => k >= 0)
    if (globbed.length === 0) return [path]
    if (globbed.length > 3) return []
    let paths = [segments]
    for (const k of globbed) {
      const re2 = safeGlobRe(segments[k])
      paths = paths.flatMap((parts) => namesAt(parts, k).filter((name) => re2.test(name)).map((name) => parts.map((part, j) => (j === k ? name : part))))
    }
    return paths.map((parts) => parts.join('/'))
  }
  const resolve = (path, cwd) => {
    if (!isString(path)) return null
    if (path.includes(UNKNOWN)) return { unknown: path.split(UNKNOWN).join('') }
    const absolute = /^(?:[/\\]|[A-Za-z]:[/\\])/.test(path)
    if (cwd === null && !absolute) return { unknown: path }
    return { path: joinPath(cwd ?? '', path) }
  }
  const file = (path, cwd) => {
    const resolved = resolve(path, cwd)
    if (!resolved) return false
    if (resolved.unknown !== undefined) return PROTECTED_NAME.test(resolved.unknown) || expansions(resolved.unknown.replace(/\\/g, '/')).some((p) => p !== resolved.unknown && PROTECTED_NAME.test(p))
    return expansions(resolved.path).some((p) => re.test(p))
  }
  const holdsProtected = (path) => {
    const segments = path.split('/')
    const last = segments.at(-1)?.toLowerCase()
    const parent = segments.at(-2)?.toLowerCase()
    if (last === dirName.toLowerCase() || last === '.copilot-tracking') return true
    if ((parent === dirName.toLowerCase() || parent === DEFAULT_TRACKING_DIR) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(last ?? '')) return true
    // The session directory or one of its ancestors holds the tracking directory.
    return path === rootPath || rootPath.startsWith(path === '/' ? '/' : `${path}/`) || (rootPath === '.' && (path === '.' || path === '..' || path.startsWith('../')))
  }
  const tree = (path, cwd) => {
    if (file(path, cwd)) return true
    const resolved = resolve(path, cwd)
    if (!resolved) return false
    if (resolved.unknown !== undefined) {
      const unknown = resolved.unknown.replace(/\\/g, '/').replace(/\/+$/, '')
      return unknown === '' || unknown === '.' || unknown === '..' || holdsProtected(unknown) || expansions(unknown).some((p) => p !== unknown && holdsProtected(p))
    }
    return expansions(resolved.path).some((p) => holdsProtected(p))
  }
  // find START [filters] -delete|-exec: the walk counts when START holds a protected file
  // (or is one) and the filters can select one.
  const walk = ({ start, patterns }, cwd) => {
    if (!tree(start, cwd)) return false
    if (patterns.length === 0) return true
    return patterns.some((pattern) => {
      const re2 = safeGlobRe(baseName(pattern))
      return PROTECTED_NAMES.some((name) => re2.test(name)) || pattern.toLowerCase().includes(dirName.toLowerCase())
    })
  }
  return { file, tree, walk }
}

// A path under src/ or tests/ (the monitored workspace).
const WORKSPACE_PATH_RE = /(?:^|[/\\])(?:src|tests)[/\\]/i

// A mutating command applied to a path under src/ or tests/.
const MUTATING_WORKSPACE_RE = /\b(?:rm|mv|cp|truncate|dd|install|vi|vim|nano|emacs|ex)\b[^\n]*?(?:^|[\s"'=([{/\\])(?:src|tests)[/\\]/i

const isString = (value) => typeof value === 'string' && value.length > 0

// True when a file path targets a protected artifact of the tracking directory; a
// relative path is resolved from the session directory `cwd` when given.
export const isProtectedArtifactPath = (filePath, { trackingDir, cwd } = {}) =>
  isString(filePath) && protectedTarget(trackingDir, cwd ?? '').file(filePath, cwd ?? '')

// True when a shell command rewrites, removes or overwrites a protected artifact, read
// the way the shell reads it: quotes and escapes removed, variables the line sets
// substituted, `cd` followed, sh -c / eval / find -exec / xargs looked into. Reading one
// (cat, jq, grep, cp as a source, a redirect of its content elsewhere) is not.
export const commandMutatesProtectedArtifact = (command, { trackingDir, cwd } = {}) =>
  isString(command) && lineWrites(command, protectedTarget(trackingDir, cwd ?? ''), cwd ?? '')

// True when a Write/Edit file path targets the src/ or tests/ workspace.
export const isWorkspacePath = (filePath) =>
  isString(filePath) && WORKSPACE_PATH_RE.test(filePath)

// A src/ or tests/ path segment inside a command line or a path.
const NAMES_WORKSPACE_RE = /(?:^|[\s"'=([{/\\])(?:src|tests)[/\\]/i

// G8's target: a path under src/ or tests/; removing src or tests themselves counts.
const namesWorkspace = (path) => isString(path) && NAMES_WORKSPACE_RE.test(path)
const WORKSPACE_TARGET = Object.freeze({
  file: namesWorkspace,
  tree: (path) => namesWorkspace(path) || (isString(path) && /(?:^|[/\\])(?:src|tests)[/\\]?$/i.test(path)),
  walk: ({ start }) => namesWorkspace(start) || (isString(start) && /(?:^|[/\\])(?:src|tests)[/\\]?$/i.test(start)),
})

// True when a shell command writes into the src/ or tests/ workspace: the forms G7 reads
// (redirections, tee, in-place sed, inline scripts…), plus a mutating verb anywhere on the
// line (git rm…).
export const commandWritesWorkspace = (command) =>
  isString(command) && (MUTATING_WORKSPACE_RE.test(command)
    || lineWrites(command, WORKSPACE_TARGET))

// G7 — deny direct writes to state.json / execution-log; reads pass through.
export const guardProtectedArtifact = ({ command, filePath, trackingDir, cwd } = {}) => {
  if (isProtectedArtifactPath(filePath, { trackingDir, cwd })) {
    return Err({
      code: STATE_WRITE_FORBIDDEN,
      reason: `direct edit of ${filePath} is forbidden; mutate recorded state only through the state CLI`
    })
  }
  if (commandMutatesProtectedArtifact(command, { trackingDir, cwd })) {
    return Err({
      code: STATE_WRITE_FORBIDDEN,
      reason: 'direct edit of a tracked state.json, execution log or active pointer is forbidden; mutate recorded state only through the state CLI'
    })
  }
  return Ok({ reason: 'no direct write to a protected artifact' })
}

// G8 — during DELIVER, block src/ or tests/ writes performed outside a monitored
// DELIVER sub-agent (deliverAgents). Any other phase, or a write by a monitored
// agent, passes through.
export const guardWorkspaceWrite = ({ command, filePath, phase, agentName, deliverAgents = [] } = {}) => {
  if (phase !== 'DELIVER') {
    return Ok({ reason: `session guard inactive outside DELIVER (phase ${phase})` })
  }
  const writesWorkspace = isWorkspacePath(filePath) || commandWritesWorkspace(command)
  if (!writesWorkspace) {
    return Ok({ reason: 'no src/ or tests/ write' })
  }
  if (deliverAgents.includes(agentName)) {
    return Ok({ reason: `workspace write by monitored DELIVER agent ${agentName}` })
  }
  return Err({
    code: UNMONITORED_WRITE,
    reason: `src/ or tests/ write during DELIVER must run inside the monitored DELIVER sub-agent, not ${agentName ?? 'the orchestrator session'}`
  })
}

// Combined evaluation: G7 takes precedence over G8. Returns Ok when neither guard trips.
export const evaluateSessionGuard = ({ command, filePath, phase, agentName, deliverAgents, trackingDir, cwd } = {}) => {
  const protectedResult = guardProtectedArtifact({ command, filePath, trackingDir, cwd })
  if (protectedResult.ok === false) return protectedResult
  return guardWorkspaceWrite({ command, filePath, phase, agentName, deliverAgents })
}
