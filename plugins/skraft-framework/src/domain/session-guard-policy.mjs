import { Ok, Err } from './result.mjs'
import { STATE_WRITE_FORBIDDEN } from './error-codes.mjs'
import { readCommandLine, joinPath, pipelineAt, UNKNOWN } from './shell-command-reading.mjs'

// Pure domain: session-guard policy (G7/G8). No IO.
//
// G7 — the recorded pipeline state (state.json) and the DELIVER execution-log are
// mutable ONLY through the state CLI (S7 deterministic tool bridge). Any attempt to
// edit them directly — a shell redirection/mutation command, or a Write/Edit file
// tool targeting them — is denied. Reads stay allowed (the CLI is the sanctioned
// write path; #57 deny + #60 CLI = A9 strong form).
//
// G8 reads writes through this module too: the workspace (src/, tests/) a file path or a
// shell command names, and any other path a caller judges (commandWritesWhere). Who may
// write what is write-rights-policy.mjs.

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
const SHELLS = /^(?:sh|bash|zsh|dash|ksh|mksh|ash|pwsh|powershell|cmd)(?:\.exe)?$/i
const GIT_WRITING_SUBCOMMANDS = new Set(['checkout', 'restore', 'rm', 'mv', 'clean'])
const FIND_ACTIONS = new Set(['-delete', '-exec', '-execdir', '-ok', '-okdir', '-fprint', '-fprint0', '-fprintf', '-fls'])
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
  ['fakeroot', new Set(['-l', '-s', '-i', '--lib', '--faked'])], ['setsid', new Set()], ['unbuffer', new Set()],
  ['chronic', new Set()], ['strace', new Set(['-o', '-e', '-p', '-s', '-u', '-E', '-a', '-b', '-I', '-O', '-P', '-S', '-X'])],
  ['ltrace', new Set(['-o', '-e', '-p', '-s', '-u', '-a', '-n'])], ['watch', new Set(['-n', '-d', '--interval'])],
  ['taskset', new Set()], ['parallel', new Set(['-j', '--jobs', '-S', '--sshlogin', '--joblog', '--results'])],
])
// Wrapper options whose value is a file the wrapper writes (time -o, strace -o …).
const WRAPPER_OUTPUTS = new Map([['time', ['-o', '--output']], ['strace', ['-o', '--output']], ['ltrace', ['-o', '--output']], ['parallel', ['--joblog', '--results']]])
// Wrappers that take one positional value before the command (timeout DURATION, taskset MASK).
const WRAPPERS_WITH_POSITIONAL = new Set(['timeout', 'taskset'])
const ASSIGNMENT_WORD = /^[A-Za-z_][A-Za-z0-9_]*=/
const PROTECTED_NAME = /(?:^|\/)(?:state\.json|execution-log\.jsonl?|\.active-slug)$/i
const PATHS_IN_SCRIPT = /[^\s'"`(),;[\]{}]*?(?:state\.json|execution-log\.jsonl?|\.active-slug)/gi

const baseName = (path) => String(path).replace(/[/\\]+$/, '').split(/[/\\]/).pop()
const optionValue = (word, long) => (word.startsWith(`${long}=`) ? word.slice(long.length + 1) : null)

// The verb of a simple command once assignments, wrappers (with their options) and shell
// keywords are set aside, its operands, and what the wrappers changed: a directory
// (env -C, sudo -D), a command string (env -S), input from xargs, files a wrapper writes
// itself (time -o FILE).
const commandOf = (words) => {
  let i = 0
  let chdir = null
  let split = null
  let viaXargs = false
  let wrapped = false
  const outputs = []
  while (i < words.length) {
    const word = words[i]
    if (ASSIGNMENT_WORD.test(word) || SHELL_KEYWORDS.has(word)) { i += 1; continue }
    const wrapper = WRAPPERS.get(baseName(word))
    if (!wrapper) break
    const name = baseName(word)
    wrapped = true
    if (name === 'xargs') viaXargs = true
    i += 1
    // `env -` is `env -i`: an option, not the command.
    while (i < words.length && words[i].startsWith('-') && (words[i] !== '-' || name === 'env')) {
      const option = words[i]
      const takesValue = wrapper.has(option)
      for (const output of WRAPPER_OUTPUTS.get(name) ?? []) {
        if (option === output && words[i + 1] !== undefined) outputs.push(words[i + 1])
        else if (option.startsWith(`${output}=`)) outputs.push(option.slice(output.length + 1))
        else if (output.length === 2 && option.startsWith(output) && option.length > 2 && !option.startsWith('--')) outputs.push(option.slice(2))
      }
      const value = takesValue ? words[i + 1] : (optionValue(option, '--chdir') ?? optionValue(option, '--split-string') ?? (/^-[CDS]./.test(option) ? option.slice(2) : null))
      if ((option === '-C' || option === '--chdir' || option === '-D' || option.startsWith('--chdir=') || /^-[CD]./.test(option)) && value) chdir = value
      if ((option === '-S' || option === '--split-string' || option.startsWith('--split-string=') || /^-S./.test(option)) && value) split = value
      i += takesValue ? 2 : 1
      if (option === '--') break
    }
    while (i < words.length && ASSIGNMENT_WORD.test(words[i])) i += 1 // env NAME=value cmd
    if (WRAPPERS_WITH_POSITIONAL.has(name) && i < words.length) i += 1 // its duration or mask
  }
  const [verb = '', ...operands] = words.slice(i)
  return { verb: baseName(verb), operands, chdir, split, viaXargs, wrapped, outputs }
}

const nonOptions = (operands) => operands.filter((w) => !w.startsWith('-') || w === '-')
const REMOVING_VERBS = new Set(['rm', 'rmdir', 'shred', 'unlink'])
const GIT_OPTIONS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix'])

const RECURSIVE = (w) => /^-[A-Za-z]*[rRa]/.test(w) || w === '--recursive' || w === '--archive'
const FIND_EXEC = new Set(['-exec', '-execdir', '-ok', '-okdir'])
const FIND_FILE_ACTIONS = new Set(['-fprint', '-fprint0', '-fprintf', '-fls'])
const hasGlob = (w) => /[*?[]/.test(w)
const AWK_READ_OPTIONS = new Set(['-f', '--file', '-v', '--assign', '-F', '--field-separator'])

// Options of patch, tar and git whose value is not a path the command writes.
const PATCH_VALUE_OPTIONS = new Set(['-i', '--input', '-d', '--directory', '-r', '--reject-file', '-B', '--prefix', '-D', '--ifdef', '-F', '--fuzz', '-V', '--version-control', '-z', '--suffix', '-Y', '--basename-prefix', '-p', '--strip'])
const TAR_EXTRACTS = (operands) => operands.some((w, k) => w === '--extract' || w === '--get' || /^-[A-Za-z]*x/.test(w) || (k === 0 && !w.startsWith('-') && /x/.test(w)))
// Git subcommands that rewrite the working tree from content no word names (a patch, a
// commit, a stash, another branch): the whole tree is theirs to write.
const GIT_REWRITING_SUBCOMMANDS = new Set(['apply', 'am', 'merge', 'pull', 'cherry-pick', 'revert', 'rebase', 'stash', 'switch'])
const GIT_APPLY_READS = new Set(['--check', '--stat', '--numstat', '--summary'])
const GIT_STASH_READS = new Set(['list', 'show', 'create', 'store'])
const GIT_RESET_REWRITES = new Set(['--hard', '--merge', '--keep'])
const valueAfter = (operands, names) => {
  for (let k = 0; k < operands.length; k += 1) {
    const w = operands[k]
    for (const name of names) {
      if (w === name && operands[k + 1] !== undefined) return operands[k + 1]
      if (name.startsWith('--') && w.startsWith(`${name}=`)) return w.slice(name.length + 1)
      if (!name.startsWith('--') && w.startsWith(name) && w.length > name.length) return w.slice(name.length)
    }
  }
  return null
}

// What a simple command changes: `files` it writes, `landings` it copies or moves onto
// (the destination itself), `trees` it removes, restores or replaces whole (a directory
// takes every file under it along), `rewrites` — directories it rewrites from content no
// word names (git apply, merge, stash, reset --hard; patch fed a diff; tar -x, unzip) —
// command lines it runs (`scripts`: a string to read, or the words of a command — sh -c,
// eval, find -exec), and a directory it runs from (git -C).
const writesOf = ({ verb, operands }) => {
  const files = []
  const landings = []
  const trees = []
  const rewrites = []
  const scripts = []
  let find = null
  let chdir = null
  const inPlace = operands.some((w) => /^-[A-Za-z]*i/.test(w) || w.startsWith('--in-place'))
  if (REMOVING_VERBS.has(verb)) {
    trees.push(...nonOptions(operands))
  } else if (verb === 'mv') {
    const paths = nonOptions(operands)
    const destination = paths.at(-1)
    // A lone operand: refuse it too. A glob may expand into several words, any of which
    // becomes a source: every operand is then judged as moved away.
    trees.push(...(paths.length > 1 && !paths.some(hasGlob) ? paths.slice(0, -1) : paths))
    if (paths.length > 1) {
      landings.push(destination)
      trees.push(...paths.slice(0, -1).map((source) => `${destination}/${baseName(source)}`)) // a moved directory replaces one
    }
  } else if (verb === 'patch') {
    // patch FILE [PATCHFILE] writes FILE; fed a diff with no file, it writes what the diff
    // names, under -d DIR or the directory it runs in. -o OUT writes OUT instead of FILE.
    const named = operands.filter((w, k) => !w.startsWith('-') && !PATCH_VALUE_OPTIONS.has(operands[k - 1]))
    const output = valueAfter(operands, ['-o', '--output'])
    files.push(...(output ? [output] : named.slice(0, 1)))
    if (named.length === 0 && !output) rewrites.push(valueAfter(operands, ['-d', '--directory']) ?? '.')
  } else if (REWRITING_VERBS.has(verb)) {
    // dd reads its if=; anything else it names (of=, a stray operand) counts as written.
    if (verb === 'dd') files.push(...operands.filter((w) => !w.startsWith('if=')).map((w) => w.replace(/^of=/, '')))
    else files.push(...nonOptions(operands))
  } else if (COPYING_VERBS.has(verb)) {
    const target = operands.find((w, k) => operands[k - 1] === '-t' || operands[k - 1] === '--target-directory') ?? operands.map((w) => optionValue(w, '--target-directory')).find(Boolean)
    const paths = nonOptions(operands).filter((w) => w !== target)
    // A recursive copy writes whole directories: what it lands on is judged as a tree.
    const landing = operands.some(RECURSIVE) ? trees : files
    if (target) landing.push(...paths.map((source) => `${target}/${baseName(source)}`))
    else if (paths.length > 1) {
      const destination = paths.at(-1)
      landings.push(destination)
      landing.push(...paths.slice(0, -1).map((source) => `${destination}/${baseName(source)}`))
      if (operands.some(RECURSIVE)) trees.push(destination) // it becomes the copy when it does not exist
    }
  } else if (verb === 'tar' && TAR_EXTRACTS(operands)) {
    rewrites.push(valueAfter(operands, ['-C', '--directory']) ?? '.')
  } else if (verb === 'unzip') {
    rewrites.push(valueAfter(operands, ['-d']) ?? '.')
  } else if (verb === 'sort' || verb === 'uniq') {
    // sort -o FILE; uniq INPUT OUTPUT.
    const output = verb === 'sort' ? valueAfter(operands, ['-o', '--output']) : nonOptions(operands)[1]
    if (output) files.push(output)
  } else if (verb === 'sed' || (verb === 'perl' && inPlace)) {
    if (inPlace) files.push(...nonOptions(operands))
  } else if ((verb === 'awk' || verb === 'gawk') && operands.some((w, k) => w === '-iinplace' || w === '--include=inplace' || (w === 'inplace' && (operands[k - 1] === '-i' || operands[k - 1] === '--include')))) {
    // The program file (-f) and variables (-v) are read; the input files are rewritten.
    files.push(...operands.filter((w, k) => !w.startsWith('-') && w !== 'inplace' && !AWK_READ_OPTIONS.has(operands[k - 1])))
  } else if (INLINE_INTERPRETERS.test(verb) && operands.some((w) => INLINE_SCRIPT_FLAGS.has(w))) {
    // An inline script naming a target (node -e, python -c…) may write it: refuse, reads
    // have cat, grep and jq. Its arguments and the paths its text names are candidates.
    files.push(...operands)
    for (const text of operands) files.push(...(text.match(PATHS_IN_SCRIPT) ?? []))
  } else if (INLINE_INTERPRETERS.test(verb)) {
    // A script run with --out PATH (the framework's artifact and structural-scan) writes PATH.
    const output = valueAfter(operands, ['--out'])
    if (output) files.push(output)
  } else if (SHELLS.test(verb)) {
    const flag = operands.findIndex((w) => /^-[A-Za-z]*c[A-Za-z]*$/.test(w))
    if (flag >= 0 && operands[flag + 1] !== undefined) scripts.push(operands[flag + 1])
  } else if (verb === 'eval') {
    scripts.push(operands.join(' '))
  } else if (verb === 'git') {
    let k = 0
    while (k < operands.length && operands[k].startsWith('-')) {
      if (operands[k] === '-C') chdir = operands[k + 1]
      const workTree = optionValue(operands[k], '--work-tree') ?? (operands[k] === '--work-tree' ? operands[k + 1] : null)
      if (workTree) chdir = workTree
      k += GIT_OPTIONS_WITH_VALUE.has(operands[k]) ? 2 : 1
    }
    const subcommand = operands[k]
    const rest = operands.slice(k + 1)
    const named = nonOptions(rest).filter((w) => !w.startsWith('--source='))
    // checkout/restore rewrite what they name, rm/clean remove it, mv moves it away.
    if (GIT_WRITING_SUBCOMMANDS.has(subcommand)) trees.push(...named)
    // clean with no path cleans the whole tree; checkout without -- may name a branch.
    if (subcommand === 'clean' && named.length === 0) trees.push('.')
    if (subcommand === 'checkout' && !rest.includes('--')) rewrites.push('.')
    if (subcommand === 'reset' && rest.some((w) => GIT_RESET_REWRITES.has(w))) rewrites.push('.')
    if (GIT_REWRITING_SUBCOMMANDS.has(subcommand)
      && !(subcommand === 'apply' && rest.some((w) => GIT_APPLY_READS.has(w)))
      && !(subcommand === 'stash' && GIT_STASH_READS.has(rest[0]))) rewrites.push('.')
  } else if (verb === 'find' && operands.some((w) => FIND_ACTIONS.has(w))) {
    const starts = []
    for (const w of operands) { if (w.startsWith('-') || w === '(' || w === '!') break; starts.push(w) }
    const patterns = operands.filter((w, k) => FIND_FILTERS.has(operands[k - 1]))
    // Every file under a start point may go: the walk counts when it covers a protected
    // file and either looks for no name, or for one a protected file has.
    const points = starts.length > 0 ? starts : ['.']
    // -fprint FILE and its kin write FILE.
    files.push(...operands.filter((w, k) => FIND_FILE_ACTIONS.has(operands[k - 1])))
    // Each -exec runs its own command; `{}` stands for the files found.
    const groups = []
    for (let k = 0; k < operands.length; k += 1) {
      if (!FIND_EXEC.has(operands[k])) continue
      const words = []
      let j = k + 1
      while (j < operands.length && operands[j] !== ';' && !(operands[j] === '+' && operands[j - 1] === '{}')) words.push(operands[j++])
      groups.push(words)
      k = j
    }
    find = { points, patterns, deletes: operands.includes('-delete'), groups }
  }
  return { files, landings, trees, rewrites, scripts, find, chdir }
}

// True when a command line changes a path `target` accepts — G7's tracked state, G8's
// workspace. `target.file(path, cwd)` judges a written file, `target.tree(path, cwd)` a
// removed path (itself or what it contains), `target.landing` a copy or move destination
// (`file` when the target has none), `target.rewrite` a directory rewritten from content
// no word names (unjudged when the target has none). `cwd` is the directory the line
// starts in ('' = the session directory, null = unknown); `cd` and `pushd` move it.
const lineWrites = (command, target, cwd = '', depth = 0) => {
  if (depth > 4) return false
  const commands = Array.isArray(command) ? [{ words: command, redirects: [] }] : readCommandLine(command)
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
    if (parsed.outputs.some((path) => target.file(path, here))) return true
    const { files, landings, trees, rewrites, scripts, find, chdir } = writesOf(parsed)
    if (chdir !== null) here = moveTo(here, chdir)
    if (files.some((path) => target.file(path, here))) return true
    if (landings.some((path) => (target.landing ?? target.file)(path, here))) return true
    if (trees.some((tree) => (typeof tree === 'string' ? target.tree(tree, here) : target.walk(tree, here)))) return true
    if (target.rewrite && rewrites.some((path) => target.rewrite(path, here))) return true
    // xargs hands the command the words the rest of the line produces.
    if (parsed.viaXargs && (files.length > 0 || landings.length > 0 || trees.length > 0 || REWRITING_VERBS.has(parsed.verb) || COPYING_VERBS.has(parsed.verb) || REMOVING_VERBS.has(parsed.verb))) {
      const judge = REMOVING_VERBS.has(parsed.verb) || parsed.verb === 'mv' ? target.tree : target.file
      if (everyWord.some((word) => judge(word, here))) return true
    }
    if (scripts.some((script) => lineWrites(script, target, here, depth + 1))) return true
    if (find && findWrites(find, target, here, depth)) return true
  }
  return false
}

// find START… [filters] -delete | -exec CMD {} …: -delete removes what the walk reaches
// when it can reach a protected file; each -exec command is judged with `{}` standing for
// the files found — every start point with each name looked for (a glob when it looks
// for none), and a protected file when the walk can reach one.
const findWrites = ({ points, patterns, deletes, groups }, target, here, depth) => {
  const reachable = points.some((start) => target.walk({ start, patterns }, here))
  if (deletes && reachable) return true
  const found = points.flatMap((start) => (patterns.length > 0 ? patterns.map((pattern) => `${start}/${baseName(pattern)}`) : [`${start}/*`]))
  const fills = reachable ? [...found, target.sample] : found
  return groups.some((words) => fills.some((fill) => lineWrites(words.map((w) => w.split('{}').join(fill)), target, here, depth + 1)))
}

// The directory after `cd target`: unknown when the target is (~, -, $HOME, nothing).
const moveTo = (dir, target) => {
  if (dir === null || target === undefined || target === '-' || target.startsWith('~') || target.includes(UNKNOWN)) return null
  return joinPath(dir, target)
}

const PROTECTED_NAMES = ['state.json', 'execution-log.json', 'execution-log.jsonl', '.active-slug']
const GLOB = /[*?[]/
const escapeChar = (char) => (/[.+^${}()|[\]\\*?/]/.test(char) ? `\\${char}` : char)
// A shell glob as a regular expression: * and ? within one segment, [abc] / [!abc] / [a-z]
// classes; a [ that never closes is a literal [.
const globRe = (pattern) => {
  let out = ''
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]
    if (char === '*') out += '[^/]*'
    else if (char === '?') out += '[^/]'
    else if (char === '[') {
      let j = i + 1
      if (pattern[j] === '!' || pattern[j] === '^') j += 1
      if (pattern[j] === ']') j += 1
      while (j < pattern.length && pattern[j] !== ']') j += 1
      if (j >= pattern.length) { out += '\\['; continue }
      const body = pattern.slice(i + 1, j).replace(/^[!^]/, '^').replace(/\\/g, '\\\\').replace(/\]/g, '\\]')
      out += `[${body}]`
      i = j
    } else out += escapeChar(char)
  }
  return new RegExp(`^${out}$`, 'i')
}
const safeGlobRe = (pattern) => { try { return globRe(pattern) } catch { return /[\s\S]*/ } }

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
  // The name of the session-path segment right under `parentPath`, when parentPath is the
  // session directory's ancestor ('/repo' under '/'): a glob there may name it.
  const ancestorChild = (parentPath) => {
    const prefix = parentPath === '/' || /^[A-Za-z]:\/$/.test(parentPath) ? parentPath : `${parentPath}/`
    return rootPath.startsWith(prefix) && rootPath !== parentPath ? rootPath.slice(prefix.length).split('/')[0] : null
  }
  const namesAt = (parts, k, anyBase) => {
    const parent = (parts[k - 1] ?? '').toLowerCase()
    const parentPath = joinPath(parts.slice(0, k).join('/') || (parts[0] === '' ? '/' : '.'), '.')
    const child = ancestorChild(parentPath)
    return [
      ...PROTECTED_NAMES,
      ...(parent === '.copilot-tracking' ? [dirName] : []),
      ...(parent === dirName.toLowerCase() || parent === DEFAULT_TRACKING_DIR ? ['x'] : []),
      ...(parentPath === rootPath || (anyBase && k === 0) ? ['.copilot-tracking', dirName] : []),
      ...(child ? [child] : []),
    ]
  }
  // A glob path becomes the concrete paths it could name. Beyond 3 glob segments it could
  // name anything: null.
  const expansions = (path, anyBase = false) => {
    const segments = path.split('/')
    const globbed = segments.map((segment, k) => (GLOB.test(segment) ? k : -1)).filter((k) => k >= 0)
    if (globbed.length === 0) return [path]
    if (globbed.length > 3) return null
    let paths = [segments]
    for (const k of globbed) {
      const re2 = safeGlobRe(segments[k])
      paths = paths.flatMap((parts) => namesAt(parts, k, anyBase).filter((name) => re2.test(name)).map((name) => parts.map((part, j) => (j === k ? name : part))))
    }
    return paths.map((parts) => parts.join('/'))
  }
  // Some expansion satisfies `test`; too many globs to expand: `whenUnbounded`.
  const anyExpansion = (path, test, { anyBase = false, whenUnbounded } = {}) => {
    const paths = expansions(path, anyBase)
    return paths === null ? whenUnbounded(path) : paths.some(test)
  }
  const lastCouldBeProtected = (path) => PROTECTED_NAMES.some((name) => safeGlobRe(path.split('/').at(-1) ?? '').test(name))
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
    if (resolved.unknown !== undefined) {
      const unknown = resolved.unknown.replace(/\\/g, '/')
      return PROTECTED_NAME.test(unknown) || anyExpansion(unknown, (p) => PROTECTED_NAME.test(p), { anyBase: true, whenUnbounded: lastCouldBeProtected })
    }
    return anyExpansion(resolved.path, (p) => re.test(p), { whenUnbounded: lastCouldBeProtected })
  }
  const holdsProtected = (path) => {
    const segments = path.split('/')
    const last = segments.at(-1)?.toLowerCase()
    const parent = segments.at(-2)?.toLowerCase()
    if (last === dirName.toLowerCase() || last === '.copilot-tracking') return true
    if ((parent === dirName.toLowerCase() || parent === DEFAULT_TRACKING_DIR) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(last ?? '')) return true
    // The session directory or one of its ancestors holds the tracking directory; a
    // filesystem root holds everything. With a relative session directory, `.` and what
    // climbs above it do.
    if (path === '/' || /^[A-Za-z]:\/?$/i.test(path) || path === rootPath) return true
    if (rootPath.startsWith(`${path}/`)) return true
    const relativeRoot = !rootPath.startsWith('/') && !/^[A-Za-z]:\//.test(rootPath)
    return relativeRoot && (path === '.' || path === '..' || path.startsWith('../'))
  }
  const tree = (path, cwd) => {
    if (file(path, cwd)) return true
    const resolved = resolve(path, cwd)
    if (!resolved) return false
    if (resolved.unknown !== undefined) {
      const unknown = resolved.unknown.replace(/\\/g, '/').replace(/\/+$/, '')
      return unknown === '' || unknown === '.' || unknown === '..' || holdsProtected(unknown) || anyExpansion(unknown, holdsProtected, { anyBase: true, whenUnbounded: () => true })
    }
    return anyExpansion(resolved.path, holdsProtected, { whenUnbounded: () => true })
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
  // A protected file the walk of a find can reach, for its -exec commands.
  const sample = `/${dirName}/x/state.json`
  return { file, tree, walk, sample }
}

