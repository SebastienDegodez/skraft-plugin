import { RESULT_SHAPE } from './agent-result.mjs'

/**
 * @typedef {{ name: string, root: string, stack: string, test: string | null }} BriefComponent
 * @typedef {{
 *   agent: string, phase: string, slug: string,
 *   story: { issue?: number | null, title?: string | null } | null,
 *   visit: number, attempt: number, maxAttempts: number,
 *   inputs: string[], outputs: string[], result: string,
 *   allowed: string[], components: BriefComponent[], tdd: 'cycle' | 'red' | null,
 *   missing: string[], feedback: string[],
 * }} Brief
 *   inputs, outputs, result and missing are absolute paths; allowed is relative to the working
 *   copy; components: those whose paths the agent may write, empty otherwise. tdd: the commits
 *   the agent makes, a whole TDD cycle or failing tests only. feedback: on a retry, why the
 *   previous attempt was refused; on a new pass, the gate failures behind it.
 */

/**
 * The prompt a dispatched agent receives, the same on every host.
 * @param {Brief} brief
 */
export const composeBrief = ({ agent, phase, slug, story, visit, attempt, maxAttempts, inputs, outputs, result, allowed, components, tdd, missing, feedback }) => [
  `## Skraft dispatch: ${agent} (${phase})`,
  `- Story: ${storyLine(story)}`,
  `- Feature scope: ${slug}`,
  ...(visit > 1 ? [`- Pass: ${visit}, after the gates sent the work back`] : []),
  `- Attempt: ${attempt} of ${maxAttempts}`,
  ...section('- Read first:', inputs),
  ...section('- Fill each output in place; keep the path, create no other copy:', outputs),
  `- Write your result as JSON to ${result}: ${RESULT_SHAPE}`,
  ...section('- Change nothing outside these paths of the working copy; the engine refuses the step otherwise:', [
    ...allowed,
    ...components.map(({ name, root }) => `${root}/* (the files right in the root of ${name})`),
  ]),
  ...section('- Components:', components.map(({ name, root, stack, test }) => `${name}: ${root} (${stack})${test ? `, tests: ${test}` : ''}`)),
  ...(tdd === null ? [] : [TDD_RULES[tdd]]),
  ...(missing.length > 0 ? ['', `Missing outputs from attempt ${attempt - 1} of ${maxAttempts}:`, ...missing.map((path) => `- ${path}`)] : []),
  ...(feedback.length > 0 ? ['', attempt > 1 ? `Refused in attempt ${attempt - 1} of ${maxAttempts}:` : `The gates failed on pass ${visit - 1}:`, ...feedback.map((line) => `- ${line}`)] : []),
].join('\n')

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
const storyLine = (story) => {
  const parts = [story?.issue ? `#${story.issue}` : null, story?.title || null].filter(Boolean)
  return parts.length > 0 ? parts.join(' — ') : 'none'
}

/**
 * Stable across a resume: a host that memoises dispatches by label finds it again.
 * @param {{ slug: string, step: string, visit: number, attempt: number }} dispatch
 */
export const dispatchLabel = ({ slug, step, visit, attempt }) => `skraft ${slug} · ${step}${visit > 1 ? ` · pass ${visit}` : ''} · attempt ${attempt}`
