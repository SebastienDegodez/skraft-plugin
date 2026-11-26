import { code } from './markdown-safety.mjs'
import { qualityEvidence, isTestPlan, testPlanPaths } from './run-facts.mjs'
import { qaLines, qaTable } from './qa-evidence.mjs'
import { lensesText, reviewPasses } from './review-passes.mjs'

/**
 * qa-report.md: what a qualification team reads to judge the story, from the journal alone: the
 * test plan, the traced runs the delivery stands on, each review's verdict. The red commits prove
 * the TDD loop to a developer, not to QA: the pull request holds them. Every text an agent or a
 * tool wrote sits in a code
 * span; the rest is the engine's.
 *
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 */

export const QA_REPORT_FILE = 'qa-report.md'

/**
 * The scenarios are shown as the pull request's QA section shows them, by the same renderer, its
 * paths those of the tracking folder.
 * @param {{ slug: string, status: string, events: RunEvent[], outcomes: import('./scenario-outcomes.mjs').ScenarioOutcome[] }} report
 */
export const renderQaReport = ({ slug, status, events, outcomes }) => [
  '<!-- markdownlint-disable-file -->',
  `# QA report — ${slug}`,
  '',
  `Status: ${code(status)}`,
  '',
  ...section('Test plan', testPlanLines(events)),
  ...qaSections(qaFacts(events, outcomes)),
  ...section('Quality evidence', gateLines(events)),
  ...section('Reviews', reviewLines(events)),
].join('\n')

/**
 * What the QA renderer reads, in English: the outcomes, the test plans the journal names, the last visuals step's screenshots.
 * @param {RunEvent[]} events @param {import('./scenario-outcomes.mjs').ScenarioOutcome[]} outcomes
 * @returns {import('./qa-evidence.mjs').QaFacts}
 */
const qaFacts = (events, outcomes) => {
  const visuals = events.findLast((event) => event.type === 'visuals.recorded')
  return { outcomes, visuals: visuals === undefined ? null : { commit: visuals.commit, components: visuals.components }, testPlans: testPlanPaths(events).map((path) => ({ path })), language: 'en' }
}

/** @param {import('./qa-evidence.mjs').QaFacts} facts */
const qaSections = (facts) => [...section('QA', qaLines(facts)), ...section('Scenario outcomes', qaTable(facts))]

/** @param {string} title @param {string[]} lines */
const section = (title, lines) => [`## ${title}`, '', ...lines, '']

/** The test plan a step's outputs name, with the phase that writes it. @param {RunEvent[]} events */
const testPlanLines = (events) => {
  const step = events.find((event) => event.outputs?.some(isTestPlan))
  if (step === undefined) return ['No test plan yet: DISTILL writes it.']
  const path = step.outputs.find(isTestPlan)
  return [`[${path}](${path}), written in ${step.phase}.`]
}

/** The traced runs the delivery stands on. @param {RunEvent[]} events */
const gateLines = (events) => {
  const evidence = qualityEvidence(events)
  if (evidence.length === 0) return ['No traced run has been checked yet.']
  return ['| Gate | Folder | Run | Log |', '| --- | --- | ---: | --- |', ...evidence.map(({ gate, folder, run, log }) => `| ${gate} | ${code(folder)} | ${run} | [${log}](${log}) |`)]
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
