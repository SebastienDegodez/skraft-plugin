/**
 * The process groups of the commands still running (POSIX: each command starts as the leader of
 * its own group). A stopped group gets SIGTERM, then SIGKILL a second later. While a group runs,
 * the host's exit and its SIGTERM, SIGINT and SIGHUP end every group first; with none running,
 * no listener is left on the host, so it behaves as if the runner were not there.
 * Windows has no process group: only the direct child is ended (a written limit).
 */

const HOST_SIGNALS = Object.freeze(['SIGTERM', 'SIGINT', 'SIGHUP'])
const KILL_AFTER_MS = 1000

/** @type {Set<number>} */
const live = new Set()

/** @param {number} pid @param {NodeJS.Signals} signal */
const signalGroup = (pid, signal) => {
  try {
    process.kill(-pid, signal)
  } catch {
    // the group has already ended
  }
}

/** Every group still running gets SIGKILL: the host is going. */
const endAll = () => {
  for (const pid of live) signalGroup(pid, 'SIGKILL')
  live.clear()
}

/** @param {NodeJS.Signals} signal */
const onHostSignal = (signal) => {
  endAll()
  unwatchHost()
  if (process.listenerCount(signal) === 0) process.kill(process.pid, signal)
}

const watchHost = () => {
  process.on('exit', endAll)
  for (const signal of HOST_SIGNALS) process.on(signal, onHostSignal)
}

const unwatchHost = () => {
  process.off('exit', endAll)
  for (const signal of HOST_SIGNALS) process.off(signal, onHostSignal)
}

/** A group starts running. @param {number} pid */
export const groupStarted = (pid) => {
  if (live.size === 0) watchHost()
  live.add(pid)
}

/** A group is done with: its leader closed, and it was not stopped. @param {number} pid */
export const groupDone = (pid) => {
  live.delete(pid)
  if (live.size === 0) unwatchHost()
}

/**
 * Ends a group: SIGTERM now, SIGKILL a second later to whatever is left; it stays watched until then.
 * @param {number} pid
 */
export const stopGroup = (pid) => {
  signalGroup(pid, 'SIGTERM')
  setTimeout(() => {
    signalGroup(pid, 'SIGKILL')
    groupDone(pid)
  }, KILL_AFTER_MS).unref()
}
