import { isAbsolute } from 'node:path'

/**
 * @typedef {{ type?: unknown, data?: { cwd?: unknown } }} SessionEvent
 * @typedef {{
 *   onEvent: (event: SessionEvent) => void,
 *   seed: (path: unknown) => void,
 *   current: () => string | null,
 * }} SessionDirectory
 */

/**
 * The Copilot session's working directory, live. A tool call carries none and the extension
 * process keeps the directory it started in (`cwd-after-cd`, Copilot CLI 1.0.101): the session
 * moves it with `session.context_changed` (`data.cwd`), which `onEvent` follows. `seed` gives the
 * directory the session had when it was joined, unless an event already moved it. Only an
 * absolute path is taken; null until one is known.
 * @returns {SessionDirectory}
 */
export const createSessionDirectory = () => {
  const state = { cwd: /** @type {string | null} */ (null) }
  return Object.freeze({
    onEvent: (event) => follow(state, event),
    seed: (path) => seed(state, path),
    current: () => state.cwd,
  })
}

/** @param {{ cwd: string | null }} state @param {SessionEvent} event */
const follow = (state, event) => {
  if (event?.type === 'session.context_changed') adopt(state, event.data?.cwd)
}

/** @param {{ cwd: string | null }} state @param {unknown} path */
const seed = (state, path) => {
  if (state.cwd === null) adopt(state, path)
}

/** @param {{ cwd: string | null }} state @param {unknown} path */
const adopt = (state, path) => {
  if (typeof path === 'string' && isAbsolute(path)) state.cwd = path
}