// A path under src/ or tests/ (the workspace).
const WORKSPACE_PATH_RE = /(?:^|[/\\])(?:src|tests)[/\\]/i

// A mutating command applied to a path under src/ or tests/.
const MUTATING_WORKSPACE_RE = /\b(?:rm|mv|cp|truncate|dd|install|vi|vim|nano|emacs|ex)\b[^\n]*?(?:^|[\s"'=([{/\\])(?:src|tests)[/\\]/i

// A src/ or tests/ path segment inside a command line or a path.
const NAMES_WORKSPACE_RE = /(?:^|[\s"'=([{/\\])(?:src|tests)[/\\]/i

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

// The workspace is src/ and tests/ of the project the session runs in. With the session
// directory `cwd` known, a path under it is read from there — a project kept in ~/src is
// not all workspace; without it, any src/ or tests/ segment counts.
const rootOf = (cwd) => (isString(cwd) ? joinPath('', cwd).replace(/\/+$/, '') : '')
const projectRelative = (path, cwd) => {
  const root = rootOf(cwd)
  const slashed = String(path).replace(/\\/g, '/')
  return root.length > 1 && slashed.toLowerCase().startsWith(`${root.toLowerCase()}/`) ? slashed.slice(root.length + 1) : path
}
// A command line with the session directory written as `.`: what MUTATING_WORKSPACE_RE reads.
const withoutProjectRoot = (command, cwd) => {
  const root = rootOf(cwd)
  if (root.length < 2) return command
  return [...new Set([root, root.replace(/\//g, '\\')])].reduce((text, spelling) => text.split(spelling).join('.'), command)
}

// True when a Write/Edit file path targets the src/ or tests/ workspace.
export const isWorkspacePath = (filePath, { cwd } = {}) =>
  isString(filePath) && WORKSPACE_PATH_RE.test(projectRelative(filePath, cwd))

// G8's target: a path under src/ or tests/; removing src or tests themselves counts. A path
// is resolved from where the command runs, then read from the session directory.
const namesWorkspace = (path) => isString(path) && NAMES_WORKSPACE_RE.test(path)
const isWorkspaceDir = (path) => isString(path) && /(?:^|[/\\])(?:src|tests)[/\\]?$/i.test(path)
const workspaceTarget = (cwd) => {
  const at = (path, here) => (isString(path) && isString(cwd) ? projectRelative(joinPath(here ?? '', path), cwd) : path)
  return Object.freeze({
    file: (path, here) => namesWorkspace(at(path, here)),
    tree: (path, here) => namesWorkspace(at(path, here)) || isWorkspaceDir(at(path, here)),
    walk: ({ start }, here) => namesWorkspace(at(start, here)) || isWorkspaceDir(at(start, here)),
    sample: 'src/x',
  })
}

// True when a shell command writes into the src/ or tests/ workspace: the forms G7 reads
// (redirections, tee, in-place sed, inline scripts…), plus a mutating verb anywhere on the
// line (git rm…). `strict` reads it for an agent with no right on the workspace: a path the
// line cannot resolve counts, a glob counts when it can name src or tests, and so do the
// session directory and its ancestors, which hold them (rm -rf ., git clean, git apply).
export const commandWritesWorkspace = (command, { cwd, strict = false } = {}) =>
  isString(command) && (strict
    ? commandWritesWhere(command, strictWorkspaceJudge(cwd), { cwd, sample: 'src/x' })
    : MUTATING_WORKSPACE_RE.test(withoutProjectRoot(command, cwd))
      || lineWrites(command, workspaceTarget(cwd), isString(cwd) ? cwd : ''))

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

// ── G8: reading a command line to the end ────────────────────────────────────────

// Where a shell sends what it discards or prints: the null device and the standard
// streams, a bare NUL, or the Windows device path. Never a file anybody writes.
const DEVICE_RE = /^(?:\/dev\/(?:null|stdout|stderr|tty|fd\/\d+)|nul|(?:\\\\|\/\/)\.[\\/]nul)$/i

// True when a path carries a piece the line could not resolve ($( ), an unset variable).
export const isUnresolvedPath = (path) => isString(path) && path.includes(UNKNOWN)
export const isGlobPath = (path) => isString(path) && GLOB.test(path)

// True when a path segment, glob or not, can name `name`.
export const segmentCanBe = (segment, name) =>
  GLOB.test(segment) ? safeGlobRe(segment).test(name) : segment.toLowerCase() === name.toLowerCase()

// True when a shell command writes, removes, lands on or rewrites a path the judge
// accepts, read as G7 reads it. `judge` holds `file` (a written file), `tree` (a removed
// path; `file` when absent), and optionally `landing` (a copy or move destination) and
// `rewrite` (a directory rewritten from content no word names). Each sees the path
// resolved from where the command runs and '/'-separated; a path the line could not
// resolve carries UNKNOWN, and so does a relative one after a cd the guard could not
// follow. The null device is never a write. `sample` is a path the judge accepts, which
// stands for the files a find -exec is handed.
export const commandWritesWhere = (command, judge = {}, { cwd, sample } = {}) => {
  if (!isString(command) || typeof judge.file !== 'function') return false
  const resolve = (path, here) => {
    if (!isString(path) || DEVICE_RE.test(path)) return null
    const absolute = /^(?:[/\\]|[A-Za-z]:[/\\])/.test(path)
    if (here === null && !absolute) return `${UNKNOWN}/${joinPath('', path)}`
    return joinPath(here ?? '', path)
  }
  const wrap = (fn) => (path, here) => { const resolved = resolve(path, here); return resolved !== null && fn(resolved) }
  const tree = wrap(judge.tree ?? judge.file)
  return lineWrites(command, {
    file: wrap(judge.file),
    tree,
    walk: ({ start }, here) => tree(start, here),
    ...(judge.landing ? { landing: wrap(judge.landing) } : {}),
    ...(judge.rewrite ? { rewrite: wrap(judge.rewrite) } : {}),
    sample: sample ?? '',
  }, isString(cwd) ? cwd : '')
}

// The session directory, or one of its ancestors: it holds src/ and tests/. A glob counts
// when it can name it; without a session directory, `.` and what climbs above it.
const holdsProject = (path, cwd) => {
  const root = rootOf(cwd)
  if (root.length < 2) return path === '.' || path === '..' || path.startsWith('../')
  const own = path.replace(/\/+$/, '').split('/')
  const rootSegments = root.split('/')
  return own.length <= rootSegments.length && own.every((segment, k) => segmentCanBe(segment, rootSegments[k]))
}

// The strict reading of the workspace (commandWritesWorkspace, strict): a path the line
// could not resolve counts; a segment that can be src or tests makes the path the
// workspace's (the last one too when the path is a directory); the session directory and
// its ancestors hold the workspace.
const strictWorkspaceJudge = (cwd) => {
  const inWorkspace = (path, directory) => {
    if (isUnresolvedPath(path)) return true
    const segments = String(projectRelative(path, cwd)).split('/')
    return segments.slice(0, directory ? segments.length : -1).some((segment) => segmentCanBe(segment, 'src') || segmentCanBe(segment, 'tests'))
  }
  return {
    file: (path) => inWorkspace(path, false),
    landing: (path) => inWorkspace(path, true),
    tree: (path) => inWorkspace(path, true) || holdsProject(path, cwd),
    rewrite: (path) => inWorkspace(path, true) || holdsProject(path, cwd),
  }
}

// Programs that only read what they are fed — the framework's own CLIs (artifact,
// structural-scan…) read a payload — so a here-document or a pipe feeding them is data.
const INPUT_ONLY_VERBS = new Set(['cat', 'tee', 'head', 'tail', 'wc', 'cut', 'tr', 'grep', 'egrep', 'fgrep', 'jq', 'sort', 'uniq', 'read', 'sha256sum', 'sha1sum', 'md5sum', 'nl', 'column', 'fold', 'diff', 'echo', 'printf', 'true', ':'])
const FRAMEWORK_CLI_RE = /(?:^|\/)src\/cli\/[a-z][a-z0-9-]*\.mjs$/
const gitSubcommandOf = (operands) => {
  let k = 0
  while (k < operands.length && operands[k].startsWith('-')) k += GIT_OPTIONS_WITH_VALUE.has(operands[k]) ? 2 : 1
  return operands[k]
}
// PowerShell, Copilot's shell on Windows, read as a POSIX line: a cmdlet whose verb only
// reads passes; any other cmdlet, and the built-in aliases of cmdlets that write, run text
// or change directory, are commands the guard does not read.
const READING_CMDLET_RE = /^(?:(?:Get|Test|Select|Measure|Sort|Compare|Resolve|ConvertTo|ConvertFrom)-[A-Za-z]+|Format-(?:Table|List|Wide|Custom|Hex)|Write-(?:Output|Host))$/i
const CMDLET_RE = /^[A-Za-z]+-[A-Za-z]+$/
const POWERSHELL_ALIASES = new Set(['del', 'erase', 'rd', 'ri', 'ni', 'md', 'sc', 'ac', 'copy', 'cpi', 'move', 'mi', 'ren', 'rni', 'iex', 'icm', 'start', 'saps', 'sajb', 'ii', 'sp', 'si', 'clc', 'cli', 'epcsv', 'sal', 'nal', 'sl', 'iwr', 'irm', 'foreach', '%', 'where', '?'])
const isPowerShellCommand = (verb) => (CMDLET_RE.test(verb) && !READING_CMDLET_RE.test(verb)) || POWERSHELL_ALIASES.has(verb.toLowerCase())

const readsOnlyItsInput = ({ verb, operands }) =>
  INPUT_ONLY_VERBS.has(verb)
  || READING_CMDLET_RE.test(verb)
  || (verb === 'git' && gitSubcommandOf(operands) === 'commit')
  || (INLINE_INTERPRETERS.test(verb) && !operands.some((w) => INLINE_SCRIPT_FLAGS.has(w))
    && FRAMEWORK_CLI_RE.test(String(operands.find((w) => !w.startsWith('-')) ?? '').replace(/\\/g, '/')))

// A here-document whose body only feeds data to the commands that read it (a verdict YAML
// to the artifact CLI, a commit message to git commit, text to cat) is not commands: G8
// reads the line without it. Any other body is kept and read as commands.
const HERE_DOC_RE = /(?<!<)<<(?!<)-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/
const feedsDataOnly = (line, at) => {
  const pipeline = pipelineAt(line, at)
  if (!pipeline) return false
  return pipeline.elements.slice(pipeline.at).every((text) => {
    const records = readCommandLine(text)
    return records.length === 1 && readsOnlyItsInput(commandOf(records[0].words))
  })
}
export const withoutDataHereDocs = (command) => {
  if (!isString(command)) return command
  const lines = command.split('\n')
  const kept = []
  let logical = ''
  for (let i = 0; i < lines.length; i += 1) {
    kept.push(lines[i])
    logical = logical ? `${logical}\n${lines[i]}` : lines[i]
    if (/(?:^|[^\\])(?:\\\\)*\\$/.test(lines[i])) continue // the line goes on
    const line = logical
    logical = ''
    const here = HERE_DOC_RE.exec(line)
    if (!here || !feedsDataOnly(line, here.index)) continue
    const tabs = line.slice(here.index).startsWith('<<-')
    let end = i + 1
    while (end < lines.length && (tabs ? lines[end].replace(/^\t+/, '') : lines[end]) !== here[2]) end += 1
    if (end >= lines.length) continue // no closing delimiter: read the rest as the shell would run it
    kept.push(lines[end])
    i = end
  }
  return kept.join('\n')
}

// Why the guard cannot read a command line to the end, or null: a program that reads its
// standard input as anything but data, eval or source, a shell started through a wrapper
// or on a script it does not see, an inline interpreter script. G8 refuses such a line
// from an agent with no right on the workspace.
const opacityOf = (parsed, stdin, depth) => {
  const { verb, operands, wrapped, split } = parsed
  if (stdin && !readsOnlyItsInput(parsed)) return `${verb || 'a command'} reads its standard input as more than data`
  if (verb === 'eval' || verb === 'source' || verb === '.') return `${verb} runs text the guard does not read`
  if (isPowerShellCommand(verb)) return `${verb} is a PowerShell command the guard does not read`
  if (split !== null) return 'env -S runs a command line the guard does not read'
  if (SHELLS.test(verb)) {
    if (wrapped) return `${verb} is started through a wrapper`
    const flag = operands.findIndex((w) => /^-[A-Za-z]*c[A-Za-z]*$/.test(w))
    if (flag < 0) return operands.length > 0 ? `${verb} runs a script or its input, which the guard does not read` : null
    const script = operands[flag + 1]
    if (!isString(script) || script.includes(UNKNOWN)) return `${verb} -c runs a script the guard cannot resolve`
    return shellOpacity(script, depth + 1)
  }
  if (INLINE_INTERPRETERS.test(verb) && operands.some((w) => INLINE_SCRIPT_FLAGS.has(w))) return `${verb} runs an inline script`
  if (verb === 'find') {
    for (let k = 0; k < operands.length; k += 1) {
      if (!FIND_EXEC.has(operands[k])) continue
      const words = []
      for (let j = k + 1; j < operands.length && operands[j] !== ';' && operands[j] !== '+'; j += 1) words.push(operands[j])
      const why = opacityOf(commandOf(words), null, depth + 1)
      if (why) return why
    }
  }
  return null
}
export const shellOpacity = (command, depth = 0) => {
  if (!isString(command)) return null
  if (depth > 4) return 'commands nested too deep to read'
  for (const { words, stdin } of readCommandLine(command)) {
    const why = opacityOf(commandOf(words), stdin, depth)
    if (why) return why
  }
  return null
}
