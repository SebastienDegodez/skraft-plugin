/**
 * What `/skraft <args>` and the `run_pipeline` tool ask for, as the input of a use case.
 *
 * @typedef {{ issue: number | null, title: string | null } | null} Story
 * @typedef {{ command: 'status' }
 *   | { command: 'decide', words: string[] }
 *   | { command: 'run', slug: string | null, story: Story }} SkraftRequest
 *   run with a null slug resumes the active pipeline; the slug is never guessed.
 */

/**
 *   '', 'status', 'help'        → status (reserved words, never slugs)
 *   'decide …'                  → decide
 *   'checkout #42 Pay by card'  → run checkout, story { issue: 42, title: 'Pay by card' }
 * @param {unknown} args everything after `/skraft`, as typed
 * @returns {SkraftRequest}
 */
export const parseSkraftCommand = (args) => {
  const words = String(args ?? '').trim().split(/\s+/).filter((word) => word !== '')
  const [first, ...rest] = words
  if (first === undefined || ((first === 'status' || first === 'help') && rest.length === 0)) return { command: 'status' }
  if (first === 'decide') return { command: 'decide', words: rest }
  const issue = /^#(\d+)$/.exec(rest[0] ?? '')
  const titleWords = issue ? rest.slice(1) : rest
  return { command: 'run', slug: first, story: storyOf(issue ? Number(issue[1]) : null, titleWords.join(' ')) }
}

/**
 * @param {{ slug?: unknown, issue?: unknown, title?: unknown } | null | undefined} input the tool's input
 * @returns {{ command: 'run', slug: string | null, story: Story }}
 */
export const toolRequest = (input) => {
  const slug = typeof input?.slug === 'string' && input.slug.trim() !== '' ? input.slug.trim() : null
  const issue = Number.isInteger(input?.issue) && Number(input?.issue) > 0 ? Number(input?.issue) : null
  return { command: 'run', slug, story: storyOf(issue, typeof input?.title === 'string' ? input.title.trim() : '') }
}

/** @param {number | null} issue @param {string} title @returns {Story} */
const storyOf = (issue, title) => (issue === null && title === '' ? null : { issue, title: title === '' ? null : title })
