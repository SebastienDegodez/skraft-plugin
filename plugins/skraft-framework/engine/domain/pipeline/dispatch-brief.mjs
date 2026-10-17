import { RESULT_SHAPE } from './agent-result.mjs'

/**
 * @typedef {{ name: string, root: string, stack: string, test: string | null }} BriefComponent
 * @typedef {{
 *   agent: string, phase: string, slug: string,
 *   story: { issue?: number | null, title?: string | null } | null,
 *   visit: number, attempt: number, maxAttempts: number,
 *   inputs: string[], outputs: string[], result: string,
 *   allowed: string[], components: BriefComponent[], tdd: 'cycle' | 'red' | null,
 *   missing: string[], feedback: string[], sentBy: 'gate' | 'review' | null,
 * }} Brief
 *   inputs, outputs, result and missing are absolute paths; allowed is relative to the working
 *   copy; components: those whose paths the agent may write, empty otherwise. tdd: the commits
 *   the agent makes, a whole TDD cycle or failing tests only. feedback: on a retry, why the
 *   previous attempt was refused; on a new pass, the gate failures or the review findings behind
 *   it, sentBy naming which.
 */

/**
 * The prompt a dispatched agent receives, the same on every host.
 * @param {Brief} brief
 */
export const composeBrief = (brief) => [
  ...headerLines(brief),
  ...workLines(brief),
  ...missingLines(brief),
  ...feedbackLines(brief),
].join('\n')

/** Who is dispatched, for which story, on which pass and attempt. @param {Brief} brief */
const headerLines = ({ agent, phase, slug, story, visit, attempt, maxAttempts, sentBy }) => [
  `## Skraft dispatch: ${agent} (${phase})`,
  `- Story: ${storyLine(story)}`,
  `- Feature scope: ${slug}`,
  ...(visit > 1 ? [`- Pass: ${visit}, after the ${sentBy === 'review' ? 'review' : 'gates'} sent the work back`] : []),
  `- Attempt: ${attempt} of ${maxAttempts}`,
]

/** What the agent reads, fills and may change, and the commits it makes. @param {Brief} brief */
const workLines = ({ inputs, outputs, result, allowed, components, tdd }) => [
  ...section('- Read first:', inputs),
  ...section('- Fill each output in place; keep the path, create no other copy:', outputs),
  `- Write your result as JSON to ${result}: ${RESULT_SHAPE}`,
  ...section('- Change nothing outside these paths of the working copy; the engine refuses the step otherwise:', writablePaths(allowed, components)),
  ...section('- Components:', components.map(componentLine)),
  ...(tdd === null ? [] : [TDD_RULES[tdd]]),
]

/** @param {string[]} allowed @param {BriefComponent[]} components */
const writablePaths = (allowed, components) => [
  ...allowed,
  ...components.map(({ name, root }) => `${root}/* (the files right in the root of ${name})`),
]

/** @param {BriefComponent} component */
const componentLine = ({ name, root, stack, test }) => `${name}: ${root} (${stack})${test ? `, tests: ${test}` : ''}`

/** The outputs the previous attempt left empty. @param {Brief} brief */
const missingLines = ({ missing, attempt, maxAttempts }) => (missing.length > 0
  ? ['', `Missing outputs from attempt ${attempt - 1} of ${maxAttempts}:`, ...missing.map((path) => `- ${path}`)]
  : [])

/** Why the previous attempt was refused, or why the gates sent the work back. @param {Brief} brief */
const feedbackLines = ({ feedback, attempt, maxAttempts, visit, sentBy }) => (feedback.length > 0
  ? ['', feedbackTitle({ attempt, maxAttempts, visit, sentBy }), ...feedback.map((line) => `- ${line}`)]
  : [])

/** @param {Pick<Brief, 'attempt' | 'maxAttempts' | 'visit' | 'sentBy'>} brief */
const feedbackTitle = ({ attempt, maxAttempts, visit, sentBy }) => {
  if (attempt > 1) return `Refused in attempt ${attempt - 1} of ${maxAttempts}:`
  return sentBy === 'review' ? `The review sent the work back on pass ${visit - 1}, with these findings:` : `The gates failed on pass ${visit - 1}:`
}

const TDD_RULES = Object.freeze({
  cycle: [
    '- Commit each TDD cycle: `test(<story>): …` with the failing test, then `feat(<story>): …` or `fix(<story>): …` with the code that makes it pass,',
    '  then `refactor(<story>): …` if needed. Tests that pass from the start (coverage) go with the code they cover, or in a `refactor` commit;',
    '  lint and format fixes in a `style` commit. The engine runs the tests at every test commit and refuses one whose tests pass,',
    '  a feat or fix commit with no test commit since the last feat or fix (on a pass the gates sent back, their failure counts as that test),',
    '  and any commit that is not `type(scope): subject`. A refused commit stays refused until you rewrite it.',
  ].join('\n'),
  red: [
    '- Commit the failing acceptance tests as `test(<story>): …`. The engine runs the tests at every test commit and refuses one whose tests pass,',
    '  and any commit that is not `type(scope): subject`. A refused commit stays refused until you rewrite it.',
  ].join('\n'),
})

/** @param {string} title @param {string[]} lines */
const section = (title, lines) => (lines.length > 0 ? [title, ...lines.map((line) => `- ${line}`)] : [])

/** @param {{ issue?: number | null, title?: string | null } | null} story */
export const storyLine = (story) => {
  const parts = [story?.issue ? `#${story.issue}` : null, story?.title || null].filter(Boolean)
  return parts.length > 0 ? parts.join(' — ') : 'none'
}

/**
 * Stable across a resume: a host that memoises dispatches by label finds it again.
 * @param {{ slug: string, step: string, visit: number, attempt: number }} dispatch
 */
export const dispatchLabel = ({ slug, step, visit, attempt }) => `skraft ${slug} · ${step}${visit > 1 ? ` · pass ${visit}` : ''} · attempt ${attempt}`
