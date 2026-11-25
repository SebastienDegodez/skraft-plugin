import { RESULT_SHAPE } from './agent-result.mjs'
import { issueOf } from './commits.mjs'

/**
 * @typedef {{ name: string, root: string, stack: string, mocking: string, contractTesting: boolean, bdd: BddPair[], test: string | null, gates: BriefGate[] }} BriefComponent
 *   gates: the gate commands of the component the agent runs before its result, in the order the
 *   developer lists them, mutation left out. bdd: where its scenarios and their bindings live,
 *   relative to its root; empty when its tests are written without Gherkin.
 * @typedef {import('../config/skraft-config.mjs').BddPair} BddPair
 * @typedef {{ gate: string, line: string | null }} BriefGate
 *   line: the gate's command; null when the component names none, which the agent declares absent.
 * @typedef {{
 *   agent: string, phase: string, slug: string,
 *   story: { issue?: number | null, title?: string | null } | null,
 *   visit: number, attempt: number, maxAttempts: number,
 *   skills: string[], nowhere: import('./component-skills.mjs').ComponentSkill[], inputs: string[], outputs: string[], result: string, scratch: { logs: string, tmp: string },
 *   allowed: string[], components: BriefComponent[], tdd: import('./roles.mjs').TddMode, commits: boolean,
 *   missing: string[], feedback: string[], instruction: string | null, sentBy: 'review' | 'ask' | 'answer' | null,
 *   drafts: string[], language: import('../reporting/language.mjs').Language | null, checklists: string[],
 *   scenario?: BriefScenario | null, policy?: string[],
 * }} Brief
 *   skills (the SKILL.md files of its components the agent reads first), inputs, outputs, result, scratch and missing are absolute paths;
 *   scratch: where the agent sends what its commands print, and keeps its temporary files;
 *   nowhere: the skills its components ask for that neither the plugin nor the working copy provides; allowed is relative to the working
 *   copy; components: those whose paths the agent may write, empty otherwise. tdd: the commits
 *   the agent makes, a whole TDD cycle or failing tests only. commits: whether the agent commits,
 *   told how its commits reference the story's issue. feedback: on a retry, why the
 *   previous attempt was refused; on a new pass, the gate failures, the review findings or the
 *   human's refusal or choice behind it, sentBy naming which; instruction: the human's answer to
 *   a block that opened this pass, told after what the block left. 
 *   drafts: the Proposed ADRs of the working copy, relative to it, told to an agent that keeps
 *   the DESIGN records; empty for any other. language: the story's, for an agent that writes the prose of the
 *   pull request; null for any other. checklists: the absolute paths of the skills whose gates the
 *   review of its phase judges its outputs by, which it checks them against before its result.
 *   scenario: the scenario of the story the pass works on, null for a pass on none; policy: how
 *   the components' tests treat what they depend on, told to the agent that writes the scenarios.
 * @typedef {{
 *   kind: 'plan' | 'delivery' | 'rework', groups: BriefGroup[],
 *   oracles: Array<{ sha: string, subject: string, files: string[] }>, skeleton: boolean, redRun: boolean,
 * }} BriefScenario
 *   plan: the pass that writes every scenario and their one red; delivery: the one pass that
 *   makes every group pass in one green commit; rework: a pass after the story is delivered, which
 *   changes no acceptance test. groups: those a delivery pass makes pass, in the order it commits
 *   them, the green holding all of them; oracles: every red of acceptance tests DISTILL committed, whose files no pass changes;
 *   skeleton: whether the story has a walking skeleton, which passes in that commit; redRun: whether the plan's pass runs its one run of the acceptance
 *   tests through `skraft_design_repl`, labelled `red`, which the review of its phase reads.
 * @typedef {{
 *   index: number, of: number, scenarios: Array<{ index: number, title: string, component: string, tags: string[] }>,
 *   test: string | null,
 * }} BriefGroup
 *   scenarios: the group's, as the test plan lists them; test: the test command of the component
 *   of its first scenario.
 */

