/**
 * The prompts the MCP server offers: a person picks one, the host hands its messages to the model,
 * which then calls the tools they name.
 *
 * @typedef {{ name: string, description: string, required: boolean }} PromptArgument
 * @typedef {{ name: string, title: string, description: string, arguments: PromptArgument[], text: (args: Record<string, string>) => string, loop?: boolean }} SkraftPrompt
 *   loop: the prompt conducts the agent loop, offered only where its tools are.
 */

/** How the model conducts the loop once a tool answered with dispatches. */
const LOOP = [
  'Act on the status of each answer, and only on it:',
  '- dispatch, or refused with the code not-recorded: start each listed agent as a subagent, one after the other, with exactly its prompt, on its model when the subagent tool takes one; write its final message unchanged to its reply file; then do what then says.',
  '- waiting: show the person the question and how to answer it, and stop; they answer with skraft decide in their own terminal. When they say it is answered, call skraft_next.',
  '- done, blocked or any other refused: relay the status, the code and the reason, and stop.',
  'Never write a file under .copilot-tracking/ other than a reply file the current answer lists.',
].join('\n')

/** @param {string} name @param {string} description @returns {PromptArgument} */
const required = (name, description) => ({ name, description, required: true })

/** @param {string} name @param {string} description @returns {PromptArgument} */
const optional = (name, description) => ({ name, description, required: false })

/** The start request as the model passes it. @param {Record<string, string>} args */
const startArguments = ({ slug, issue }) => JSON.stringify(issue === undefined ? { slug } : { slug, issue: Number(issue) })

/** @type {readonly SkraftPrompt[]} */
export const PROMPTS = Object.freeze([
  {
    name: 'init', title: 'Set skraft up', arguments: [],
    description: 'Settle skraft-config.json with the person, once, so that a run asks nothing.',
    text: () => 'Call skraft_doctor. Then follow the skraft-init skill: it detects the components with skraft_init, settles the base branch, the gate commands, the publication consents, BDD per component and the models with me, and ends with skraft_doctor.',
  },
  {
    name: 'run', title: 'Run a story',
    description: 'Start or resume the pipeline of one refined story, and conduct it.',
    arguments: [required('slug', 'the kebab-case scope of the story'), optional('issue', 'the issue number of the story')],
    text: (args) => `Call skraft_start with ${startArguments(args)}, then skraft_next.\n${LOOP}`, loop: true,
  },
  {
    name: 'status', title: 'Where the pipeline stands', arguments: [],
    description: 'The state, time and cost of the active pipeline.',
    text: () => 'Call skraft_status and skraft_report, then tell me in a few lines where the pipeline stands, what it waits on and what it cost.',
  },
  {
    name: 'review', title: 'Review a pull request',
    description: 'Review one pull request with the review workflow, and conduct it.',
    arguments: [required('pr', 'the pull request number')],
    text: ({ pr }) => `Call skraft_review with ${JSON.stringify({ pr: Number(pr) })}.\n${LOOP}`, loop: true,
  },
])

/** The prompts a host is offered: those of the agent loop only where its tools are. @param {boolean} loop */
export const offeredPrompts = (loop) => PROMPTS.filter((each) => loop || each.loop !== true)

/** The prompt as `prompts/list` shows it. @param {SkraftPrompt} prompt */
export const promptListing = ({ name, title, description, arguments: listed }) => ({ name, title, description, arguments: listed })

/** Argument values the prompts accept: a kebab-case slug, a positive whole number. */
const VALUES = Object.freeze({ slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, issue: /^[1-9]\d*$/, pr: /^[1-9]\d*$/ })

/**
 * Why the prompt refuses these arguments; null when it takes them.
 * @param {SkraftPrompt} prompt @param {unknown} args @returns {string | null}
 */
export const promptRefusalOf = (prompt, args) => {
  const given = /** @type {Record<string, unknown>} */ (typeof args === 'object' && args !== null ? args : {})
  const names = prompt.arguments.map(({ name }) => name)
  if (Object.keys(given).some((key) => !names.includes(key))) return `the prompt ${prompt.name} takes only these arguments: ${names.join(', ') || 'none'}`
  const missing = prompt.arguments.find((argument) => argument.required && given[argument.name] === undefined)
  if (missing !== undefined) return `the prompt ${prompt.name} needs the argument ${missing.name}`
  const wrong = names.find((name) => given[name] !== undefined && !VALUES[/** @type {keyof typeof VALUES} */ (name)].test(String(given[name])))
  return wrong === undefined ? null : `the argument ${wrong} of the prompt ${prompt.name} is malformed`
}

/** The messages of the prompt. @param {SkraftPrompt} prompt @param {Record<string, string>} args */
export const promptMessages = (prompt, args) => ({
  description: prompt.description,
  messages: [{ role: 'user', content: { type: 'text', text: prompt.text(args) } }],
})
