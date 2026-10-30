import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { delimiter, extname, isAbsolute, normalize, resolve } from 'node:path'
import { groupDone, groupStarted, stopGroup } from './process-groups.mjs'
import { createOutput } from './output-cut.mjs'
import { azLaunch } from './az-launch.mjs'

/**
 * @typedef {import('../../application/ports/command-runner.mjs').CommandRunner} CommandRunner
 * @typedef {import('../../application/ports/executables.mjs').Executables} Executables
 * @typedef {{ platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv }} ProcessHost
 * @typedef {{ signal?: AbortSignal, timeoutMs?: number, maxOutputBytes?: number }} Limits
 *   what bounds every command of a runner; a request's own signal and timeoutMs win.
 */

/** The output kept of each stream of a command; past it, its head and its tail (output-cut.mjs). */
const MAX_OUTPUT_BYTES = 67_108_864

/**
 * Executables on this machine's PATH (and PATHEXT under Windows), from the working copy.
 * @param {{ root: string } & ProcessHost} options root: the working copy
 * @returns {Executables}
 */
export const createNodeExecutables = ({ root, platform = process.platform, env = process.env }) => Object.freeze({
  locate: (program, cwd) => locate(program, resolve(root, cwd), { platform, env }),
})

/**
 * Starts programs with an argv, never through a shell, stdin closed. Under Windows a `.cmd` or
 * `.bat` (npm, npx, gradlew.bat) can only start through cmd.exe: its arguments are escaped for it.
 * A command is ended, with every process it started (its process group under POSIX), when its
 * signal aborts or at its time limit. An output past the limit keeps its head and its tail, and
 * the result says it was cut.
 * @param {{ root: string } & ProcessHost & Limits} options root: the working copy
 * @returns {CommandRunner}
 */
export const createNodeCommandRunner = ({ root, platform = process.platform, env = process.env, signal, timeoutMs, maxOutputBytes = MAX_OUTPUT_BYTES }) => Object.freeze({
  run: async (request) => runCommand(request.argv, resolve(root, request.cwd), { platform, env: { ...env, ...request.env } }, limitsOf(request, { signal, timeoutMs, maxOutputBytes })),
})

/**
 * @param {import('../../application/ports/command-runner.mjs').CommandRequest} request @param {Limits} runner
 * @returns {Required<Pick<Limits, 'maxOutputBytes'>> & Limits}
 */
const limitsOf = (request, runner) => ({
  signal: request.signal ?? runner.signal,
  timeoutMs: request.timeoutMs ?? runner.timeoutMs,
  maxOutputBytes: /** @type {number} */ (runner.maxOutputBytes),
})

/**
 * @typedef {Awaited<ReturnType<CommandRunner['run']>>} CommandResult
 * @typedef {import('node:child_process').ChildProcessWithoutNullStreams} Child
 * @typedef {{ file: string, fileArgs: string[], throughCmd: boolean }} Start
 * @typedef {Required<Pick<Limits, 'maxOutputBytes'>> & Limits} CommandLimits
 */

/**
 * @param {string[]} argv the program as written, then its arguments
 * @param {string} dir absolute folder it is started from
 * @param {Required<ProcessHost>} host @param {CommandLimits} limits
 * @returns {Promise<CommandResult>}
 */
const runCommand = async ([program, ...args], dir, host, limits) => {
  if (!(await isFolder(dir))) return notStarted(`folder not found: ${dir}`)
  const located = await locate(program, dir, host)
  if (located === null) return notStarted(`command not found: ${program}`)
  if (limits.signal?.aborted) return notStarted(`${program} was cancelled before it started`)
  const az = await azLaunch(located, args, host.platform)
  if (az === null) return start(program, startArgs(located, args, host), { dir, host }, limits)
  if ('refused' in az) return notStarted(az.refused)
  return start(program, az, { dir, host: { ...host, env: { ...host.env, ...az.env } } }, limits)
}

/**
 * What to spawn for a located program: the program itself, or cmd.exe running it for a `.cmd`
 * or `.bat` under Windows, with every argument quoted and escaped for cmd.
 * @param {string} located @param {string[]} args @param {Required<ProcessHost>} host
 * @returns {Start}
 */
const startArgs = (located, args, { platform, env }) => {
  // Stryker disable next-line ConditionalExpression,LogicalOperator: equivalent under Linux, where mutation runs: only the tests under Windows rules locate a .cmd, and they set platform win32
  const throughCmd = platform === 'win32' && CMD_SCRIPTS.includes(extname(located).toLowerCase())
  if (!throughCmd) return { file: located, fileArgs: args, throughCmd }
  const line = [escapeForCmd(normalize(located)), ...args.map((arg) => quoteForCmd(arg, CMD_SHIM.test(located)))].join(' ')
  return { file: env.ComSpec ?? 'cmd.exe', fileArgs: ['/d', '/s', '/c', `"${line}"`], throughCmd }
}