/**
 * The prompt a dispatched agent receives, the same on every host.
 * @param {Brief} brief
 */
export const composeBrief = (brief) => [
  ...headerLines(brief),
  ...section('- Skills (read each before you start):', brief.skills),
  ...section(NOWHERE, brief.nowhere.map(({ component, skill }) => `${skill} (${component})`)),
  ...workLines(brief),
  ...scenarioLines(brief),
  ...selfCheckLines(brief),
  ...section(DRAFTS, brief.drafts),
  ...missingLines(brief),
  ...feedbackLines(brief),
].join('\n')

const DRAFTS = '- Proposed ADRs, drafts no human has ratified: rewrite each in place when the feedback or a story asks for a change, keep it Proposed, never supersede it:'

const NOWHERE ='- Skills your components ask for that exist nowhere, in the plugin or the working copy; design-mocking-strategy-roster and design-contract-testing say which recipe to use instead, or to stop:'

/** Who is dispatched, for which story, on which pass and attempt. @param {Brief} brief */
const headerLines = ({ agent, phase, slug, story, visit, attempt, maxAttempts, sentBy, language }) => [
  `## Skraft dispatch: ${agent} (${phase})`,
  `- Story: ${storyLine(story)}`,
  ...(language === null ? [] : [`- Write in ${LANGUAGE_NAMES[language]}, the story's language.`]),
  `- Feature scope: ${slug}`,
  ...(visit > 1 ? [`- Pass: ${visit}${sentBy === null ? '' : `, after ${PASS_CAUSE[sentBy]}`}`] : []),
  `- Attempt: ${attempt} of ${maxAttempts}`,
]

/** What the agent reads, fills and may change, and the commits it makes. @param {Brief} brief */
const workLines = ({ inputs, outputs, result, scratch, allowed, components, tdd, commits, story, sentBy, scenario = null }) => [
  ...section('- Read first:', inputs),
  ...section('- Fill each output in place; keep the path, create no other copy:', outputs),
  `- Write your result as JSON to ${result}: ${RESULT_SHAPE}`,
  `- Send what the commands you run print to files under ${scratch.logs}, and keep your temporary files under ${scratch.tmp}; write no file outside the working copy, the system's temporary folder included.`,
  ...section('- Change nothing outside these paths of the working copy; the engine refuses the step otherwise:', writablePaths(allowed, components)),
  ...section('- Components:', components.map(componentLine)),
  ...(scenario === null || scenario.kind === 'rework' ? commitLines(tdd, sentBy, scenario !== null) : []),
  ...(commits ? [COMMIT_EVERY_CHANGE, issueLine(story)] : []),
]

/**
 * The scenarios the pass works on and the commits it makes for them, their messages exact.
 * @param {Brief} brief
 */
const scenarioLines = ({ scenario = null, slug, story, policy }) => {
  if (scenario === null) return []
  const issue = issueOf(story)
  return [...SCENARIO_WORK[scenario.kind](scenario), ...SCENARIO_COMMIT[scenario.kind](scenario, { slug, issue }), ...section(POLICY, /** @type {string[]} */ (policy))]
}

const POLICY = '- How the tests of each component treat what the code depends on, in the scenarios\' acceptance tests (targeted) and in the walking skeleton:'

/** @param {BriefGroup['scenarios'][number]} scenario */
const scenarioLine = ({ index, title, component, tags }) => `S${index} "${title}" (component ${component}${tags.length > 0 ? `, tags ${tags.join(' ')}` : ''})`

/** @param {BriefGroup} group */
const groupLine = ({ index, of, scenarios }) => `${index} of ${of} — ${scenarios.map(scenarioLine).join('; ')}`

/** The red commits DISTILL left, whose files no pass changes. @param {BriefScenario['oracles']} oracles */
const redLines = (oracles) => section('- Acceptance tests DISTILL committed, which you never change (a wrong one, or one failing on a build or setup error: stop blocked, naming it):', oracles.map(({ sha, subject, files }) => `${sha.slice(0, 7)} "${subject}": ${files.join(', ')}`))

