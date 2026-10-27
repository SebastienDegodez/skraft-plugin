import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { v1ConfigMigration } from '../../domain/migration/v1-config.mjs'
import { createConfigureComponents } from '../config/configure-components-usecase.mjs'

/**
 * @typedef {'absent' | 'unchanged' | 'unmapped' | 'would-migrate' | 'migrated' | 'components-refused'} ConfigStatus
 *   components-refused: the v1 keys are dropped, but skraft init could not list the components.
 * @typedef {{ status: ConfigStatus, dropped: string[], unmapped: string[], reason: string, text?: string }} ConfigOutcome
 *   unmapped: keys that are neither v1 keys nor keys V2 reads; the file is then left as it is.
 *   text: with --dry-run, what the file would hold before its components are listed.
 * @typedef {Parameters<typeof createConfigureComponents>[0]} ConfigDeps
 */

/**
 * The v1 `skraft-config.json` without its v1 keys, then the components `skraft init` finds
 * added to it. A key that maps to no V2 key is reported, never guessed: the file stays as it is.
 * @param {ConfigDeps} deps @param {{ dryRun: boolean, workingCopyName: string }} request
 * @returns {Promise<ConfigOutcome>}
 */
export const migrateConfig = async (deps, request) => {
  const text = await deps.workspace.read(CONFIG_FILE)
  if (text === null) return leftAsItIs('absent', `${CONFIG_FILE} is absent; nothing to migrate`)
  const migration = v1ConfigMigration(text)
  if (migration === null) return leftAsItIs('unchanged', `${CONFIG_FILE} holds no v1 key; left as it is`)
  const { dropped, unmapped } = migration
  if (unmapped.length > 0) return { status: 'unmapped', dropped, unmapped, reason: unmappedReason(unmapped) }
  return rewritten(deps, request, migration)
}

/** @param {ConfigStatus} status @param {string} reason @returns {ConfigOutcome} */
const leftAsItIs = (status, reason) => ({ status, dropped: [], unmapped: [], reason })

/** @param {string[]} unmapped */
const unmappedReason = (unmapped) =>
  `${CONFIG_FILE}: ${listed(unmapped)} map to no key of V2; it is left as it is: move or remove them, then migrate again`

/**
 * @param {ConfigDeps} deps @param {{ dryRun: boolean, workingCopyName: string }} request
 * @param {import('../../domain/migration/v1-config.mjs').V1ConfigMigration} migration
 * @returns {Promise<ConfigOutcome>}
 */
const rewritten = async (deps, { dryRun, workingCopyName }, { dropped, kept }) => {
  const text = `${JSON.stringify(kept, null, 2)}\n`
  const done = `${CONFIG_FILE}: dropped ${listed(dropped)}`
  if (dryRun) return { status: 'would-migrate', dropped, unmapped: [], reason: `${done}; skraft init would then list the components it finds`, text }
  await deps.workspace.replace(CONFIG_FILE, text)
  const configured = await createConfigureComponents(deps).configure({ workingCopyName })
  if (!configured.ok) return { status: 'components-refused', dropped, unmapped: [], reason: `${done}; no component listed: ${configured.reason}` }
  return { status: 'migrated', dropped, unmapped: [], reason: `${done}; ${configured.reason}` }
}

/** `a`, `a and b`, `a, b and c`. @param {string[]} names */
export const listed = (names) => (names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)
