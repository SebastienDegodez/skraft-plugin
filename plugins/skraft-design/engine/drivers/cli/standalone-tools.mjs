const LOCAL = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
const WORKSPACE = { kind: 'string', description: 'Absolute path of the project Git root; keep the same workspace throughout this run.' }
const parameter = (kind, description) => ({ kind, description })
const tool = (operation, description, parameters = {}, required = []) => ({
  name: `skraft_design_${operation}`, title: `Design: ${operation}`, description,
  parameters: { ...parameters, workspace: WORKSPACE }, required: ['workspace', ...required],
  annotations: LOCAL, argv: (args) => [operation, JSON.stringify(args)],
})

export const STANDALONE_TOOLS = [
  tool('start', 'Start or resume architecture design for exactly one issue or epic. No story delivery or product test execution.',
    { issue: parameter('count', 'Story issue number.'), epic: parameter('count', 'Epic or Feature number.') }),
  tool('next', 'Advance this design run. Dispatch only the returned agents with their exact prompts; save each final reply unchanged, then call record. Never dispatch from a worker.'),
  tool('record', 'Consume saved worker replies and advance the same run.'),
  tool('status', 'Read the active run and its exact pending question.'),
  tool('answer', 'Relay a native ask_user or askQuestions reply to the exact pending question. Missing or dismissed native dialog: leave paused, record nothing. Never invent human approval.',
    { key: parameter('string', 'Pending question key.'), answer: parameter('text', 'Exact human reply.'), reason: parameter('text', 'Human refusal reason.'),
      by: parameter('text', 'host-llm only for an unforeseen incident; omit for human replies.'), model: parameter('text', 'Observed model, metadata only.'), cost: parameter('number', 'Observed judgment cost.'), costUnit: parameter('text', 'Observed cost unit.') }, ['key', 'answer']),
  tool('setup', 'Detect components without overwriting existing commands. Set optional publication consents only after asking the exact engine consent text through native chat.',
    { pullRequest: parameter('boolean', 'Human consent to push, publish PR and keep issue comments.'), visuals: parameter('boolean', 'Human consent to publish screenshots and videos.'), bdd: parameter('boolean', 'Human choice of whether components use Gherkin.') }),
  tool('precheck', 'Check the current worker attempt without approving it or starting any agent.'),
  tool('report', 'Read run time, cost and retries.'),
]
