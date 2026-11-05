/**
 * The DISTILL records the engine checks when the acceptance designer finishes, instead of a lens:
 *   scenarios  every `.feature` its test plan names is a file of the features folder, each of
 *              whose scenarios says Given, When and Then, fills every placeholder it opens from
 *              its examples, and is titled once in its file; and the story has at least one
 *              scenario per acceptance criterion it holds (#524)
 *
 * The plan declares what the story's scenarios are; a row that names none writes `—`, as the
 * coverage matrix of `test-design-mandates` does for a domain invariant or an adapter test. So a
 * story that declares no Gherkin is asked for none, and one that does is held to what it named.
 *
 * @typedef {{ path: string, text: string }} Document a file of the run, as the engine read it
 * @typedef {{ kind: string, title: string, steps: string[], examples: string[][] }} Scenario
 * @typedef {{ plans: Document[], features: Document[], criteria: Document[] }} Records
 *   plans: the test plans of the tracking folder; features: the `.feature` files of the working
 *   copy; criteria: the acceptance criteria of the story, `ac-draft-<story>.md`.
 */

/** Where the scenarios of a story live: a `.feature` under the features folder of a repository. */
const FEATURE = /(^|\/)docs\/features\/.+\.feature$/
/** A test plan names its scenarios' file in a cell of its coverage matrix, as a path or in backticks. */
const CITED = /(?<=^|[\s,`'"(|])([\w.-]+(?:\/[\w.-]+)*\.feature)/g
/** What opens a scenario: its keyword and its title. */
const OPENS = /^\s*(Scenario Outline|Scenario Template|Scenario|Example):\s*(\S.*?)\s*$/
/** A step of a scenario, whatever its keyword. */
const STEP = /^\s*(Given|When|Then|And|But|\*)\s+\S/
/** What opens the examples of an outline. */
const EXAMPLES = /^\s*(Examples|Scenarios):/
/** A row of a table, its cells between pipes. */
const ROW = /^\s*\|(.*)\|\s*$/
/** A placeholder an outline opens, filled from a column of its examples. */
const PLACEHOLDER = /<([^<>]+)>/g
/** A heading of one acceptance criterion, as DISCUSS writes it. */
const CRITERION = /^##\s+AC-\d+\b/m
/** The keywords a scenario says, each needed once. */
const KEYWORDS = Object.freeze(['Given', 'When', 'Then'])
/** An outline fills its placeholders from its examples; another scenario opens none. */
const OUTLINES = Object.freeze(['Scenario Outline', 'Scenario Template'])

/** @param {string} path relative to the working copy */
export const isFeature = (path) => FEATURE.test(path)

/**
 * The `.feature` files a test plan names, each once, back slashes read as separators.
 * @param {string} text @returns {string[]}
 */
export const namedFeatures = (text) => [...new Set([...text.replaceAll('\\', '/').matchAll(CITED)].map(([, path]) => path))]

/**
 * The scenarios a `.feature` holds, with the steps and the example rows of each.
 * @param {string} text @returns {Scenario[]}
 */
export const scenariosOf = (text) => text.split(/\r?\n/).reduce(reading, []).map(({ rows, ...scenario }) => scenario)

/** @param {Array<Scenario & { rows: boolean }>} scenarios @param {string} line */
const reading = (scenarios, line) => {
  const opened = OPENS.exec(line)
  if (opened !== null) return [...scenarios, { kind: opened[1], title: opened[2], steps: [], examples: [], rows: false }]
  const open = scenarios.at(-1)
  if (open === undefined) return scenarios
  if (STEP.test(line)) open.steps.push(line.trim())
  if (EXAMPLES.test(line)) open.rows = true
  if (open.rows && ROW.test(line)) open.examples.push(cellsOf(line))
  return scenarios
}

/** The cells of a table row, trimmed. @param {string} line */
const cellsOf = (line) => /** @type {string[]} */ (ROW.exec(line))[1].split('|').map((cell) => cell.trim())

/**
 * Why the Gherkin of the story sends the acceptance designer back; empty when it holds.
 * @param {Records} records @returns {string[]}
 */
export const gherkinFailures = ({ plans, features, criteria }) => [
  ...plans.flatMap((plan) => missingFeatures(plan, features)),
  ...plans.flatMap((plan) => storyFeatures(plan, features).flatMap(featureFailures)),
  ...criteria.flatMap((file) => coverageFailures(file, plans.flatMap((plan) => storyFeatures(plan, features)))),
]

/** The `.feature` files of the story: those its plan names, as the working copy holds them. @param {Document} plan @param {Document[]} features */
const storyFeatures = ({ text }, features) => features
  .filter(({ path }) => namedFeatures(text).some((named) => path === named || path.endsWith(`/${named}`)))

/**
 * Whether the story has a scenario for each criterion it holds. An outline counts once, however
 * many rows its examples carry: one criterion may be a grid.
 * @param {Document} file @param {Document[]} features @returns {string[]}
 */
const coverageFailures = ({ path, text }, features) => {
  const criteria = text.split(/\r?\n/).filter((line) => CRITERION.test(line)).length
  const scenarios = features.flatMap(({ text: feature }) => scenariosOf(feature)).length
  if (criteria === 0 || scenarios >= criteria) return []
  return [`${path} declares ${criteria} ${criteria === 1 ? 'acceptance criterion' : 'acceptance criteria'}, and ${scenarios === 1 ? '1 scenario is' : `${scenarios} scenarios are`} written for ${criteria === 1 ? 'it' : 'them'} (#524)`]
}

/** Each `.feature` a plan names that the working copy does not hold. @param {Document} plan @param {Document[]} features */
const missingFeatures = ({ path, text }, features) => namedFeatures(text)
  .filter((named) => !features.some(({ path: held }) => held === named || held.endsWith(`/${named}`)))
  .map((named) => `${path} names ${named}, which is no .feature of the working copy (#524)`)

/** @param {Document} feature @returns {string[]} */
const featureFailures = ({ path, text }) => {
  const scenarios = scenariosOf(text)
  return [
    ...scenarios.flatMap((scenario) => stepFailures(path, scenario)),
    ...scenarios.filter((scenario) => OUTLINES.includes(scenario.kind)).flatMap((outline) => exampleFailures(path, outline)),
    ...titleFailures(path, scenarios),
  ]
}

/** The keywords a scenario leaves unsaid, one line each. @param {string} path @param {Scenario} scenario */
const stepFailures = (path, { kind, title, steps }) => KEYWORDS
  .filter((keyword) => !steps.some((step) => step.startsWith(keyword)))
  .map((keyword) => `${path}: ${kind.toLowerCase().startsWith('scenario outline') ? 'outline' : 'scenario'} "${title}" says no ${keyword} (#524)`)

/** The placeholders an outline opens that its examples do not fill. @param {string} path @param {Scenario} outline */
const exampleFailures = (path, { title, steps, examples }) => {
  const opened = [...new Set([title, ...steps].flatMap((line) => [...line.matchAll(PLACEHOLDER)].map(([, name]) => name)))]
  const filled = examples[0] ?? []
  const left = opened.filter((name) => !filled.includes(name))
  if (left.length === 0) return []
  return [`${path}: outline "${title}" leaves ${left.map((name) => `<${name}>`).join(', ')} out of its examples (#524)`]
}

/** A title two scenarios of a file share, named once. @param {string} path @param {Scenario[]} scenarios */
const titleFailures = (path, scenarios) => [...new Set(scenarios.map(({ title }) => title))]
  .filter((title) => scenarios.filter((scenario) => scenario.title === title).length > 1)
  .map((title) => `${path}: two scenarios are titled "${title}" (#524)`)
