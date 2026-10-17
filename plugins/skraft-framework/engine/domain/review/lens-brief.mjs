import { storyLine } from '../pipeline/dispatch-brief.mjs'
import { lensShape, MAX_FINDINGS, REFUTATION_SHAPE } from './answers.mjs'

/**
 * The prompts of a review's lenses and of the refuter, the same on every host.
 *
 * @typedef {import('./answers.mjs').Finding} Finding
 * @typedef {{ kind: import('./lenses.mjs').InputKind, path: string }} LensInput path: absolute
 * @typedef {{
 *   lens: import('./lenses.mjs').Lens, phase: string, slug: string,
 *   story: { issue?: number | null, title?: string | null } | null,
 *   inputs: LensInput[], skills: string[], retry: string | null,
 * }} LensBrief
 *   skills: the absolute paths of the SKILL.md files the lens declares; retry: why the previous
 *   answer was refused, on the one retry.
 * @typedef {{ lens: string, finding: Finding, inputs: LensInput[], skills: string[], retry: string | null }} RefuterBrief
 *   skills: those of the lens that gave the finding.
 */

const TITLES = Object.freeze({
  overview: 'Review context (story, project rules, who wrote which document)',
  outputs: 'Documents of this phase',
  context: 'Documents of the story and of the other phases',
  patch: 'Changes since the base of the run (open a whole file only when the patch lacks the context a finding needs)',
  files: 'Paths those changes touch (a path with no section in the patch is a new file: open it)',
  components: 'Components (stack, mocking strategy, contract testing)',
})

/** @param {LensBrief} brief */
export const composeLensBrief = ({ lens, phase, slug, story, inputs, skills, retry }) => [
  ...(lens.blind ? [`## Skraft review lens: ${lens.name}`] : [`## Skraft review lens: ${lens.name} (${phase})`, `- Story: ${storyLine(story)}`, `- Feature scope: ${slug}`]),
  ...skillLines(skills),
  ...inputLines(inputs),
  '- Write no file, change nothing, start no agent.',
  `- End your answer with this YAML document in a \`\`\`yaml block, at most ${MAX_FINDINGS} findings, every free text in double quotes:`,
  ...fenced(lensShape(lens.name)),
  ...retryLines(retry),
].join('\n')

/** @param {RefuterBrief} brief */
export const composeRefuterBrief = ({ lens, finding, inputs, skills, retry }) => [
  `## Skraft finding check: ${lens} ${finding.id}`,
  `- Finding: ${finding.gate} ${finding.severity}${finding.location === '' ? '' : ` at ${finding.location}`}: ${finding.description}`,
  ...skillLines(skills),
  ...inputLines(inputs),
  '- Confirm the finding only when these inputs show it; refute it when they show it is wrong, citing the path:line; say unverifiable when they cannot tell.',
  '- Write no file, change nothing, start no agent.',
  '- End your answer with this YAML document in a ```yaml block:',
  ...fenced(REFUTATION_SHAPE),
  ...retryLines(retry),
].join('\n')

/** @param {string[]} skills */
const skillLines = (skills) => skills.map((path) => `- Skill (read it before any other input and judge with its criteria): ${path}`)

/** @param {LensInput[]} inputs */
const inputLines = (inputs) => [
  '- Read these inputs and the files they name; search the repository for nothing else:',
  ...inputs.map(({ kind, path }) => `  - ${TITLES[kind]}: ${path}`),
]

/** @param {string} document */
const fenced = (document) => ['```yaml', document, '```']

/** @param {string | null} retry */
const retryLines = (retry) => (retry === null ? [] : ['', `Your previous answer was refused: ${retry}. Answer again with the YAML document only.`])

/**
 * Stable across a resume, distinct for every lens and finding of every pass.
 * @param {{ slug: string, step: string, visit: number, what: string, attempt: number }} dispatch what: the lens, or `refute <lens> <finding>`
 */
export const reviewLabel = ({ slug, step, visit, what, attempt }) => `skraft ${slug} · ${step} · ${what}${visit > 1 ? ` · pass ${visit}` : ''} · attempt ${attempt}`
