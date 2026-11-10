import { RESULT_SHAPE } from './agent-result.mjs'
import { issueOf } from './commits.mjs'

/**
 * @typedef {{ name: string, root: string, stack: string, mocking: string, contractTesting: boolean, bdd: BddPair[], test: string | null, gates: BriefGate[] }} BriefComponent
 *   gates: the gate commands of the component the agent runs before its result, in the order the
 *   gates step runs them, mutation left out. bdd: where its scenarios and their bindings live,
 *   relative to its root; empty when its tests are written without Gherkin.
 * @typedef {import('../config/skraft-config.mjs').BddPair} BddPair
 * @typedef {{ gate: string, line: string }} BriefGate
 * @typedef {{
 *   agent: string, phase: string, slug: string,
 *   story: { issue?: number | null, title?: string | null } | null,
 *   visit: number, attempt: number, maxAttempts: number,
 *   skills: string[], nowhere: import('./component-skills.mjs').ComponentSkill[], inputs: string[], outputs: string[], result: string, scratch: { logs: string, tmp: string },
 *   allowed: string[], components: BriefComponent[], tdd: import('./roles.mjs').TddMode, commits: boolean,
 *   missing: string[], feedback: string[], instruction: string | null, sentBy: 'gate' | 'review' | 'ask' | 'answer' | null, acceptance: string[],
 *   mutants: { file: string, mutants: string[], group: number, of: number } | null,
 *   drafts: string[], proposal: boolean, language: import('../reporting/language.mjs').Language | null, checklists: string[],
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
 *   a block that opened this pass, told after what the block left. acceptance: the failing acceptance tests an
 *   earlier agent committed (`<sha> "<subject>"`), told to a TDD cycle so that it opens with a
 *   test of its own. mutants: the group of surviving mutants the agent kills, one file's.
 *   drafts: the Proposed ADRs of the working copy, relative to it, told to an agent that keeps
 *   the DESIGN records; empty for any other. proposal: the agent proposes how to treat its
 *   mutants and changes no code. language: the story's, for an agent that writes the prose of the
 *   pull request; null for any other. checklists: the absolute paths of the skills whose gates the
 *   review of its phase judges its outputs by, which it checks them against before its result.
 *   scenario: the scenario of the story the pass works on, null for a pass on none; policy: how
 *   the components' tests treat what they depend on, told to the agent that writes the scenarios.
 * @typedef {{
 *   kind: 'plan' | 'oracle' | 'delivery', index: number, of: number, title: string | null, component: string | null, tags: string[],
 *   oracles: Array<{ sha: string, subject: string, files: string[] }>, test: string | null,
 * }} BriefScenario
 *   test is null only on the pass that writes the plan, whose scenarios are not listed yet.
 *   title, component and tags: as the test plan lists the scenario, null on the pass that writes
 *   the plan; oracles: the reds of the acceptance tests the delivery pass may not change; test:
 *   the scenario component's test command.
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
  ...mutantLines(brief),
  ...missingLines(brief),
  ...feedbackLines(brief),
].join('\n')

const DRAFTS = '- Proposed ADRs, drafts no human has ratified: rewrite each in place when the feedback or a story asks for a change, keep it Proposed, never supersede it:'

const NOWHERE ='- Skills your components ask for that exist nowhere, in the plugin or the working copy; mocking-strategy-roster and contract-testing say which recipe to use instead, or to stop:'

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
const workLines = ({ inputs, outputs, result, scratch, allowed, components, tdd, commits, story, sentBy, acceptance, proposal, scenario = null }) => [
  ...section('- Read first:', inputs),
  ...section('- Fill each output in place; keep the path, create no other copy:', outputs),
  `- Write your result as JSON to ${result}: ${RESULT_SHAPE}`,
  `- Send what the commands you run print to files under ${scratch.logs}, and keep your temporary files under ${scratch.tmp}; write no file outside the working copy, the system's temporary folder included.`,
  ...section('- Change nothing outside these paths of the working copy; the engine refuses the step otherwise:', writablePaths(allowed, components)),
  ...section('- Components:', components.map(componentLine)),
  ...(scenario === null ? commitLines(tdd, sentBy) : []),
  ...(proposal ? [PROPOSAL_RULES] : []),
  ...(commits ? [COMMIT_EVERY_CHANGE, issueLine(story)] : []),
  ...(scenario === null ? acceptanceLines(tdd, acceptance) : []),
]

/**
 * The scenario the pass works on and the one commit it makes for it, its message exact.
 * @param {Brief} brief
 */
