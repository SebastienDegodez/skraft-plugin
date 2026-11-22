import { cell, code, oneLine } from './markdown-safety.mjs'
import { PASSED } from './scenario-outcomes.mjs'

/**
 * The QA evidence of a run as a reviewer reads it: one line that says how many scenarios passed,
 * on which commit and which run of the whole suite, then the table of every scenario, from its
 * acceptance criteria to the run that proves it. Rendered by the engine from the journal and the
 * trace; no agent writes it. Missing is not proven; delivered is not deployed.
 *
 * @typedef {import('./scenario-outcomes.mjs').ScenarioOutcome} ScenarioOutcome
 * @typedef {import('./visuals.mjs').Visuals} Visuals
 * @typedef {{ outcomes: ScenarioOutcome[], visuals: Visuals | null, testPlans: Array<{ path: string }>, language: import('./language.mjs').Language }} QaFacts
 */

const EN = Object.freeze({
  /** @param {number} passed @param {number} total */
  passed: (passed, total) => `QA: ${passed}/${total} scenarios passed`,
  /** @param {string} sha @param {number} run @param {number} seconds */
  on: (sha, run, seconds) => `on ${sha} (run r${run}, ${seconds} s)`,
  /** @param {string} component @param {string} on */
  onComponent: (component, on) => `${component} ${on}`,
  noSuite: 'no traced run of the whole suite proves them',
  none: 'QA: no scenario recorded: DISTILL lists them in its test plan.',
  /** @param {string} path */
  testPlan: (path) => `Test plan: ${path} in the tracking folder, its whole text under Tests.`,
  deployed: 'Delivered is not deployed: these runs prove the tests on the final commit, nothing about an environment.',
  header: '| # | Scenario | AC | Component | RED | Green | Final run | Named in log | Screenshot |',
  /** @param {number} run @param {string} sha */
  finalRun: (run, sha) => `r${run} on ${sha}`,
  notProven: 'not proven: ',
  yes: 'yes', no: 'no', dash: '—',
  noTable: 'None recorded: the run has no scenario.',
})

/** @type {typeof EN} */
const FR = Object.freeze({
  passed: (passed, total) => `QA : ${passed}/${total} scénarios réussis`,
  on: (sha, run, seconds) => `sur ${sha} (run r${run}, ${seconds} s)`,
  onComponent: (component, on) => `${component} ${on}`,
  noSuite: 'aucun run tracé de toute la suite ne les prouve',
  none: 'QA : aucun scénario consigné : DISTILL les liste dans son plan de test.',
  testPlan: (path) => `Plan de test : ${path} dans le dossier de suivi, son texte entier sous Tests.`,
  deployed: 'Livré n\'est pas déployé : ces runs prouvent les tests sur le commit final, rien d\'un environnement.',
  header: '| # | Scénario | AC | Composant | RED | Green | Run final | Nommé dans le log | Capture |',
  finalRun: (run, sha) => `r${run} sur ${sha}`,
  notProven: 'non prouvé : ',
  yes: 'oui', no: 'non', dash: '—',
  noTable: 'Aucun consigné : le run n\'a aucun scénario.',
})

/** The words of the QA evidence, per language. */
const WORDS = Object.freeze({ en: EN, fr: FR })

/**
 * The visible lines: the count of scenarios passed and the runs they stand on, the test plan, and
 * what delivered means.
 * @param {QaFacts} facts @returns {string[]}
 */
export const qaLines = ({ outcomes, testPlans, language }) => {
  const words = WORDS[language]
  if (outcomes.length === 0) return [words.none]
  const passed = outcomes.filter(({ status }) => status === PASSED).length
  const lines = [`${words.passed(passed, outcomes.length)} ${runsText(outcomes, words)}.`, ...testPlans.map(({ path }) => words.testPlan(code(path))), words.deployed]
  return lines.flatMap((line, index) => (index === 0 ? [line] : ['', line]))
}

/**
 * The runs of the whole suite the scenarios stand on: on its commit for one component, each with
 * its component for several.
 * @param {ScenarioOutcome[]} outcomes @param {typeof EN} words
 */
const runsText = (outcomes, words) => {
  const runs = new Map(outcomes.filter(({ suite }) => suite !== null).map(({ component, suite }) => [component, /** @type {NonNullable<ScenarioOutcome['suite']>} */ (suite)]))
  if (runs.size === 0) return words.noSuite
  const ons = [...runs].map(([component, { sha, run, durationMs }]) => [component, words.on(code(sha), run, Math.round(durationMs / 1000))])
  return ons.length === 1 ? ons[0][1] : ons.map(([component, on]) => words.onComponent(component, on)).join(', ')
}

/** What the folded table counts: the scenarios passed, of all. @param {QaFacts} facts @returns {string | null} */
export const qaCount = ({ outcomes }) => (outcomes.length === 0 ? null : `${outcomes.filter(({ status }) => status === PASSED).length}/${outcomes.length}`)

/**
 * The table of every scenario: its acceptance criteria, its component, the red that holds its
 * acceptance test, the green that delivered it, the run of the whole suite on the final commit
 * or why it is not proven, whether that run's log names its test, and its screenshots.
 * @param {QaFacts} facts @returns {string[]}
 */
export const qaTable = ({ outcomes, visuals, language }) => {
  const words = WORDS[language]
  if (outcomes.length === 0) return [words.noTable]
  return [words.header, '| ---: | --- | --- | --- | --- | --- | --- | --- | --- |', ...outcomes.map((outcome) => rowOf(outcome, visuals, words))]
}

/** @param {ScenarioOutcome} outcome @param {Visuals | null} visuals @param {typeof EN} words */
const rowOf = (outcome, visuals, words) => {
  const cells = [`S${outcome.index}`, cell(oneLine(outcome.title)), outcome.ac.map(code).join(' ') || words.dash, outcome.component, shaCell(outcome.red, words), shaCell(outcome.green, words), finalCell(outcome, words), namedCell(outcome, words), screenshotCell(outcome, visuals, words)]
  return `| ${cells.join(' | ')} |`
}

/** @param {string | null} sha @param {typeof EN} words */
const shaCell = (sha, words) => (sha === null ? words.dash : code(sha))

/** @param {ScenarioOutcome} outcome @param {typeof EN} words */
const finalCell = ({ status, suite, reason }, words) => (status === PASSED && suite !== null ? words.finalRun(suite.run, code(suite.sha)) : cell(`${words.notProven}${reason}`))

/** @param {ScenarioOutcome} outcome @param {typeof EN} words */
const namedCell = ({ named }, words) => {
  if (named === null) return words.dash
  return named ? words.yes : words.no
}

/**
 * The themes of the screenshots of the scenario's component whose title names it: `S<n> …`, or
 * its title itself.
 * @param {ScenarioOutcome} outcome @param {Visuals | null} visuals @param {typeof EN} words
 */
const screenshotCell = ({ index, title, component }, visuals, words) => {
  const own = visuals?.components.find((shown) => shown.component === component)?.screenshots ?? []
  const named = own.filter((screenshot) => namesScenario(screenshot.title, { index, title })).map(({ theme }) => theme)
  return named.length === 0 ? words.dash : [...new Set(named)].join(', ')
}

/** @param {string} shot @param {{ index: number, title: string }} scenario */
const namesScenario = (shot, { index, title }) => new RegExp(`^S${index}\\b`, 'i').test(shot) || shot.toLowerCase() === title.toLowerCase()