/** What a pass on the story's scenarios does, by kind of pass. @type {Readonly<Record<BriefScenario['kind'], (scenario: BriefScenario) => string[]>>} */
const SCENARIO_WORK = Object.freeze({
  plan: () => [
    '- Scenarios: write every scenario of the story, then list them in your test plan under a `## Scenarios` heading, as the table',
    '  `| # | Scenario | Component | Tags |`, one row per scenario, S1, S2, …, each in the component where its test lives.',
    '  S1 is the scenario the walking skeleton walks, tagged `@walking-skeleton`, in a back-end component; a story with no new entry point writes instead',
    '  `Walking skeleton exemption: library`, `refactoring` or `docs-only` under the table, and tags no scenario `@walking-skeleton`.',
    '- Groups: in your implementation plan, the table `| Group | Scenarios | Rule | … |`, one row per group DELIVER works, in its order:',
    '  the scenarios one rule of the story makes pass together (`S1, S2` or `S3–S5`), every scenario once, S1 in group 1.',
    '- Write the failing walking skeleton, a plain test with no Gherkin in the integration tests of S1\'s component: it enters by the real entry point,',
    '  crosses the chain the production wiring builds, asserts the response\'s status, its shape and one value S1 names, and no other rule.',
    '- Write the failing acceptance test of every scenario, the binding of its Gherkin entering by its use case, each test\'s name starting with its',
    '  scenario\'s number (`S1_…`, `test_s1_…`); with them, the skeleton of every class they call, each returning an empty value.',
  ],
  delivery: ({ groups, oracles, skeleton }) => [
    ...section('- Groups, in the order you work them; their code and their unit tests go in one green commit (a group whose acceptance tests already pass needs no code: name the scenario whose code makes them pass on the change-log line):', groups.map(groupLine)),
    ...redLines(oracles),
    ...(skeleton ? ['- The walking skeleton passes in that commit, with every acceptance test and the whole suite.'] : []),
    '- Deliver every group in this one pass, in this order, with outside-in TDD, unit tests included, and commit nothing until every acceptance test and the whole suite pass; change another component than the groups\' own only where a group needs it, in the same commit. The pass ends when that one commit is made, or on a blocker.',
  ],
  rework: ({ oracles }) => redLines(oracles),
})

/**
 * The commits a pass makes: the red, never chained to the test command, whose output tells a
 * failing assertion from a build error; the green, once, chained to the tests of every component of the story, in sh or
 * PowerShell 7 and in Windows PowerShell 5.1, which has no `&&`.
 * @type {Readonly<Record<BriefScenario['kind'], (scenario: BriefScenario, story: { slug: string, issue: number | null }) => string[]>>}
 */
const SCENARIO_COMMIT = Object.freeze({
  plan: (_scenario, story) => [`- Run the acceptance tests once through \`skraft_design_repl\`, as \`gate('test', <the component's test command>, { cwd, label: 'red' })\`, and read its output: every acceptance test and the walking skeleton fail, each on its assertion. Then commit them, the skeleton they call and the scenarios in one commit, exactly:`, `  ${commitCommand('test', 'acceptance tests S1–S<n>, n the last scenario of your test plan', story)}`],
  delivery: ({ groups }, story) => [
    '- Commit once, naming each file you changed; in sh or PowerShell 7:', `  ${chained(greenSteps(groups, story))}`,
    '  in Windows PowerShell 5.1:', `  ${chainedIn51(greenSteps(groups, story))}`,
  ],
  rework: () => [],
})

/** The scenarios of every group, as the green's subject names them: `S1`, or `S1–S4`. @param {BriefGroup[]} groups */
const deliveryLabel = (groups) => {
  const numbers = groups.flatMap(({ scenarios }) => scenarios.map(({ index }) => index))
  const [first, last] = [Math.min(...numbers), Math.max(...numbers)]
  return first === last ? `S${first}` : `S${first}–S${last}`
}

