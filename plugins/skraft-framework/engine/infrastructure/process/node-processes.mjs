import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { delimiter, extname, isAbsolute, normalize, resolve } from 'node:path'

/**
 * @typedef {import('../../application/ports/command-runner.mjs').CommandRunner} CommandRunner
 * @typedef {import('../../application/ports/executables.mjs').Executables} Executables
 * @typedef {{ platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv }} ProcessHost
 */

/**
 * Executables on this machine's PATH (and PATHEXT under Windows), from the working copy.
 * @param {{ root: string } & ProcessHost} options root: the working copy
 * @returns {Executables}
 */
export const createNodeExecutables = ({ root, platform = process.platform, env = process.env }) => Object.freeze({
  locate: (program, cwd) => locate(program, resolve(root, cwd), { platform, env }),
})

/**
 * Starts programs with an argv, never through a shell. Under Windows a `.cmd` or `.bat`
 * (npm, npx, gradlew.bat) can only start through cmd.exe: its arguments are escaped for it.
 * @param {{ root: string } & ProcessHost} options root: the working copy
 * @returns {CommandRunner}
 */
export const createNodeCommandRunner = ({ root, platform = process.platform, env = process.env }) => Object.freeze({
  run: async ({ argv, cwd, env: added = {}, timeoutMs }) => runCommand(argv, resolve(root, cwd), { platform, env: { ...env, ...added } }, timeoutMs),
})

/**
 * @typedef {Awaited<ReturnType<CommandRunner['run']>>} CommandResult
 * @typedef {import('node:child_process').ChildProcessWithoutNullStreams} Child
 * @typedef {{ file: string, fileArgs: string[], throughCmd: boolean }} Start
 * @typedef {{ timeoutMs: number, platform: NodeJS.Platform } | null} Limit
 *   how long the program may run, null for no limit
 */

/**
 * @param {string[]} argv the program as written, then its arguments
 * @param {string} dir absolute folder it is started from
 * @param {Required<ProcessHost>} host
 * @param {number | undefined} timeoutMs
 * @returns {Promise<CommandResult>}
 */
const runCommand = async ([program, ...args], dir, host, timeoutMs) => {
  if (!(await isFolder(dir))) return notStarted(`folder not found: ${dir}`)
  const located = await locate(program, dir, host)
  if (located === null) return notStarted(`command not found: ${program}`)
  const limit = timeoutMs === undefined ? null : { timeoutMs, platform: host.platform }
  return start(program, startArgs(located, args, host), dir, { env: host.env, limit })
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
 * Spawns the program and collects what it writes until it closes. With a limit, it leads a
 * process group of its own under POSIX, so that every process it starts ends with it.
 * @param {string} program argv[0] as written @param {Start} spawned @param {string} dir
 * @param {{ env: NodeJS.ProcessEnv, limit: Limit }} how
 * @returns {Promise<CommandResult>}
 */
const start = (program, { file, fileArgs, throughCmd }, dir, { env, limit }) => {
  /** @type {Child} */
  let child
  const detached = limit !== null && limit.platform !== 'win32'
  try {
    // Stryker disable next-line BooleanLiteral: windowsHide has no effect outside Windows
    child = /** @type {Child} */ (spawn(file, fileArgs, { cwd: dir, env, detached, windowsVerbatimArguments: throughCmd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }))
  } catch (error) {
    // Windows throws, instead of emitting `error`, for a file that is not a program.
    return Promise.resolve(notStarted(`${program} could not be started: ${/** @type {Error} */ (error).message}`))
  }
  return collect(child, program, limit)
}

/**
 * The child's exit code and both outputs once it closes; not started when it emits `error`;
 * stopped, with the limit it ran past, when it outlived it.
 * @param {Child} child @param {string} program argv[0] as written @param {Limit} limit
 * @returns {Promise<CommandResult>}
 */
const collect = (child, program, limit) => new Promise((done) => {
  const stdout = gather(child.stdout)
  const stderr = gather(child.stderr)
  const watch = watchLimit(child, limit)
  child.once('error', (error) => done(notStarted(`${program} could not be started: ${error.message}`)))
  child.once('close', (code, signal) => {
    const why = watch.stop() ? `${program} did not finish within ${/** @type {NonNullable<Limit>} */ (limit).timeoutMs / 1000} s` : `${program} was stopped by ${signal}`
    done({ started: true, exitCode: code, stdout: stdout(), stderr: stderr(), ...(code === null ? { error: why } : {}) })
  })
})

/**
 * Ends the child's whole process tree once it runs past the limit. stop: whether it did, the
 * watch then over.
 * @param {Child} child @param {Limit} limit @returns {{ stop: () => boolean }}
 */
const watchLimit = (child, limit) => {
  let expired = false
  const timer = limit === null ? null : setTimeout(() => {
    expired = true
    endTree(child, limit.platform)
  }, limit.timeoutMs)
  return { stop: () => { if (timer !== null) clearTimeout(timer); return expired } }
}

/**
 * The child and every process it started: its process group under POSIX, its tree through
 * taskkill under Windows.
 * @param {Child} child @param {NodeJS.Platform} platform
 */
const endTree = (child, platform) => {
  try {
    if (platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    else process.kill(-/** @type {number} */ (child.pid), 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
}

/**
 * Keeps every chunk a stream emits; the returned function reads them as UTF-8 text.
 * @param {import('node:stream').Readable} stream @returns {() => string}
 */
const gather = (stream) => {
  /** @type {Buffer[]} */
  const chunks = []
  stream.on('data', (chunk) => chunks.push(chunk))
  return () => Buffer.concat(chunks).toString('utf8')
}

/** @param {string} error @returns {CommandResult} */
const notStarted = (error) => ({ started: false, exitCode: null, stdout: '', stderr: '', error })

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
