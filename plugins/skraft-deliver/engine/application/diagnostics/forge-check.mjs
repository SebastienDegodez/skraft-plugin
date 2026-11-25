import { chosenForge, forgeAdapters, forgeMissing } from '../config/forge.mjs'
import { isFrontend } from '../../domain/reporting/visuals.mjs'

/** How doctor says what chose the forge. */
const CHOSEN_BY = Object.freeze({ config: 'named in the configuration', remote: 'deduced from the Git remote' })

/**
 * The forge a run reads its issue from and opens its pull request on, what chose it, and what
 * this machine misses to reach it: a warning, a run starting without its forge.
 * @param {import('../config/forge.mjs').ForgeDeps} deps @param {import('../config/forge.mjs').Forge | null} named
 * @returns {Promise<{ subject: string, status: 'ok' | 'warn', detail: string }>}
 */
export const forgeCheck = async (deps, named) => {
  const { forge, by } = await chosenForge(deps, named)
  const missing = await forgeMissing(deps, forge)
  const chosen = `${forge}, ${CHOSEN_BY[by]}`
  return missing === null ? { subject: 'forge', status: 'ok', detail: chosen } : { subject: 'forge', status: 'warn', detail: `${chosen}: ${missing}` }
}

/** How the screenshots of a front end reach the pull request, as doctor says it. */
const SHOWN = Object.freeze({ attached: 'attached to the pull request by the forge\'s client', committed: 'committed on the working branch and linked at their commit' })

/**
 * How a front end's screenshots reach the pull request on a forge this machine reaches, and what
 * its client misses to show them (gh without --attach, az without its azure-devops extension): a
 * warning, the pull request opened without them. None without a front end or a forge reached.
 * @param {import('../config/forge.mjs').ForgeDeps} deps @param {import('../../domain/config/skraft-config.mjs').SkraftConfig} config
 * @returns {Promise<Array<{ subject: string, status: 'ok' | 'warn', detail: string }>>}
 */
export const screenshotsCheck = async (deps, config) => {
  if (!config.components.some(isFrontend) || (await forgeMissing(deps, config.forge)) !== null) return []
  const { codeHost } = await forgeAdapters(deps, config.forge)
  const blocked = await codeHost.screenshotsBlocked()
  if (blocked !== null) return [{ subject: 'screenshots', status: 'warn', detail: blocked }]
  return [{ subject: 'screenshots', status: 'ok', detail: codeHost.attachesFiles ? SHOWN.attached : SHOWN.committed }]
}
