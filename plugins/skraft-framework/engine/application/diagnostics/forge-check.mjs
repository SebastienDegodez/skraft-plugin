import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { chosenForge, forgeAdapters } from '../config/forge.mjs'

/** How doctor says what chose the forge. */
const CHOSEN_BY = Object.freeze({ config: `named in ${CONFIG_FILE}`, remote: 'deduced from the Git remote' })

/**
 * The forge a run reads its issue from and opens its pull request on, what chose it, and what
 * this machine misses to reach it: a warning, a run starting without its forge.
 * @param {import('../config/forge.mjs').ForgeDeps} deps @param {import('../config/forge.mjs').Forge | null} named
 * @returns {Promise<{ subject: string, status: 'ok' | 'warn', detail: string }>}
 */
export const forgeCheck = async (deps, named) => {
  const { forge, by } = await chosenForge(deps, named)
  const missing = await (await forgeAdapters(deps, forge)).codeHost.unavailable()
  const chosen = `${forge}, ${CHOSEN_BY[by]}`
  return missing === null ? { subject: 'forge', status: 'ok', detail: chosen } : { subject: 'forge', status: 'warn', detail: `${chosen}: ${missing}` }
}