const scenarioLines = ({ scenario = null, slug, story, policy }) => {
  if (scenario === null) return []
  const message = commitCommand(scenario, { slug, issue: issueOf(story) })
  return [...SCENARIO_WORK[scenario.kind](scenario), ...SCENARIO_COMMIT[scenario.kind](scenario, message), ...section(POLICY, /** @type {string[]} */ (policy))]
}

const POLICY = '- How the tests of each component treat what the code depends on, in the targeted scenarios and in the walking skeleton S1:'

/** @param {BriefScenario} scenario */
const scenarioHeading = ({ index, of, title, component, tags }) => `- Scenario: ${index} of ${of} — "${title}" (component ${component}${tags.length > 0 ? `, tags ${tags.join(' ')}` : ''})`

/** What a pass on a scenario does, by kind of pass. @type {Readonly<Record<BriefScenario['kind'], (scenario: BriefScenario) => string[]>>} */
const SCENARIO_WORK = Object.freeze({
  plan: () => [
    '- Scenarios: write every scenario of the story, then list them in your test plan under a `## Scenarios` heading, as the table',
    '  `| # | Scenario | Component | Tags |`, one row per scenario, S1, S2, … in the order DELIVER builds them, each in the component where its test lives.',
    '  S1 is the walking skeleton, tagged `@walking-skeleton`, in a back-end component; a story with no new entry point writes instead',
    '  `Walking skeleton exemption: library`, `refactoring` or `docs-only` under the table, and tags no scenario `@walking-skeleton`.',
    '- Write the failing acceptance test of S1 only, with the skeleton it calls; write no test for a later scenario and never skip one:',
    '  each next scenario gets its own pass once the one before passes.',
  ],
  oracle: (scenario) => [
    scenarioHeading(scenario),
    '- Write the failing acceptance test of this scenario only, beside the earlier ones, and extend the skeleton it calls; change no test of an earlier scenario,',
    '  write none for a later one, never skip one.',
  ],
  delivery: (scenario) => [
    scenarioHeading(scenario),
    ...section('- Acceptance tests DISTILL committed, which you never change (a wrong one: stop blocked, naming it):', scenario.oracles.map(({ sha, subject, files }) => `${sha.slice(0, 7)} "${subject}": ${files.join(', ')}`)),
    `- Make it pass with outside-in TDD, unit tests included, and commit nothing until it passes; change no file of another component than ${scenario.component}.`,
  ],
})

/**
 * The one commit a pass on a scenario makes: the red, never chained to the test command, whose
 * output tells a failing assertion from a build error; the green, chained in bash to it.
 * @type {Readonly<Record<BriefScenario['kind'], (scenario: BriefScenario, message: string) => string[]>>}
 */
const SCENARIO_COMMIT = Object.freeze({
  plan: (_, message) => ['- Run the test once and read its output: it fails on an assertion. Then commit the test, the skeleton and the scenarios in one commit, exactly:', `  ${message}`],
  oracle: (_, message) => ['- Run the test once and read its output: it fails on an assertion. Then commit the test and the skeleton in one commit, exactly:', `  ${message}`],
  delivery: ({ test }, message) => ['- Once it passes, commit once, in bash (never PowerShell), naming each file you changed:', `  ${test} && git add <each file you changed> && ${message}`],
})

/** The subject's longest length, as the commit convention keeps it. */
const SUBJECT_LENGTH = 72

/**
 * The exact `git commit` of the scenario's red or green: the scenario's title as subject, the
 * story's issue as the last line of the body.
 * @param {BriefScenario} scenario @param {{ slug: string, issue: number | null }} story
 */
const commitCommand = ({ kind, title }, { slug, issue }) => {
  const type = kind === 'delivery' ? 'feat' : 'test'
  const subject = `${type}(${slug}): ${title === null ? '<the title of S1, as your test plan writes it>' : subjectOf(title, SUBJECT_LENGTH - type.length - slug.length - 4)}`
  return `git commit -s -m "${subject}"${issue === null ? '' : ` -m "Refs: #${issue}"`}`
}

/**
 * A title as a commit subject takes it: no character a shell reads inside double quotes, the first
 * letter lower case, cut on a word to fit.
 * @param {string} title @param {number} room
 */
