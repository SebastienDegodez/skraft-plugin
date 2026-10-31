/**
 * Which copy of a workflow the viewer draws: the live one on GitHub at the version's ref when it
 * answers in time, is small and is read by the engine; else the copy built with the page.
 * Every failure is a fixed code; no exception text ever reaches the page.
 *
 * @typedef {'timeout' | 'network' | 'http-status' | 'too-large' | 'refused'} LiveFailure
 * @typedef {{ ok: true, text: string } | { ok: false, code: LiveFailure }} Live
 * @typedef {{ origin: 'live' | 'bundled' | 'none', workflow: object | null, reason: LiveFailure | null }} Source
 */

export const LIVE_LIMIT_BYTES = 256 * 1024
export const LIVE_TIMEOUT_MS = 4000
const RAW = 'https://raw.githubusercontent.com/SebastienDegodez/skraft-plugin'

/** @param {string} ref @param {string} file the workflow's base name (`pipeline`, `review`) */
export const liveUrl = (ref, file) => `${RAW}/${ref}/plugins/skraft-framework/workflows/${file}.skraft.dot`

const bytes = (text) => new TextEncoder().encode(text).length
const announced = (response) => Number(response.headers?.get?.('content-length') ?? 0)

const bodyOf = async (response) => {
  if (response.status !== 200) return { ok: false, code: 'http-status' }
  if (announced(response) > LIVE_LIMIT_BYTES) return { ok: false, code: 'too-large' }
  const text = await response.text()
  return bytes(text) > LIVE_LIMIT_BYTES ? { ok: false, code: 'too-large' } : { ok: true, text }
}

/**
 * @param {string} url
 * @param {{ fetch?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<Live>}
 */
export const fetchLive = async (url, { fetch: get = globalThis.fetch, timeoutMs = LIVE_TIMEOUT_MS } = {}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await bodyOf(await get(url, { signal: controller.signal, cache: 'no-cache' }))
  } catch {
    return { ok: false, code: controller.signal.aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param {{ live: Live, bundled: string | null, read: (text: string) => { ok: boolean, workflow?: object } }} copies
 *   read: the engine's readWorkflow, bound to how this file is read
 * @returns {Source}
 */
export const chooseSource = ({ live, bundled, read }) => {
  const fromLive = live.ok ? read(live.text) : null
  if (fromLive?.ok) return { origin: 'live', workflow: fromLive.workflow, reason: null }
  const reason = live.ok ? 'refused' : live.code
  const fromBundle = bundled === null ? null : read(bundled)
  return fromBundle?.ok ? { origin: 'bundled', workflow: fromBundle.workflow, reason } : { origin: 'none', workflow: null, reason }
}
