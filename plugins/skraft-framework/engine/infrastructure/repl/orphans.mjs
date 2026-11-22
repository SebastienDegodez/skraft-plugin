import { spawn, spawnSync } from 'node:child_process'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { windowsTreeKill } from '../process/node-processes.mjs'

/**
 * The processes each skraft MCP server started for its REPL, written to `<folder>/<server pid>.json`
 * as they start and stop, so that a server starting later ends what a server killed without a
 * chance to clean up left running. A process counts only when its creation time is the one
 * recorded: a pid the system has since reused is never touched.
 *
 * @typedef {{ pid: number, created: string | null }} Tracked
 *   created: the system's start time of the process, null when it cannot be read.
 * @typedef {{ server: Tracked, kernel: Tracked | null, runs: Tracked[] }} Entry
 * @typedef {{ platform?: NodeJS.Platform, creationOf?: (pid: number) => Promise<string | null> | string | null, exists?: (pid: number) => boolean, kill?: (pid: number) => void }} OrphanHost
 *   creationOf: null when the start time cannot be read; exists: false only when the system says no process runs under the pid.
 * @typedef {Required<Pick<OrphanHost, 'creationOf' | 'exists' | 'kill'>>} ReapHost
 */

/**
 * The program that prints the system's start time of a process.
 * @param {number} pid @param {NodeJS.Platform} platform @returns {{ file: string, args: string[] }}
 */
export const creationReader = (pid, platform) => (platform === 'win32'
  ? { file: 'powershell', args: ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid}).StartTime.ToFileTimeUtc()`] }
  : { file: 'ps', args: ['-o', 'lstart=', '-p', String(pid)] })

/** How long the system may take to give a start time. */
const CREATION_TIMEOUT_MS = 10_000

/**
 * The system's start time of a process, null when none runs under that pid or it cannot be read.
 * The program runs while this server goes on: it never holds the server's other calls.
 * @param {number} pid @param {NodeJS.Platform} platform @param {{ file: string, args: string[] }} [reader]
 * @returns {Promise<string | null>}
 */
export const processCreation = (pid, platform = process.platform, { file, args } = creationReader(pid, platform)) => new Promise((resolve) => {
  const child = spawn(file, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: CREATION_TIMEOUT_MS })
  /** @type {Buffer[]} */
  const out = []
  child.stdout.on('data', (/** @type {Buffer} */ chunk) => out.push(chunk))
  child.once('error', () => resolve(null))
  child.once('close', (code) => resolve(creationText(code, Buffer.concat(out).toString('utf8'))))
})

/** @param {number | null} code @param {string} text */
const creationText = (code, text) => (code === 0 && text.trim() !== '' ? text.trim() : null)

/**
 * Ends a process and everything it started: its process group under POSIX, its tree under Windows.
 * @param {number} pid @param {NodeJS.Platform} platform
 */
export const killTree = (pid, platform = process.platform) => {
  if (platform !== 'win32') return [-pid, pid].forEach(sigkill)
  const { file, args } = windowsTreeKill(pid)
  spawnSync(file, args, { stdio: 'ignore', windowsHide: true, timeout: 10_000 })
}

/** @param {number} target a pid, or minus a process group */
const sigkill = (target) => {
  try {
    process.kill(target, 'SIGKILL')
  } catch {
    // already gone
  }
}

/**
 * @param {{ folder: string } & OrphanHost} options folder: the absolute folder the entries are written in
 */
export const createOrphanJournal = ({ folder, platform = process.platform, creationOf = (pid) => processCreation(pid, platform), exists = processExists, kill = (pid) => killTree(pid, platform) }) => {
  return Object.freeze({
    /** @param {Entry} entry */
    keep: (entry) => keepEntry(folder, entry),
    /** @param {number} serverPid */
    forget: (serverPid) => rm(join(folder, `${serverPid}.json`), { force: true }),
    /** The process under a pid, with its start time, as `keep` records it. @param {number} pid @returns {Promise<Tracked>} */
    track: async (pid) => ({ pid, created: await creationOf(pid) }),
    /** Whether the process recorded is certainly gone. @param {Tracked} tracked */
    gone: (tracked) => isGone(tracked, { creationOf, exists }),
    /** Ends what the servers that are gone left running; returns how many processes it ended. */
    reap: () => reap(folder, { creationOf, exists, kill }),
  })
}

/** @param {string} folder @param {Entry} entry */
const keepEntry = async (folder, entry) => {
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, `${entry.server.pid}.json`), JSON.stringify(entry), 'utf8')
}

/** @param {string} folder @param {ReapHost} host @returns {Promise<number>} */
const reap = async (folder, host) => {
  let ended = 0
  for (const name of await names(folder)) ended += await reapEntry(join(folder, name), host)
  return ended
}

/** @param {string} folder @returns {Promise<string[]>} */
const names = (folder) => readdir(folder).then((all) => all.filter((name) => name.endsWith('.json')), () => [])

/** @param {string} path @param {ReapHost} host @returns {Promise<number>} */
const reapEntry = async (path, host) => {
  const entry = await readEntry(path)
  if (entry === null) {
    await rm(path, { force: true })
    return 0
  }
  if (!(await isGone(entry.server, host))) return 0
  const left = await stillRunning([entry.kernel, ...entry.runs], host)
  for (const one of left) host.kill(one.pid)
  await rm(path, { force: true })
  return left.length
}

/** The recorded processes that are still the very ones recorded. @param {Array<Tracked | null>} recorded @param {ReapHost} host @returns {Promise<Tracked[]>} */
const stillRunning = async (recorded, host) => {
  const present = /** @type {Tracked[]} */ (recorded.filter((one) => one !== null))
  const same = await Promise.all(present.map((one) => isSame(one, host)))
  return present.filter((_, index) => same[index])
}

/** @param {string} path @returns {Promise<Entry | null>} */
const readEntry = async (path) => {
  try {
    const entry = JSON.parse(await readFile(path, 'utf8'))
    return Array.isArray(entry.runs) && typeof entry.server?.pid === 'number' ? entry : null
  } catch {
    return null
  }
}

/**
 * Whether the very process recorded runs: its start time is the recorded one.
 * @param {Tracked} tracked @param {ReapHost} host
 */
const isSame = async ({ pid, created }, host) => created !== null && host.exists(pid) && (await host.creationOf(pid)) === created

/**
 * Whether the process recorded is certainly gone: the system says none runs under its pid, or
 * one that started at another time runs there. A start time that cannot be read, now or when it
 * was recorded, never proves it.
 * @param {Tracked} tracked @param {Pick<OrphanHost, 'creationOf' | 'exists'>} host
 */
const isGone = async ({ pid, created }, host) => {
  if (!(/** @type {(pid: number) => boolean} */ (host.exists)(pid))) return true
  const now = created === null ? null : await /** @type {(pid: number) => Promise<string | null>} */ (host.creationOf)(pid)
  return now !== null && now !== created
}

/**
 * Whether a process runs under the pid, as the system answers a signal 0: ESRCH alone says none
 * does; a refusal (EPERM) says one runs that this user may not signal.
 * @param {number} pid
 */
export const processExists = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return /** @type {NodeJS.ErrnoException} */ (error).code !== 'ESRCH'
  }
}