/**
 * Spawns the program, under POSIX as the leader of a process group of its own, and collects what
 * it writes until it closes.
 * @param {string} program argv[0] as written @param {Start} spawned
 * @param {{ dir: string, host: Required<ProcessHost> }} where @param {CommandLimits} limits
 * @returns {Promise<CommandResult>}
 */
const start = (program, { file, fileArgs, throughCmd }, { dir, host }, limits) => {
  /** @type {Child} */
  let child
  try {
    // Stryker disable next-line BooleanLiteral: windowsHide has no effect outside Windows
    child = /** @type {Child} */ (spawn(file, fileArgs, { cwd: dir, env: host.env, detached: host.platform !== 'win32', windowsVerbatimArguments: throughCmd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }))
  } catch (error) {
    // Windows throws, instead of emitting `error`, for a file that is not a program.
    return Promise.resolve(startFailed(program, error))
  }
  return collect(child, program, { grouped: host.platform !== 'win32', limits })
}

/**
 * @typedef {{ child: Child, program: string, grouped: boolean, stopped: string | null }} Running
 *   stopped: why the runner ended it, null while it runs on its own.
 */

/**
 * The child's exit code and both outputs once it closes; not started when it emits `error`.
 * @param {Child} child @param {string} program argv[0] as written
 * @param {{ grouped: boolean, limits: CommandLimits }} how
 * @returns {Promise<CommandResult>}
 */
const collect = (child, program, { grouped, limits }) => new Promise((done) => {
  /** @type {Running} */
  const running = { child, program, grouped, stopped: null }
  if (grouped) groupStarted(/** @type {number} */ (child.pid))
  const output = { stdout: gather(child.stdout, limits.maxOutputBytes), stderr: gather(child.stderr, limits.maxOutputBytes) }
  const release = bind(running, limits)
  child.once('error', (error) => settle(running, release, () => done(startFailed(program, error))))
  child.once('close', (code, signal) => settle(running, release, () => done(closed(running, output, { code, signal }))))
})

/**
 * Arms the time limit and the signal; the returned function disarms both.
 * @param {Running} running @param {CommandLimits} limits @returns {() => void}
 */
const bind = (running, { signal, timeoutMs }) => {
  const cancel = () => stop(running, `${running.program} was cancelled`)
  signal?.addEventListener('abort', cancel, { once: true })
  const timer = timeoutMs === undefined ? undefined : setTimeout(() => stop(running, `${running.program} did not finish within ${timeoutMs / 1000} s`), timeoutMs)
  return () => {
    signal?.removeEventListener('abort', cancel)
    clearTimeout(timer)
  }
}

/**
 * Ends the command once, with every process it started, and keeps why.
 * @param {Running} running @param {string} why
 */
const stop = (running, why) => {
  if (running.stopped !== null) return
  running.stopped = why
  if (running.grouped) stopGroup(/** @type {number} */ (running.child.pid))
  else stopTree(running.child)
}

/** How long taskkill may take to end a tree. */
const TREE_KILL_MS = 10_000

/**
 * The command that ends a process and every process it started under Windows, which has no
 * process group: a .cmd runs under cmd.exe, whose children would keep the pipes open.
 * @param {number} pid @returns {{ file: string, args: string[] }}
 */
export const windowsTreeKill = (pid) => ({ file: 'taskkill', args: ['/PID', String(pid), '/T', '/F'] })

/**
 * Windows: taskkill ends the tree (the child alone when taskkill cannot start), then the pipes
 * are let go, so the command closes even if a process of the tree still holds them.
 * @param {Child} child
 */
const stopTree = (child) => {
  const { file, args } = windowsTreeKill(/** @type {number} */ (child.pid))
  const killer = spawn(file, args, { stdio: 'ignore', windowsHide: true, timeout: TREE_KILL_MS })
  killer.once('error', () => child.kill())
  killer.once('close', () => {
    child.stdout.destroy()
    child.stderr.destroy()
  })
}

/**
 * The command is over: the limits are disarmed and a group it was not stopped in is let go.
 * @param {Running} running @param {() => void} release @param {() => void} then
 */
const settle = (running, release, then) => {
  release()
  if (running.grouped && running.stopped === null) groupDone(/** @type {number} */ (running.child.pid))
  then()
}

/**
 * @typedef {ReturnType<typeof createOutput>} Output
 */

/**
 * @param {Running} running @param {{ stdout: Output, stderr: Output }} output
 * @param {{ code: number | null, signal: NodeJS.Signals | null }} exit
 * @returns {CommandResult}
 */
const closed = ({ program, stopped }, output, { code, signal }) => {
  const result = { started: true, exitCode: stopped === null ? code : null, ...textsOf(output) }
  if (stopped !== null) return { ...result, error: stopped }
  return code === null ? { ...result, error: `${program} was stopped by ${signal}` } : result
}

