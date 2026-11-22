import { cell, code } from './markdown-safety.mjs'
import { qualityEvidence, isTestPlan, redCommits } from './run-facts.mjs'
import { lensesText, reviewPasses } from './review-passes.mjs'

/**
 * qa-report.md: what a qualification team reads to judge the story, from the journal alone: the
 * test plan, the traced runs the delivery stands on, the red commits
 * of its TDD cycles, each review's verdict. Every text an agent or a tool wrote sits in a code
 * span; the rest is the engine's.
 *
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 */

export const QA_REPORT_FILE = 'qa-report.md'

/** @param {{ slug: string, status: string, events: RunEvent[], outcomes: import('./scenario-outcomes.mjs').ScenarioOutcome[] }} report */
export const renderQaReport = ({ slug, status, events, outcomes }) => [
  '<!-- markdownlint-disable-file -->',
  `# QA report — ${slug}`,
  '',
  `Status: ${code(status)}`,
  '',
  ...section('Test plan', testPlanLines(events)),
  ...section('Scenarios', scenarioLines(outcomes)),
  ...section('Quality evidence', gateLines(events)),
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

/** Each scenario, what proves it or why it is not proven. @param {import('./scenario-outcomes.mjs').ScenarioOutcome[]} outcomes */
const scenarioLines = (outcomes) => (outcomes.length === 0 ? ['No scenario yet: DISTILL lists them.'] : outcomes.map(scenarioLine))

/** @param {import('./scenario-outcomes.mjs').ScenarioOutcome} outcome */
const scenarioLine = (outcome) => {
  const named = `${outcome.index === 0 ? '' : `S${outcome.index} `}${oneLineOf(outcome.title)} (${[outcome.component, ...outcome.ac].join(', ')})`
  if (outcome.status !== 'passed') return `- ${named}: not proven: ${outcome.reason}`
  const { red, green, suite } = outcome
  return `- ${named}: passed (red ${red}, green ${green}, suite run ${suite?.run} on ${suite?.sha}, ${outcome.named ? 'named in its log' : 'suite green; the log does not name this test'})`
}

/** @param {string} text */
const oneLineOf = (text) => text.replace(/\s+/g, ' ')

/** The traced runs the delivery stands on. @param {RunEvent[]} events */
const gateLines = (events) => {
  const evidence = qualityEvidence(events)
  if (evidence.length === 0) return ['No traced run has been checked yet.']
  return ['| Gate | Folder | Run | Log |', '| --- | --- | ---: | --- |', ...evidence.map(({ gate, folder, run, log }) => `| ${gate} | ${code(folder)} | ${run} | [${log}](${log}) |`)]
}

/** @param {RunEvent[]} events */
const redCommitLines = (events) => {
  const commits = redCommits(events)
  if (commits.length === 0) return ['No red commit yet.']
  return [
    '| Commit | Subject |',
    '| --- | --- |',
    ...commits.map(({ sha, subject }) => `| ${code(sha)} | ${cell(code(subject))} |`),
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
