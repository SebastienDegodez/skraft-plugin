/**
 * What the REPL keeps of an exception of its own: its text goes to the run's
 * `logs/unexpected.log`, which nothing reads back, and the call names that file instead of
 * quoting the exception.
 */

/** Relative to `<slug>/`. */
export const UNEXPECTED_LOG = 'logs/unexpected.log'

/** @param {unknown} error */
const textOf = (error) => (error instanceof Error ? (error.stack ?? error.message) : String(error))

/**
 * Appends the exception to the run's unexpected.log; rejects when the file cannot be written.
 * @param {any} deps @param {string} slug @param {unknown} error @returns {Promise<string>} the absolute path of the file
 */
export const keepUnexpected = async (deps, slug, error) => {
  const before = (await deps.files.read(slug, UNEXPECTED_LOG)) ?? ''
  await deps.files.write(slug, UNEXPECTED_LOG, `${before}${textOf(error)}\n`)
  return deps.files.location(slug, UNEXPECTED_LOG)
}
