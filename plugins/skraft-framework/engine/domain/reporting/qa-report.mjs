import { cell, code } from './markdown-safety.mjs'
import { durationText } from './run-report.mjs'
import { finalGates, redCommits } from './run-facts.mjs'
import { lensesText, reviewPasses } from './review-passes.mjs'

/**
 * qa-report.md: what a qualification team reads to judge the story, from the journal alone: the
 * test plan, each component's last gates with its mutation score and survivors, the red commits
 * of its TDD cycles, each review's verdict. Every text an agent or a tool wrote sits in a code
 * span; the rest is the engine's.
 *
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {import('./run-facts.mjs').GateFact} GateFact
 * @typedef {{ scope: string, bar: number, detected: number, survivors: string[] }} JournaledScore
 */

export const QA_REPORT_FILE = 'qa-report.md'

/** @param {{ slug: string, status: string, events: RunEvent[] }} report */
export const renderQaReport = ({ slug, status, events }) => [
  '<!-- markdownlint-disable-file -->',
  `# QA report — ${slug}`,
  '',
  `Status: ${code(status)}`,
  '',
  ...section('Test plan', testPlanLines(events)),
  ...section('Gates', gateLines(events)),
  ...section('TDD red commits', redCommitLines(events)),
  ...section('Reviews', reviewLines(events)),
].join('\n')

/** @param {string} title @param {string[]} lines */
const section = (title, lines) => [`## ${title}`, '', ...lines, '']

/** The test plan a step's outputs name, with the phase that writes it. @param {RunEvent[]} events */
const testPlanLines = (events) => {
  const step = events.find((event) => event.outputs?.some(isTestPlan))
  if (step === undefined) return ['No test plan yet: DISTILL writes it.']
  const path = step.outputs.find(isTestPlan)
  return [`[${path}](${path}), written in ${step.phase}.`]
}

/** A file named `test-plan-…`, wherever in the tracking folder. @param {string} path */
const isTestPlan = (path) => /** @type {string} */ (path.split('/').at(-1)).startsWith('test-plan-')

/** Each component's last gates, in the order they first ran. @param {RunEvent[]} events */
const gateLines = (events) => {
  const gates = finalGates(events)
  if (gates.length === 0) return ['No gate has run yet.']
  const blocks = [...new Set(gates.map((gate) => gate.component))].map((component) => componentLines(events, component, gates.filter((gate) => gate.component === component)))
  return blocks.flatMap((block, index) => (index === 0 ? block : ['', ...block]))
}

/** @param {RunEvent[]} events @param {string} component @param {GateFact[]} gates */
const componentLines = (events, component, gates) => [
  `### ${component}`,
  '',
  '| Gate | Status | Time | Evidence |',
  '| --- | --- | ---: | --- |',
  ...gates.map(({ gate, status, durationMs, evidence }) => `| ${gate} | ${status} | ${durationText(durationMs)} | [${evidence}](${evidence}) |`),
  ...mutationLines(events, component),
]

/**
 * The scores and survivors of the component's last mutation run; nothing when none ran, and no
 * score when its report was not read.
 * @param {RunEvent[]} events @param {string} component
 */
const mutationLines = (events, component) => {
  const last = events.findLast((event) => event.gate === 'mutation' && event.component === component)
  if (last === undefined) return []
  return ['', ...scoreLines(last.scores)]
}

/** @param {JournaledScore[] | null} scores */
const scoreLines = (scores) => {
  if (scores === null) return ['Mutation score: mutation report not read.']
  if (scores.length === 0) return ['Mutation score: no mutant in the files the story changed.']
  return [`Mutation score: ${scores.map(scoreText).join(', ')}.`, '', ...survivorLines(scores.flatMap((score) => score.survivors))]
}

/** `core 92 % (bar 100 %, 13 mutants)`, rounded down so that it never reads as the bar. @param {JournaledScore} score */
const scoreText = ({ scope, bar, detected, survivors }) => {
  const counted = detected + survivors.length
  return `${scope} ${Math.floor((100 * detected) / counted)} % (bar ${bar} %, ${counted} ${counted === 1 ? 'mutant' : 'mutants'})`
}

/** @param {string[]} survivors */
const survivorLines = (survivors) => (survivors.length === 0 ? ['No surviving mutant.'] : ['Surviving mutants:', '', ...survivors.map((line) => `- ${code(line)}`)])

/** @param {RunEvent[]} events */
const redCommitLines = (events) => {
  const commits = redCommits(events)
  if (commits.length === 0) return ['No red commit yet.']
  return [
    '| Commit | Subject | Test exit code |',
    '| --- | --- | ---: |',
    ...commits.map(({ sha, subject, exitCode }) => `| ${code(sha)} | ${cell(code(subject))} | ${exitCode ?? '-'} |`),
  ]
}

/** @param {RunEvent[]} events */
const reviewLines = (events) => {
  const passes = reviewPasses(events)
  if (passes.length === 0) return ['No review has run yet.']
  return [
    '| Review | Pass | Verdict | Findings | Lenses |',
    '| --- | ---: | --- | ---: | --- |',
    ...passes.map((pass) => `| ${pass.step} | ${pass.visit} | ${pass.verdict ?? 'in progress'} | ${pass.lenses.reduce((total, lens) => total + lens.findings, 0)} | ${lensesText(pass.lenses)} |`),
  ]
}
