/**
 * What `/skraft <args>` and the `run_pipeline` tool ask for, as the input of a use case.
 *
 * @typedef {{ issue: number | null, title: string | null } | null} Story
 * @typedef {{ command: 'status' }
 *   | { command: 'decide', key: string | null, answer: string | null, reason: string | null }
 *   | { command: 'review', number: number | null, publish: boolean }
 *   | { command: 'run', slug: string | null, story: Story, base: string | null, fromArtifacts: boolean }} SkraftRequest
 *   run with a null slug resumes the active pipeline; the slug is never guessed. base: the
 *   `--base <ref>` typed anywhere after the slug, null without one. fromArtifacts:
 *   `--from-artifacts` typed anywhere after the slug.
 */

/**
 *   '', 'status', 'help'        → status (reserved words, never slugs)
 *   'decide RATIFIED'           → decide the open question
 *   'decide adr-1 REJECTED why' → decide adr-1, with the reason after the answer
 *   'review 12 --publish'       → review pull request 12, its verdict kept in a comment
 *   'checkout #42 Pay by card'  → run checkout, story { issue: 42, title: 'Pay by card' }
 *   'checkout --base develop'   → run checkout on the base develop
 *   'checkout --from-artifacts' → run checkout from its DISCUSS stories
 * @param {unknown} args everything after `/skraft`, as typed
 * @returns {SkraftRequest}
 */
export const parseSkraftCommand = (args) => {
  const [first, ...rest] = String(args ?? '').split(/\s/).filter((word) => word !== '')
  if (asksForStatus(first, rest)) return { command: 'status' }
  if (first === 'decide') return decideRequest(rest)
  if (first === 'review') return reviewRequest(rest)
  return runRequest(/** @type {string} */ (first), rest)
}

/** Nothing typed, or a reserved word on its own. @param {string | undefined} first @param {string[]} rest */
const asksForStatus = (first, rest) => first === undefined || ((first === 'status' || first === 'help') && rest.length === 0)

/**
 * `<slug> [#<issue>] [title…]`, with `--base <ref>` and `--from-artifacts` anywhere after the slug.
 * @param {string} slug @param {string[]} typed
 * @returns {{ command: 'run', slug: string, story: Story, base: string | null, fromArtifacts: boolean }}
 */
const runRequest = (slug, typed) => {
  const words = typed.filter((word) => word !== FROM_ARTIFACTS)
  const { base, story } = splitBase(words)
  const issue = /^#(\d+)$/.exec(story[0])
  const titleWords = issue ? story.slice(1) : story
  return { command: 'run', slug, story: storyOf(issue ? Number(issue[1]) : null, titleWords.join(' ')), base, fromArtifacts: words.length < typed.length }
}

const FROM_ARTIFACTS = '--from-artifacts'
const PUBLISH = '--publish'

/**
 * `<number> [--publish]`, `--publish` anywhere; a number that is not one positive whole number,
 * or any other word, is none.
 * @param {string[]} words
 * @returns {{ command: 'review', number: number | null, publish: boolean }}
 */
const reviewRequest = (words) => {
  const numbers = words.filter((word) => word !== PUBLISH)
  const number = numbers.length === 1 && /^[1-9]\d*$/.test(numbers[0]) ? Number(numbers[0]) : null
  return { command: 'review', number, publish: numbers.length < words.length }
}
const QUESTION_KEY = /^[A-Za-z_][A-Za-z0-9_-]*-\d+$/

/**
 * `[<key>] <answer> [reason…]`: a first word shaped like a question key (`adr-1`) names the question.
 * @param {string[]} words
 * @returns {{ command: 'decide', key: string | null, answer: string | null, reason: string | null }}
 */
const decideRequest = (words) => {
  const keyed = QUESTION_KEY.test(words[0] ?? '')
  const [answer, ...reason] = keyed ? words.slice(1) : words
  return { command: 'decide', key: keyed ? words[0] : null, answer: answer ?? null, reason: reason.length > 0 ? reason.join(' ') : null }
}

/**
 * The ref after `--base` ('' when nothing follows it, null without `--base`) and the words left
 * for the story once `--base` and its ref are taken out.
 * @param {string[]} words
 * @returns {{ base: string | null, story: string[] }}
 */
const splitBase = (words) => {
  const flag = words.indexOf('--base')
  if (flag < 0) return { base: null, story: words }
  return { base: words[flag + 1] ?? '', story: [...words.slice(0, flag), ...words.slice(flag + 2)] }
}

/**
 * @param {{ slug?: unknown, issue?: unknown, title?: unknown, base?: unknown, fromArtifacts?: unknown } | null | undefined} input the tool's input
 * @returns {{ command: 'run', slug: string | null, story: Story, base: string | null, fromArtifacts: boolean }}
 */
export const toolRequest = (input) => ({
  command: 'run',
  slug: trimmedText(input?.slug),
  story: storyOf(positiveInteger(input?.issue), trimmedText(input?.title) ?? ''),
  base: trimmedText(input?.base),
  fromArtifacts: input?.fromArtifacts === true,
})

/** The text without surrounding blanks; null when it is not text or holds only blanks. @param {unknown} value */
const trimmedText = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

/** @param {unknown} value @returns {number | null} */
const positiveInteger = (value) => (Number.isInteger(value) && Number(value) > 0 ? Number(value) : null)

/** @param {number | null} issue @param {string} title @returns {Story} */
const storyOf = (issue, title) => (issue === null && title === '' ? null : { issue, title: title === '' ? null : title })