const subjectOf = (title, room) => {
  const plain = title.replace(/["$`\\]/g, '').replace(/\s+/g, ' ').trim()
  const lower = `${plain.charAt(0).toLowerCase()}${plain.slice(1)}`
  return lower.length <= room ? lower : lower.slice(0, room).replace(/\s\S*$/, '')
}

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
 * The commits the agent makes; on a TDD pass the review opened, the commit each kind of finding
 * takes, since no failing gate stands for the red of a fix.
 * @param {Brief['tdd']} tdd @param {Brief['sentBy']} sentBy
 */
const commitLines = (tdd, sentBy) => {
  if (tdd === null) return []
  return tdd === 'cycle' && sentBy === 'review' ? [TDD_RULES.cycle, REVIEW_COMMITS] : [TDD_RULES[tdd]]
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

/** The commits whose code the gates step runs its commands on next: a TDD cycle's, a mutant killer's. */
const GATED = Object.freeze(['cycle', 'kill'])

const GATES_TITLE = '- Gate commands: before you write your result, run those of each component you changed, from its root, and fix every failure; the gates step runs them next and sends a failure back as a new pass:'

/**
 * The gate commands an agent whose code the gates step judges next runs first, by component.
 * @param {Brief['tdd']} tdd @param {BriefComponent[]} components
 */
const gateLines = (tdd, components) => (GATED.includes(/** @type {string} */ (tdd)) ? section(GATES_TITLE, components.flatMap(gatesLine)) : [])

/** @param {BriefComponent} component */
const gatesLine = ({ name, gates }) => (gates.length === 0 ? [] : [`${name}: ${gates.map(({ gate, line }) => `${gate}: ${line}`).join('; ')}`])

/** The surviving mutants of the file the agent kills, or proposes how to treat. @param {Brief} brief */
const mutantLines = ({ mutants, proposal }) => (mutants === null
  ? []
  : ['', `${proposal ? 'Propose how to treat' : 'Kill'} the surviving mutants of ${mutants.file} (group ${mutants.group} of ${mutants.of}):`, ...mutants.mutants.map((line) => `- ${line}`)])

const PROPOSAL_RULES = [
  '- Propose, change nothing: for each mutant of your output, replace its `outcome` line with one of `test: …`, `delete: …`, `equivalent: …`;',
  '  change no file outside the tracking folder and make no commit. The developer chooses from your proposal; another step applies it.',
].join('\n')

/** The outputs the previous attempt left empty. @param {Brief} brief */
const missingLines = ({ missing, attempt, maxAttempts }) => (missing.length > 0
  ? ['', `Missing outputs from attempt ${attempt - 1} of ${maxAttempts}:`, ...missing.map((path) => `- ${path}`)]
  : [])

/**
 * Why the previous attempt was refused, or why the gates sent the work back. A pass a human
 * reopened after a block carries what the block left, then the human's instruction.
 * @param {Brief} brief
 */
const feedbackLines = (brief) => {
  if (brief.instruction !== null) return reopenedLines(brief, brief.instruction)
  if (brief.feedback.length === 0) return []
  return ['', feedbackTitle(brief), ...brief.feedback.map((line) => `- ${line}`)]
}

/**
 * What a block left, when it left something, and the instruction a human lifted it with. A
 * block can leave nothing: a loop stopped at its max_visits by an edge out of a step that refused
 * nothing (an agent's single edge, a gate's PASS, a consent's answer) carries no failures, and the
 * pass it reopens is told the instruction alone (#500).
 * @param {Pick<Brief, 'feedback' | 'visit'>} brief @param {string} instruction
 */
const reopenedLines = ({ feedback, visit }, instruction) => [
  ...(feedback.length > 0 ? ['', `What pass ${visit - 1} left when it was blocked:`, ...feedback.map((line) => `- ${line}`)] : []),
  '', `A human refused the work of pass ${visit - 1}:`, `- ${instruction}`,
]

/** @param {Pick<Brief, 'attempt' | 'maxAttempts' | 'visit' | 'sentBy'>} brief */
const feedbackTitle = ({ attempt, maxAttempts, visit, sentBy }) => {
  if (attempt > 1) return `Refused in attempt ${attempt - 1} of ${maxAttempts}:`
  if (sentBy === 'review') return `The review sent the work back on pass ${visit - 1}, with these findings:`
  if (sentBy === 'answer') return 'A human chose how to go on:'
  return sentBy === 'ask' ? `A human refused the work of pass ${visit - 1}:` : `The gates failed on pass ${visit - 1}:`
}

/** A language as the brief names it. */
const LANGUAGE_NAMES = Object.freeze({ en: 'English', fr: 'French' })

/** What sent the work back into a new pass, by the kind of node that did. */
const PASS_CAUSE = Object.freeze({ gate: 'the gates sent the work back', review: 'the review sent the work back', ask: 'a human sent the work back', answer: 'a human chose how to go on' })

const E2E_COMMITS = '  A test commit whose only failing tests are e2e tests holds all of them, or a failing unit test too; otherwise they go in the feat or fix that makes them pass.'

const TDD_RULES = Object.freeze({
  cycle: [
    '- Commit each TDD cycle: `test(<story>): …` with the failing test, then `feat(<story>): …` or `fix(<story>): …` with the code that makes it pass,',
    '  then `refactor(<story>): …` if needed. Tests that pass from the start (coverage) go with the code they cover, or in a `refactor` commit;',
    '  lint and format fixes in a `style` commit. The engine refuses a feat or fix commit with no test commit since the last feat or fix',
    '  (on a pass the gates sent back, their failure counts as that test),',
    '  and any commit that is not `type(scope): subject`. A refused commit stays refused until you rewrite it.',
    E2E_COMMITS,
  ].join('\n'),
  red: [
    '- Commit the failing acceptance tests as `test(<story>): …`, with the skeleton they call: the use cases the event model names, each answering',
    '  the empty value of its type, no behaviour; a test failing on a missing module proves nothing. The engine runs the tests at every test commit and refuses one whose tests pass,',
    '  and any commit that is not `type(scope): subject`. A refused commit stays refused until you rewrite it.',
    E2E_COMMITS,
  ].join('\n'),
  kill: [
    '- Kill each mutant with a `test(<story>): …` commit whose test passes on the code as it is.',
    '  Delete code that no behaviour asks for in a `refactor(<story>): …` commit. A bug a new test reveals takes that failing `test` commit, then `fix(<story>): …`.',
    '  A mutant no test can tell apart from the code: change nothing for it; name it in your result summary, `<file>:<line>` and why.',
    '  A commit that is not `type(scope): subject` is refused until you rewrite it.',
  ].join('\n'),
})

/**
 * The acceptance tests an earlier agent committed red: a TDD cycle opens with a failing test of
 * its own, never a feat counting on them.
 * @param {Brief['tdd']} tdd @param {string[]} acceptance
 */
const acceptanceLines = (tdd, acceptance) => (tdd === 'cycle' && acceptance.length > 0 ? [
  '- The acceptance tests DISTILL committed stay red until your code passes them; they are not the test of your first cycle:',
  `  your first commit is a failing \`test(<story>): …\` of the inner loop, never a \`feat\`. DISTILL's: ${acceptance.join(', ')}`,
] : [])

const REVIEW_COMMITS = [
  '- This pass answers the review: a missing or wrong behaviour takes a failing `test(<story>): …` commit, then `fix(<story>): …`;',
  '  a test that proves too little, a name, or any change the tests already pass with takes `refactor(<story>): …`.',
].join('\n')

/** @param {string} title @param {string[]} lines */
const section = (title, lines) => (lines.length > 0 ? [title, ...lines.map((line) => `- ${line}`)] : [])

/** @param {{ issue?: number | null, title?: string | null } | null} story */
export const storyLine = (story) => {
  const parts = [story?.issue ? `#${story.issue}` : null, story?.title || null].filter(Boolean)
  return parts.length > 0 ? parts.join(' — ') : 'none'
}

/**
 * Stable across a resume: a host that memoises dispatches by label finds it again.
 * @param {{ slug: string, step: string, visit: number, attempt: number, group?: { index: number, of: number, each?: string | null } | null }} dispatch
 */
export const dispatchLabel = ({ slug, step, visit, attempt, group = null }) => `skraft ${slug} · ${step}${visit > 1 ? ` · pass ${visit}` : ''}${group === null ? '' : ` · ${group.each === 'scenario' ? 'scenario' : 'group'} ${group.index} of ${group.of}`} · attempt ${attempt}`
