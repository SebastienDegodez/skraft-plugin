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
    { issue: parameter('count', 'Story issue number.'), epic: parameter('count', 'Epic or Feature number.'),
      mode: parameter('string', 'interactive (default) when a developer runs it, ci when a CI workflow does: a CI run waiting on a person publishes its draft pull request.') }),
  tool('next', 'Advance this design run. Dispatch only the returned agents with their exact prompts; save each final reply unchanged, then call record. Never dispatch from a worker.'),
  tool('record', 'Consume saved worker replies and advance the same run.'),
  tool('status', 'Read the active run and its exact pending question.'),
  tool('draft', 'Open or update a draft PR only when the engine permits a human-blocked architecture decision.'),
  tool('answer', 'Relay an exact human reply after native chat or CI validation to the pending question. Never accept or interpret a raw PR comment.',
    { key: parameter('string', 'Pending question key.'), answer: parameter('text', 'Exact human reply; for architecture-questions, one JSON object mapping each question id to the chosen option id or the person\'s words.'), reason: parameter('text', 'Human refusal reason.'),
      by: parameter('text', 'host-llm only for an unforeseen incident; omit for human replies.'), model: parameter('text', 'Observed model, metadata only.'), cost: parameter('number', 'Observed judgment cost.'), costUnit: parameter('text', 'Observed cost unit.') }, ['key', 'answer']),
  tool('setup', 'Return the publication consent question this repository has not answered; with pullRequest, keep the human answer in the developer\'s own ~/.skraft-design/config.json for this repository. Writes nothing in the working copy. Ask the exact engine consent text through native chat first.',
    { pullRequest: parameter('boolean', 'Human consent to push, publish the architecture PR and keep issue comments on this repository.') }),
  tool('precheck', 'Check the current worker attempt without approving it or starting any agent.'),
  tool('report', 'Read run time, cost and retries.'),
]

/** No agent of a design run runs the project's commands: the REPL tools are not offered. */
export const STANDALONE_REPL = false
