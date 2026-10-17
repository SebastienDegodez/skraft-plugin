import { storyLine } from '../pipeline/dispatch-brief.mjs'

/**
 * The shared context of a review, one file every lens but a blind one reads first: the
 * story, the project's own rules, and who wrote which document. It holds nothing that moves
 * from one pass to the next unless a document does, so a lens's fingerprint stays put.
 *
 * @typedef {{ step: string, agent: string, documents: string[] }} WrittenBy documents: absolute paths
 * @typedef {{ phase: string, steps: WrittenBy[] }} PhaseDocuments
 * @typedef {{
 *   node: string, phase: string,
 *   story: { issue?: number | null, title?: string | null } | null,
 *   rules: string[], artifacts: string[], phases: PhaseDocuments[],
 * }} ReviewContext
 *   rules and artifacts: absolute paths; phases: in workflow order, those whose agents ran.
 */

/** The project files that hold rules a lens judges against, relative to the working copy. */
export const RULE_FILES = Object.freeze(['AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md', '.github/copilot-instructions.md', 'docs/adr/decisions-index.md'])

/** @param {ReviewContext} context */
export const composeReviewContext = ({ node, phase, story, rules, artifacts, phases }) => [
  `# Review context: ${node} (${phase})`,
  '', '## Story', '', storyLine(story), ...listed('Story documents', artifacts),
  '', '## Project rules', '', ...(rules.length > 0 ? rules.map((path) => `- ${path}`) : ['none found']),
  '', '## Documents by phase', ...phases.flatMap((entry) => phaseLines(entry, phase)),
  '',
].join('\n')

/** @param {string} title @param {string[]} paths */
const listed = (title, paths) => (paths.length > 0 ? ['', `${title}:`, ...paths.map((path) => `- ${path}`)] : [])

/** @param {PhaseDocuments} entry @param {string} reviewed */
const phaseLines = ({ phase, steps }, reviewed) => [
  '', `### ${phase}${phase === reviewed ? ' (under review)' : ''}`, '',
  ...steps.flatMap(({ step, agent, documents }) => [`- ${step} (${agent}):`, ...documents.map((path) => `  - ${path}`)]),
]
