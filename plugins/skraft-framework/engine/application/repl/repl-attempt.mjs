import { deriveRun, openNode } from '../../domain/journal/run-state.mjs'
import { runsFolder } from '../../domain/evidence/run-trace.mjs'
import { roleOf } from '../../domain/pipeline/roles.mjs'
import { loadWorkflow } from '../workflow/load-workflow.mjs'
import { openActiveRun } from '../pipeline/active-run.mjs'

/**
 * @typedef {{ ok: true, slug: string, step: string, folder: string, events: any[] } | { ok: false, code: 'repl-unavailable' }} Bound
 *   folder: where the attempt's runs are traced, relative to `<slug>/`.
 */

/** @type {{ ok: false, code: 'repl-unavailable' }} */
const UNAVAILABLE = { ok: false, code: 'repl-unavailable' }

/**
 * The attempt a call belongs to: the open attempt of the active run, when its agent commits code
 * (a role with a test-driven mode). No open attempt, or an agent that commits none, is no place for
 * a REPL: the agent keeps Bash, and nothing it runs there counts as proof.
 * @param {any} deps @returns {Promise<Bound>}
 */
export const bindAttempt = async (deps) => {
  const opened = await openActiveRun(deps, null)
  if (!opened.ok) return UNAVAILABLE
  const found = openNode(deriveRun(opened.journal.events))
  if (found === null) return UNAVAILABLE
  const loaded = await loadWorkflow(deps, { agents: false })
  const node = loaded.ok ? loaded.workflow.nodes[found.step] : undefined
  if (node?.kind !== 'agent' || roleOf(node).tdd === null) return UNAVAILABLE
  const folder = runsFolder(found.step, found.open.visit, found.open.attempt)
  return { ok: true, slug: opened.slug, step: found.step, folder, events: opened.journal.events }
}

/** @param {{ slug: string, folder: string }} bound */
const lockName = ({ slug, folder }) => `${slug}/${folder}`

/**
 * The lease on the attempt's REPL: this server's text in `<attempt>/.lock`. A lease whose holder
 * is certainly gone is taken over; one whose holder runs is refused.
 * @param {any} deps @param {{ slug: string, folder: string }} bound @returns {Promise<string | null>} the text it holds; null when another server holds it
 */
export const takeLease = async (deps, bound) => {
  const { locks, server } = deps.repl
  const text = JSON.stringify(server)
  if (await locks.create(lockName(bound), text)) return text
  const seen = await locks.read(lockName(bound))
  if (seen === null) return (await locks.create(lockName(bound), text)) ? text : null
  return takeOver(deps, bound, { seen, text })
}

/**
 * A lease already there: this server's own is kept, a running server's is respected, the one of a
 * server that is gone is taken over.
 * @param {any} deps @param {{ slug: string, folder: string }} bound @param {{ seen: string, text: string }} lease
 */
const takeOver = async (deps, bound, { seen, text }) => {
  const holder = holderOf(seen)
  if (holder?.pid === deps.repl.server.pid) return seen
  if (holder !== null && !deps.repl.orphans.gone(holder)) return null
  return (await deps.repl.locks.replace(lockName(bound), seen, text)) ? text : null
}

/** @param {string} text @returns {{ pid: number, created: string | null } | null} null when it names no process */
const holderOf = (text) => {
  try {
    const { pid, created } = JSON.parse(text)
    return Number.isInteger(pid) ? { pid, created: created ?? null } : null
  } catch {
    return null
  }
}

/** @param {any} deps @param {{ slug: string, folder: string }} bound @param {string} text */
export const releaseLease = (deps, bound, text) => deps.repl.locks.replace(lockName(bound), text, null)
