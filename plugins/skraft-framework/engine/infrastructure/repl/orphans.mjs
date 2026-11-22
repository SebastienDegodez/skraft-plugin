import { spawnSync } from 'node:child_process'
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
 * @typedef {{ platform?: NodeJS.Platform, creationOf?: (pid: number) => string | null, kill?: (pid: number) => void }} OrphanHost
 */

/**
 * The system's start time of a process, null when none runs under that pid or it cannot be read.
 * @param {number} pid @param {NodeJS.Platform} platform @returns {string | null}
 */
export const processCreation = (pid, platform = process.platform) => {
  const [file, args] = platform === 'win32'
    ? ['powershell', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid}).StartTime.ToFileTimeUtc()`]]
    : ['ps', ['-o', 'lstart=', '-p', String(pid)]]
  const found = spawnSync(file, args, { encoding: 'utf8', windowsHide: true, timeout: 10_000 })
  const text = found.status === 0 ? String(found.stdout).trim() : ''
  return text === '' ? null : text
}

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
export const createOrphanJournal = ({ folder, platform = process.platform, creationOf = (pid) => processCreation(pid, platform), kill = (pid) => killTree(pid, platform) }) => {
  const pathOf = (/** @type {number} */ pid) => join(folder, `${pid}.json`)
  return Object.freeze({
    /** @param {Entry} entry */
    keep: async (entry) => {
      await mkdir(folder, { recursive: true })
      await writeFile(pathOf(entry.server.pid), JSON.stringify(entry), 'utf8')
    },
    /** @param {number} serverPid */
    forget: (serverPid) => rm(pathOf(serverPid), { force: true }),
    /** Ends what the servers that are gone left running; returns how many processes it ended. */
    reap: () => reap(folder, { creationOf, kill }),
  })
}

/** @param {string} folder @param {Required<Pick<OrphanHost, 'creationOf' | 'kill'>>} host @returns {Promise<number>} */
const reap = async (folder, host) => {
  let ended = 0
  for (const name of await names(folder)) ended += await reapEntry(join(folder, name), host)
  return ended
}

/** @param {string} folder @returns {Promise<string[]>} */
const names = (folder) => readdir(folder).then((all) => all.filter((name) => name.endsWith('.json')), () => [])

/** @param {string} path @param {Required<Pick<OrphanHost, 'creationOf' | 'kill'>>} host @returns {Promise<number>} */
const reapEntry = async (path, host) => {
  const entry = await readEntry(path)
  if (entry === null) {
    await rm(path, { force: true })
    return 0
  }
  if (!isGone(entry.server, host)) return 0
  const left = [entry.kernel, ...entry.runs].filter((one) => one !== null && isSame(one, host))
  for (const one of left) host.kill(/** @type {Tracked} */ (one).pid)
  await rm(path, { force: true })
  return left.length
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
 * @param {Tracked} tracked @param {Pick<OrphanHost, 'creationOf'>} host
 */
const isSame = ({ pid, created }, host) => created !== null && /** @type {(pid: number) => string | null} */ (host.creationOf)(pid) === created

/**
 * Whether the process recorded is certainly gone: none runs under its pid, or one that started
 * at another time. A start time that was never readable never proves it.
 * @param {Tracked} tracked @param {Pick<OrphanHost, 'creationOf'>} host
 */
const isGone = ({ pid, created }, host) => {
  const now = /** @type {(pid: number) => string | null} */ (host.creationOf)(pid)
  return now === null || (created !== null && now !== created)
}
