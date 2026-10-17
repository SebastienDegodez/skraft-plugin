/**
 * What `/skraft <args>` and the `run_pipeline` tool ask for, as the input of a use case.
 *
 * @typedef {{ issue: number | null, title: string | null } | null} Story
 * @typedef {{ command: 'status' }
 *   | { command: 'decide', words: string[] }
 *   | { command: 'run', slug: string | null, story: Story, base: string | null }} SkraftRequest
 *   run with a null slug resumes the active pipeline; the slug is never guessed. base: the
 *   `--base <ref>` typed anywhere after the slug, null without one.
 */

/**
 *   '', 'status', 'help'        → status (reserved words, never slugs)
 *   'decide …'                  → decide
 *   'checkout #42 Pay by card'  → run checkout, story { issue: 42, title: 'Pay by card' }
 *   'checkout --base develop'   → run checkout on the base develop
 * @param {unknown} args everything after `/skraft`, as typed
 * @returns {SkraftRequest}
 */
export const parseSkraftCommand = (args) => {
  const typed = String(args ?? '').split(/\s/).filter((word) => word !== '')
  const [first, ...rest] = typed
  if (first === undefined || ((first === 'status' || first === 'help') && rest.length === 0)) return { command: 'status' }
  if (first === 'decide') return { command: 'decide', words: rest }
  const flag = rest.indexOf('--base')
  const base = flag >= 0 ? rest[flag + 1] ?? '' : null
  const story = flag >= 0 ? [...rest.slice(0, flag), ...rest.slice(flag + 2)] : rest
  const issue = /^#(\d+)$/.exec(story[0])
  const titleWords = issue ? story.slice(1) : story
  return { command: 'run', slug: first, story: storyOf(issue ? Number(issue[1]) : null, titleWords.join(' ')), base }
}

/**
 * @param {{ slug?: unknown, issue?: unknown, title?: unknown, base?: unknown } | null | undefined} input the tool's input
 * @returns {{ command: 'run', slug: string | null, story: Story, base: string | null }}
 */
export const toolRequest = (input) => {
  const slug = typeof input?.slug === 'string' && input.slug.trim() !== '' ? input.slug.trim() : null
  const issue = Number.isInteger(input?.issue) && Number(input?.issue) > 0 ? Number(input?.issue) : null
  const base = typeof input?.base === 'string' && input.base.trim() !== '' ? input.base.trim() : null
  return { command: 'run', slug, story: storyOf(issue, typeof input?.title === 'string' ? input.title.trim() : ''), base }
}

/** @param {number | null} issue @param {string} title @returns {Story} */
const storyOf = (issue, title) => (issue === null && title === '' ? null : { issue, title: title === '' ? null : title })