/** The test command of each component the groups touch, once. @param {BriefGroup[]} groups */
const testsOf = (groups) => [...new Set(groups.map(({ test }) => test ?? '<the test command>'))]

/** The commands of the green, each run only once the one before passed. @param {BriefGroup[]} groups @param {{ slug: string, issue: number | null }} story */
const greenSteps = (groups, story) => [...testsOf(groups), 'git add <each file you changed>', commitCommand('feat', `${deliveryLabel(groups)} <the rules of the story, as your implementation plan names them>`, story)]

/** Commands chained with `&&`, as sh and PowerShell 7 run them. @param {string[]} steps */
const chained = (steps) => steps.join(' && ')

/** Commands chained on `$?`, as Windows PowerShell 5.1 runs them. @param {string[]} steps */
const chainedIn51 = ([first, ...rest]) => `${first}${rest.map((step) => `; if ($?) { ${step}`).join('')}${' }'.repeat(rest.length)}`

/**
 * The exact `git commit` of the red or of the green: the story's issue as the last line of
 * the body.
 * @param {string} type @param {string} text @param {{ slug: string, issue: number | null }} story
 */
const commitCommand = (type, text, { slug, issue }) => `git commit -s -m "${type}(${slug}): ${text}"${issue === null ? '' : ` -m "Refs: #${issue}"`}`

/** What the agent checks its work against before it writes its result. @param {Brief} brief */
const selfCheckLines = ({ tdd, components, checklists }) => [
  ...gateLines(tdd, components),
  ...checklists.map((path) => `- Before you write your result, check your outputs against every gate of ${path}, the gates the review of your phase judges them by, and fix each one they fail.`),
]

const COMMIT_EVERY_CHANGE = '- Commit every file you change outside the tracking folder before you write your result, as `type(<story>): subject` (`docs(<story>): …` for a document); the engine refuses a change left uncommitted.'

/** How an agent's commits reference the story's issue. @param {Brief['story']} story */
const issueLine = (story) => {
  const issue = issueOf(story)
  return issue === null ? '- Reference no issue in a commit.' : `- End every commit body with \`Refs: #${issue}\`; never close the issue in a commit: the pull request closes it.`
}

/**
 * The commits the agent makes; once the story is delivered, each cycle in one green holding its
 * test; on a TDD pass the review opened, the commit each kind of finding takes, since no failing
 * gate stands for the test of a fix.
 * @param {Brief['tdd']} tdd @param {Brief['sentBy']} sentBy @param {boolean} delivered
 */
const commitLines = (tdd, sentBy, delivered) => {
  if (tdd === null) return []
  if (tdd !== 'cycle') return [TDD_RULES[tdd]]
  const rules = delivered ? DELIVERED_COMMITS : CYCLE_COMMITS
  return sentBy === 'review' ? [rules.cycle, rules.review] : [rules.cycle]
}

/** @param {string[]} allowed @param {BriefComponent[]} components */
const writablePaths = (allowed, components) => [
  ...allowed,
  ...components.map(({ name, root }) => `${root}/* (the files right in the root of ${name})`),
]

/** @param {BriefComponent} component */
const componentLine = ({ name, root, stack, mocking, contractTesting, bdd, test }) => `${name}: ${root} (${stack}), mocking: ${mocking}, contract testing: ${contractTesting ? 'on' : 'off'}, bdd: ${bddLine(bdd)}${test ? `, tests: ${test}` : ''}`

/**
 * Where the component's scenarios go, as the agent that writes them reads it: the folder of each
 * pair and what binds it, so no agent has to guess a folder the engine already knows.
 * @param {BddPair[]} pairs
 */
const bddLine = (pairs) => (pairs.length === 0 ? 'off' : pairs.map(({ features, steps }) => (steps === null ? features : `${features} → ${steps}`)).join(', '))

/** The commits whose gates the agent runs through the REPL, which the DELIVER review reads: a TDD cycle's. */
const GATED = Object.freeze(['cycle'])

const GATES_TITLE = '- Gate commands: run those of each component you changed, from its root, through skraft_design_repl, and fix every failure; the DELIVER review reads the traced runs of your attempt:'

/**
 * The gate commands an agent that delivers runs through the REPL, by component.
 * @param {Brief['tdd']} tdd @param {BriefComponent[]} components
 */
const gateLines = (tdd, components) => (GATED.includes(/** @type {string} */ (tdd)) ? [...section(GATES_TITLE, components.flatMap(gatesLine)), ...evidenceLine(tdd)] : [])

/** What the engine requires of the runs of an attempt that delivers: for `cycle` only. @param {Brief['tdd']} tdd */
const evidenceLine = (tdd) => (tdd === 'cycle' ? [EVIDENCE] : [])

const EVIDENCE = "- Evidence: before the commit line, run the gates of each component you changed in one `skraft_design_repl` cell, with `gate(name, command, { cwd: <the component's root> })`, in this order: `build`, `format`, `lint`, `architecture`, `await` each before the next, never in parallel, and for a gate whose line above says `no command`, its `absent(…)` call as that line gives it, never a skipped gate; the last of these cells ends with the commit line, `run(line, { gate: 'test', label: 'green' })`, the run of `test` that commits. Fix every gate failure before the commit line, then run the cell again; no `style` commit. Then, on that commit and a clean tree, run `coverage`, or its `absent(…)` call, and `e2e` last when listed. The DELIVER review reports a gate of a component you changed with no passing traced run for that commit, unless you declared it with `absent(gate, component, reason)`; `test` is never absent. Await or kill every run before your result."

/** One line per gate of a component: its command, or the exact call that declares it absent. @param {BriefComponent} component */
const gatesLine = ({ name, gates }) => gates.map(({ gate, line }) => `${name}: ${gate}: ${line ?? absentCall(gate, name)}`)

/** @param {string} gate @param {string} component kebab-case, as the configuration checks it */
const absentCall = (gate, component) => `no command → absent('${gate}', '${component}', 'no command in skraft-design-config.json')`

/** The outputs the previous attempt left empty, or the pass a human reopened. @param {Brief} brief */
const missingLines = ({ missing, attempt, maxAttempts, visit }) => (missing.length > 0
  ? ['', `Missing outputs from ${attempt > 1 ? `attempt ${attempt - 1} of ${maxAttempts}` : `pass ${visit - 1}`}:`, ...missing.map((path) => `- ${path}`)]
  : [])

/**
 * Why the previous attempt was refused, or why the review or a human sent the work back. A pass a human
 * reopened after a block carries what the block left, then the human's instruction.
 * @param {Brief} brief
 */
const feedbackLines = (brief) => {
  if (brief.instruction !== null) return reopenedLines(brief, brief.instruction)
  if (brief.feedback.length === 0) return []
  return ['', feedbackTitle(brief), ...brief.feedback.map((line) => `- ${line}`), ...citedFilesLines(brief)]
}

/** Where a review finding holds, as the engine writes it: `<lens> <id> <gate> <severity> at <path>:<line>: …`. */
const FINDING_AT = /^\S+ \S+ \S+ \S+ at ([^\s:]+):\d+:/

/**
 * A pass the review sends back reads again and changes the files its findings cite, once each in
 * the order they come, and no other unless a fix needs it: it does not reread the whole corpus (#662).
 * @param {Pick<Brief, 'feedback' | 'sentBy'>} brief
 */
const citedFilesLines = ({ feedback, sentBy }) => {
  const files = [...new Set(feedback.map((line) => FINDING_AT.exec(line)?.[1]).filter((path) => path !== undefined))]
  return sentBy === 'review' && files.length > 0 ? ['', `Files the findings cite, the only ones this pass reads again and changes unless a fix needs another: ${files.join(', ')}`] : []
}

/**
 * What a block left, when it left something, and the instruction a human lifted it with. A
 * block can leave nothing: a loop stopped at its max_visits by an edge out of a step that refused
 * nothing (an agent's single edge, a gate's PASS, a consent's answer) carries no failures, and the
 * pass it reopens is told the instruction alone (#500).
 * Answers to the open questions a pass left come one per line, under their own title (#662).
 * @param {Pick<Brief, 'feedback' | 'visit' | 'sentBy'>} brief @param {string} instruction
 */
const reopenedLines = ({ feedback, visit, sentBy }, instruction) => [
  ...(feedback.length > 0 ? ['', `What pass ${visit - 1} left when it was blocked:`, ...feedback.map((line) => `- ${line}`)] : []),
  '', sentBy === 'answer' ? `A human answered the open questions pass ${visit - 1} left; apply each answer:` : `A human refused the work of pass ${visit - 1}:`,
  ...instruction.split('\n').map((line) => `- ${line}`),
]

/** @param {Pick<Brief, 'attempt' | 'maxAttempts' | 'visit' | 'sentBy'>} brief */
const feedbackTitle = ({ attempt, maxAttempts, visit, sentBy }) => {
  if (attempt > 1) return `Refused in attempt ${attempt - 1} of ${maxAttempts}:`
  if (sentBy === 'review') return `The review sent the work back on pass ${visit - 1}, with these findings:`
  if (sentBy === 'answer') return 'A human chose how to go on:'
  return sentBy === 'ask' ? `A human refused the work of pass ${visit - 1}:` : `A human chose how to go on after pass ${visit - 1}:`
}

/** A language as the brief names it. */
const LANGUAGE_NAMES = Object.freeze({ en: 'English', fr: 'French' })

/** What sent the work back into a new pass, by the kind of node that did. */
const PASS_CAUSE = Object.freeze({ review: 'the review sent the work back', ask: 'a human sent the work back', answer: 'a human chose how to go on' })

const TDD_RULES = Object.freeze({
  cycle: [
    '- Commit each TDD cycle: `test(<story>): …` with the failing test, then `feat(<story>): …` or `fix(<story>): …` with the code that makes it pass,',
    '  then `refactor(<story>): …` if needed. Tests that pass from the start (coverage) go with the code they cover, or in a `refactor` commit;',
    '  lint and format fixes in a `style` commit. The engine refuses a feat or fix commit with no test commit since the last feat or fix',
    '  and any commit that is not `type(scope): subject`. A refused commit stays refused until you rewrite it.',
  ].join('\n'),
  red: [
    '- Commit the failing acceptance tests as `test(<story>): …`, with the skeleton they call: the use cases the event model names, each answering',
    '  the empty value of its type, no behaviour; a test failing on a missing module proves nothing. The engine refuses any commit that is not `type(scope): subject`;',
    '  a refused commit stays refused until you rewrite it.',
  ].join('\n'),
})

const REVIEW_COMMITS = [
  '- This pass answers the review: a missing or wrong behaviour takes a failing `test(<story>): …` commit, then `fix(<story>): …`;',
  '  a test that proves too little, a name, or any change the tests already pass with takes `refactor(<story>): …`.',
].join('\n')

/** The commits of a TDD pass on no scenario: a red, then its green. */
const CYCLE_COMMITS = Object.freeze({ cycle: TDD_RULES.cycle, review: REVIEW_COMMITS })

/** The commits of a pass after the story is delivered: each cycle one green holding its test. */
const DELIVERED_COMMITS = Object.freeze({
  cycle: [
    '- Commit each TDD cycle once green, in one `feat(<story>): …` or `fix(<story>): …` commit holding its test and the code that makes it pass; never a `test` commit of its own.',
    '  A change under green takes `refactor(<story>): …`, lint and format fixes `style(<story>): …`. The engine refuses a `test` commit, a feat or fix commit',
    '  that holds no test, a change to an acceptance test,',
    '  and any commit that is not `type(scope): subject`. A refused commit stays refused until you rewrite it.',
  ].join('\n'),
  review: [
    '- This pass answers the review: a missing or wrong behaviour takes one `fix(<story>): …` commit holding its failing test and the code that makes it pass, once green;',
    '  a test that proves too little, a name, or any change the tests already pass with takes `refactor(<story>): …`.',
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