/**
 * Both outputs as UTF-8 text, and truncated when the limit cut either.
 * @param {{ stdout: Output, stderr: Output }} output
 */
const textsOf = ({ stdout, stderr }) => ({
  stdout: stdout.text(),
  stderr: stderr.text(),
  ...(stdout.cut() || stderr.cut() ? { truncated: /** @type {const} */ (true) } : {}),
})

/**
 * What a stream emits, bounded by the limit.
 * @param {import('node:stream').Readable} stream @param {number} limit @returns {Output}
 */
const gather = (stream, limit) => {
  const output = createOutput(limit)
  stream.on('data', output.push)
  return output
}

/** @param {string} error @returns {CommandResult} */
const notStarted = (error) => ({ started: false, exitCode: null, stdout: '', stderr: '', error })

/** What a start the system refused says, by its code. */
const START_FAILURES = Object.freeze({
  __proto__: null,
  ENOENT: 'not found',
  ERR_INVALID_ARG_VALUE: 'an argument it cannot receive',
})

/**
 * A start the system refused, said by its error code: never the error's text, which names paths
 * and reaches the journal and the next prompts.
 * @param {string} program argv[0] as written @param {unknown} error a Node system error, which has a code
 * @returns {CommandResult}
 */
const startFailed = (program, error) => {
  const { code } = /** @type {NodeJS.ErrnoException} */ (error)
  // Stryker disable next-line LogicalOperator,StringLiteral: another code comes only under Windows (a file that is not a program), where mutation does not run
  return notStarted(`${program} could not be started: ${START_FAILURES[/** @type {string} */ (code)] ?? 'the system refused it'} (${code})`)
}

/**
 * @param {string} program argv[0] as written
 * @param {string} dir absolute folder it is started from
 * @param {Required<ProcessHost>} host
 * @returns {Promise<string | null>}
 */
const locate = async (program, dir, host) => {
  const windows = host.platform === 'win32'
  const extensions = extensionsFor(program, host)
  for (const folder of foldersFor(program, dir, host)) {
    for (const ext of extensions) {
      const found = await programAt(resolve(folder, `${program}${ext}`), windows)
      if (found !== null) return found
    }
  }
  return null
}

/**
 * The suffixes tried after the program's name: none outside Windows, nor when the name already
 * ends with one of PATHEXT; every PATHEXT entry otherwise.
 * @param {string} program @param {Required<ProcessHost>} host @returns {string[]}
 */
const extensionsFor = (program, { platform, env }) => {
  if (platform !== 'win32') return ['']
  const pathext = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter((ext) => ext !== '')
  return pathext.some((ext) => ext.toLowerCase() === extname(program).toLowerCase()) ? [''] : pathext
}

/**
 * The folders looked in: the start folder for a program written as a path, the PATH otherwise
 * (Path first under Windows).
 * @param {string} program @param {string} dir @param {Required<ProcessHost>} host @returns {string[]}
 */
const foldersFor = (program, dir, { platform, env }) => {
  if (isAbsolute(program) || /[\\/]/.test(program)) return [dir]
  // Stryker disable next-line StringLiteral: with no PATH, any fallback names no folder that holds the program
  const pathOf = platform === 'win32' ? env.Path ?? env.PATH ?? '' : env.PATH ?? ''
  return pathOf.split(delimiter)
}

/**
 * The path when it is a file this system can start, null otherwise.
 * @param {string} path @param {boolean} windows @returns {Promise<string | null>}
 */
const programAt = async (path, windows) => {
  try {
    if (!(await stat(path)).isFile()) return null
    await access(path, windows ? constants.F_OK : constants.X_OK)
    return path
  } catch {
    return null
  }
}

/** @param {string} dir @returns {Promise<boolean>} */
// Stryker disable next-line ArrowFunction: undefined and false both mean "no folder" to the only caller, which tests truthiness
const isFolder = (dir) => stat(dir).then((entry) => entry.isDirectory(), () => false)

// cmd.exe quoting, as cross-spawn does it: quote each argument for the program's own parser,
// then escape cmd's metacharacters with ^; twice for a node_modules/.bin shim, which runs
// its arguments through cmd again.
const CMD_META = /([()\][%!^"`<>&|;, *?])/g
/** The extensions only cmd.exe can start. */
const CMD_SCRIPTS = Object.freeze(['.cmd', '.bat'])
// Stryker disable next-line Regex: in the cmd.exe branch the path already ends with the .cmd or .bat that located it
const CMD_SHIM = /node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/i

/** @param {string} command */
const escapeForCmd = (command) => command.replace(CMD_META, '^$1')

/** @param {string} arg @param {boolean} shim */
const quoteForCmd = (arg, shim) => {
  const quoted = `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`.replace(CMD_META, '^$1')
  return shim ? quoted.replace(CMD_META, '^$1') : quoted
}
