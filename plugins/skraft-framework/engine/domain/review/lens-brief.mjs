import { storyLine } from '../pipeline/dispatch-brief.mjs'
import { checksShape, lensShape, MAX_FINDINGS, REFUTATION_SHAPE } from './answers.mjs'
import { citationOf } from './finding-groups.mjs'
import { SCANNED_WITH } from './patch-scan.mjs'

/**
 * The prompts of a review's lenses and of the refuter, the same on every host.
 *
 * @typedef {import('./answers.mjs').Finding} Finding
 * @typedef {{ kind: import('./lenses.mjs').InputKind, path: string }} LensInput path: absolute
 * @typedef {{
 *   lens: import('./lenses.mjs').Lens, phase: string, slug: string,
 *   story: { issue?: number | null, title?: string | null } | null,
 *   inputs: LensInput[], skills: string[], known: Finding[], unchanged: boolean, retry: string | null,
 * }} LensBrief
 *   skills: the absolute paths of the SKILL.md files the lens declares; known: the findings the
 *   engine already reports on these changes; unchanged: the lens reads the changes and the run
 *   changed nothing outside the tracking folder; retry: why the previous answer was refused, on the
 *   one retry.
 * @typedef {{ members: Array<{ lens: string, finding: Finding }>, inputs: LensInput[], skills: string[], passed: string[] | null, retry: string | null }} RefuterBrief
 *   members: the findings of one group, one per lens; inputs and skills: those of their lenses,
 *   every input of the review when the lens stands alone; passed: then, the lenses that found nothing.
 */

const TITLES = Object.freeze({
  overview: 'Review context (story, project rules, who wrote which document)',
  outputs: 'Documents of this phase',
  context: 'Documents of the story and of the other phases',
  patch: 'Changes since the base of the run (open a whole file only when the patch lacks the context a finding needs)',
  files: 'Paths those changes touch (a path with no section in the patch is a new file: open it)',
  components: 'Components (stack, mocking strategy, contract testing, gates that passed)',
})

/** @param {LensBrief} brief */
export const composeLensBrief = ({ lens, phase, slug, story, inputs, skills, known, unchanged, retry }) => [
  ...(lens.blind ? [`## Skraft review lens: ${lens.name}`] : [`## Skraft review lens: ${lens.name} (${phase})`, `- Story: ${storyLine(story)}`, `- Feature scope: ${slug}`]),
  ...skillLines(skills),
  ...inputLines(inputs),
  ...degradedLines(lens, inputs),
  ...(unchanged ? ['- Changes since the base of the run: none outside the tracking folder; judge the documents above.'] : []),
  ...knownLines(known),
  '- Write no file, change nothing, start no agent.',
  `- End your answer with this YAML document in a \`\`\`yaml block, at most ${MAX_FINDINGS} findings, every free text in double quotes:`,
  ...fenced(lensShape(lens.name)),
  ...retryLines(retry),
].join('\n')

/** @param {RefuterBrief} brief */
export const composeRefuterBrief = ({ members, inputs, skills, passed, retry }) => [
  `## Skraft finding check: ${citationOf(members)}`,
  ...members.map((member) => findingLine(member, members.length > 1)),
  ...dissentLines(members, passed),
  ...skillLines(skills),
  ...inputLines(inputs),
  ...checkLines(members),
  ...retryLines(retry),
].join('\n')

/**
 * @param {{ lens: string, finding: Finding }} member @param {boolean} named whether the line names its lens, in a group of several
 */
const findingLine = ({ lens, finding }, named) => `- Finding${named ? ` (${lens} ${finding.id})` : ''}: ${finding.gate} ${finding.severity}${finding.location === '' ? '' : ` at ${finding.location}`}: ${finding.description}`

/** How to judge and answer: one verdict on one finding, a check each on several at one line. @param {RefuterBrief['members']} members */
const checkLines = (members) => {
  const several = members.length > 1
  return [
    several
      ? '- Check each finding on its own, though they share a line: confirm it only when these inputs show it; refute it when they show it is wrong, citing the path:line; say unverifiable when they cannot tell.'
      : '- Confirm the finding only when these inputs show it; refute it when they show it is wrong, citing the path:line; say unverifiable when they cannot tell.',
    '- Write no file, change nothing, start no agent.',
    '- End your answer with this YAML document in a ```yaml block:',
    ...fenced(several ? checksShape(members.map(({ lens, finding }) => `${lens} ${finding.id}`)) : REFUTATION_SHAPE),
  ]
}

/** @param {RefuterBrief['members']} members @param {string[] | null} passed */
const dissentLines = ([{ lens }], passed) => (passed === null ? [] : [
  `- Only ${lens} found a blocker, high or medium finding; ${passed.join(', ')} found none.`,
  '- Judge it as the reviewer, with every input of the review: confirm it only when the defect stands with all of them and warrants sending the work back; refute it when the story, a contract or a document shows the work is right as it is, or when its fix would change what they fix, and say why in reason.',
])

/** @param {string[]} skills */
const skillLines = (skills) => skills.map((path) => `- Skill (read it before any other input and judge with its criteria): ${path}`)

/** @param {LensInput[]} inputs */
const inputLines = (inputs) => [
  '- Read these inputs and the files they name; search the repository for nothing else:',
  ...inputs.map(({ kind, path }) => `  - ${TITLES[kind]}: ${path}`),
]

/** An input that says what the tests must hold: a `.feature`, or the story's test plan. */
// Stryker disable next-line Regex: the inputs are absolute paths of files the tracking folder names, which an anchor never tells apart
const SPECIFIED = /\.feature$|\/test-plan-[^/]*\.md$/

/**
 * test-integrity with neither a `.feature` nor a test plan to judge the tests against (a pull
 * request reviewed alone): it judges the removed lines against the added ones.
 * @param {import('./lenses.mjs').Lens} lens @param {LensInput[]} inputs
 */
const degradedLines = (lens, inputs) => (lens.name !== SCANNED_WITH || inputs.some(({ path }) => SPECIFIED.test(path)) ? [] : [
  '- No `.feature` file and no test plan among these inputs: judge G9 by comparing the lines the patch removes with the lines it adds (an assertion weakened, a test deleted, a skip or a focus added); their absence alone is no reason to answer inconclusive.',
])

/** @param {Finding[]} known */
const knownLines = (known) => (known.length === 0 ? [] : [
  '- The engine reports these findings from the patch; never report them again:',
  ...known.map(({ id, gate, severity, location, description }) => `  - ${id} ${gate} ${severity} at ${location}: ${description}`),
])

/** @param {string} document */
const fenced = (document) => ['```yaml', document, '```']

/** @param {string | null} retry */
const retryLines = (retry) => (retry === null ? [] : ['', `Your previous answer was refused: ${retry}. Answer again with the YAML document only.`])

/**
 * Stable across a resume, distinct for every lens and finding of every pass.
 * @param {{ slug: string, step: string, visit: number, what: string, attempt: number }} dispatch what: the lens id, or `refute <lens> <finding>, …` for a group
 */
export const reviewLabel = ({ slug, step, visit, what, attempt }) => `skraft ${slug} · ${step} · ${what}${visit > 1 ? ` · pass ${visit}` : ''} · attempt ${attempt}`
