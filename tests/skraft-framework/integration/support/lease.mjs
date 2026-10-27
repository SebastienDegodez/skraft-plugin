import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** The lock file of a pipeline in a working copy. @param {string} cwd @param {string} slug */
export const lockPath = (cwd, slug) => join(cwd, '.copilot-tracking', 'skraft-plans', slug, '.lock')

/**
 * A host that died left its lease; by the time a session resumes the run, nobody renewed it
 * for longer than its expiry: its renewal time goes ten minutes back.
 * @param {string} cwd @param {string} slug
 */
export const leaseLeftToExpire = async (cwd, slug) => {
  const [owner, since] = (await readFile(lockPath(cwd, slug), 'utf8')).trim().split(' ')
  await writeFile(lockPath(cwd, slug), `${owner} ${since} ${new Date(Date.now() - 600_000).toISOString()}\n`, 'utf8')
}
