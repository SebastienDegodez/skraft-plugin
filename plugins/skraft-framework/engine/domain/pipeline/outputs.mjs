/**
 * @param {string} pattern an output path with `{date}` and `{slug}`
 * @param {{ date: string, slug: string }} values
 */
export const outputPath = (pattern, { date, slug }) => pattern.replaceAll('{date}', date).replaceAll('{slug}', slug)

/** The UTC calendar day of an instant, `YYYY-MM-DD`. @param {Date} instant */
export const dayOf = (instant) => instant.toISOString().slice(0, 10)

const PLACEHOLDER = /\{\{[^{}]*\}\}/

/**
 * An output is filled once it holds text other than what the engine pre-created, with no
 * template placeholder `{{…}}` left.
 * @param {string | null} text the file's content, null when absent
 * @param {string | null} precreated what the engine wrote before dispatching, null when nothing
 */
export const isFilled = (text, precreated) => text !== null && text.trim() !== '' && text !== precreated && !PLACEHOLDER.test(text)
