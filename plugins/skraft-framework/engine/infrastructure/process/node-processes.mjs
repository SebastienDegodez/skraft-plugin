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
  run: async ({ argv, cwd }) => {
    const [program, ...args] = argv
    const dir = resolve(root, cwd)
    const notStarted = (/** @type {string} */ error) => ({ started: false, exitCode: null, stdout: '', stderr: '', error })
    if ((await isFolder(dir)) === false) return notStarted(`folder not found: ${dir}`)
    const located = await locate(program, dir, { platform, env })
    if (located === null) return notStarted(`command not found: ${program}`)
    const [file, fileArgs, verbatim] = platform === 'win32' && /\.(cmd|bat)$/i.test(located)
      ? [env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${[escapeForCmd(normalize(located)), ...args.map((arg) => quoteForCmd(arg, CMD_SHIM.test(located)))].join(' ')}"`], true]
      : [located, args, false]
    return new Promise((done) => {
      const child = spawn(file, fileArgs, { cwd: dir, env, windowsVerbatimArguments: verbatim, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      /** @type {Buffer[]} */
      const out = []
      /** @type {Buffer[]} */
      const err = []
      child.stdout.on('data', (chunk) => out.push(chunk))
      child.stderr.on('data', (chunk) => err.push(chunk))
      child.once('error', (error) => done(notStarted(`${program} could not be started: ${error.message}`)))
      child.once('close', (code, signal) => done({
        started: true,
        exitCode: code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        ...(code === null ? { error: `${program} was stopped by ${signal ?? 'its host'}` } : {}),
      }))
    })
  },
})

/**
 * @param {string} program argv[0] as written
 * @param {string} dir absolute folder it is started from
 * @param {Required<ProcessHost>} host
 * @returns {Promise<string | null>}
 */
const locate = async (program, dir, { platform, env }) => {
  if (program === '') return null
  const windows = platform === 'win32'
  const pathext = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter((ext) => ext !== '')
  const extensions = !windows ? [''] : pathext.some((ext) => ext.toLowerCase() === extname(program).toLowerCase()) ? [''] : pathext
  const pathOf = windows ? env.Path ?? env.PATH ?? '' : env.PATH ?? ''
  const folders = isAbsolute(program) || /[\\/]/.test(program) ? [dir] : pathOf.split(delimiter).filter((folder) => folder !== '')
  for (const folder of folders) {
    for (const ext of extensions) {
      const candidate = resolve(folder, `${program}${ext}`)
      if (await runnable(candidate, windows)) return candidate
    }
  }
  return null
}

/** @param {string} path @param {boolean} windows */
const runnable = async (path, windows) => {
  try {
    if (!(await stat(path)).isFile()) return false
    await access(path, windows ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** @param {string} dir @returns {Promise<boolean>} */
const isFolder = (dir) => stat(dir).then((entry) => entry.isDirectory(), () => false)

// cmd.exe quoting, as cross-spawn does it: quote each argument for the program's own parser,
// then escape cmd's metacharacters with ^; twice for a node_modules/.bin shim, which runs
// its arguments through cmd again.
const CMD_META = /([()\][%!^"`<>&|;, *?])/g
const CMD_SHIM = /node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/i

/** @param {string} command */
const escapeForCmd = (command) => command.replace(CMD_META, '^$1')

/** @param {string} arg @param {boolean} shim */
const quoteForCmd = (arg, shim) => {
  const quoted = `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`.replace(CMD_META, '^$1')
  return shim ? quoted.replace(CMD_META, '^$1') : quoted
}
