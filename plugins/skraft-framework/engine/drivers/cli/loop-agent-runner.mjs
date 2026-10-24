/**
 * AgentRunner of the agent loop: the run hands its dispatches to the agent that conducts the
 * loop (`skraft next`) and takes their replies on the next `skraft record`. The replies recorded
 * since the last `next` answer their dispatch again when the run asks it again, as a Copilot
 * workflow run answers a call it already made: a resumed review reads its first round before it
 * asks its second. Its files sit under the run's `results/` folder, which the engine keeps and
 * never counts as a document.
 *
 * @typedef {import('../../application/ports/agent-runner.mjs').AgentDispatch} AgentDispatch
 * @typedef {import('../../application/ports/agent-runner.mjs').AgentAnswer} AgentAnswer
 * @typedef {import('../../application/ports/tracking-files.mjs').TrackingFiles} TrackingFiles
 * @typedef {{ label: string, agent: string, model: string | null, brief: string, reply: string }} HandedDispatch
 *   brief: the prompt the run wrote for the agent; reply: where its final reply goes, both
 *   relative to the run's tracking folder; model: the Copilot model its family runs on, null for
 *   the session's.
 */

export const LOOP_FOLDER = 'results/loop'
export const PENDING_FILE = `${LOOP_FOLDER}/pending.json`
export const REPLIES_FILE = `${LOOP_FOLDER}/replies.json`

/** The run stopped once it handed its dispatches over; the next `skraft record` takes it on. */
export class HandedOver extends Error {
  constructor() {
    super('handed over to the agent loop')
    this.name = 'HandedOver'
  }
}

/**
 * @param {{ files: TrackingFiles, slug: string | null, replies: ReadonlyMap<string, AgentAnswer> }} options
 *   replies: what `skraft record` read for each dispatch handed over since the last `next`, by label
 * @returns {import('../../application/ports/agent-runner.mjs').AgentRunner}
 */
export const createLoopAgentRunner = (options) => Object.freeze({
  run: async (dispatch) => (await answersOf(options, [dispatch])).answers[0],
  runMany: (dispatches) => answersOf(options, dispatches),
})

/**
 * The replies recorded for every dispatch, else those without one handed over and the run stopped.
 * @param {Parameters<typeof createLoopAgentRunner>[0]} options @param {AgentDispatch[]} dispatches
 * @returns {Promise<import('../../application/ports/agent-runner.mjs').AgentAnswers>}
 */
const answersOf = async ({ files, slug, replies }, dispatches) => {
  const unanswered = dispatches.filter(({ label }) => !replies.has(label))
  if (unanswered.length === 0) return { answers: dispatches.map(({ label }) => /** @type {AgentAnswer} */ (replies.get(label))) }
  await handOver(files, /** @type {string} */ (slug), unanswered)
  throw new HandedOver()
}

/**
 * Writes each brief and an empty reply, then the list of what is pending.
 * @param {TrackingFiles} files @param {string} slug @param {AgentDispatch[]} dispatches
 */
const handOver = async (files, slug, dispatches) => {
  const handed = dispatches.map(handedOf)
  for (const [index, { brief, reply }] of handed.entries()) {
    await files.write(slug, brief, dispatches[index].prompt)
    await files.write(slug, reply, '')
  }
  await files.write(slug, PENDING_FILE, `${JSON.stringify({ dispatches: handed }, null, 2)}\n`)
}

/** @param {AgentDispatch} dispatch @param {number} index @returns {HandedDispatch} */
const handedOf = ({ label, agent, models }, index) => ({
  label,
  agent,
  model: models?.copilot?.[0] ?? null,
  brief: `${LOOP_FOLDER}/dispatch-${index + 1}.brief.md`,
  reply: `${LOOP_FOLDER}/dispatch-${index + 1}.reply.md`,
})

/**
 * What the run handed over and nobody recorded yet; none once recorded.
 * @param {TrackingFiles} files @param {string} slug @returns {Promise<HandedDispatch[]>}
 */
export const pendingDispatches = async (files, slug) => {
  const text = await files.read(slug, PENDING_FILE)
  return text === null ? [] : JSON.parse(text).dispatches
}

/**
 * The replies recorded since the last `next`, with each pending dispatch's reply as the agent
 * saved it, by label; an empty or missing reply is no answer. The pending list is cleared.
 * @param {TrackingFiles} files @param {string} slug @param {HandedDispatch[]} pending
 * @returns {Promise<Map<string, AgentAnswer>>}
 */
export const takeReplies = async (files, slug, pending) => {
  const replies = new Map(Object.entries(JSON.parse(/** @type {string} */ (await files.read(slug, REPLIES_FILE)))))
  for (const { label, reply } of pending) replies.set(label, answerOf(await files.read(slug, reply)))
  await files.write(slug, REPLIES_FILE, `${JSON.stringify(Object.fromEntries(replies), null, 2)}\n`)
  await files.write(slug, PENDING_FILE, `${JSON.stringify({ dispatches: [] }, null, 2)}\n`)
  return replies
}

/**
 * A `next` starts the run afresh: no reply recorded before it answers a dispatch again.
 * @param {TrackingFiles} files @param {string} slug
 */
export const forgetReplies = (files, slug) => files.write(slug, REPLIES_FILE, '{}\n')

/** @param {string | null} text absent when the reply file was removed @returns {AgentAnswer} */
const answerOf = (text) => ((text ?? '').trim() === '' ? { ok: false, text: '', error: 'no reply was saved' } : { ok: true, text: /** @type {string} */ (text) })
