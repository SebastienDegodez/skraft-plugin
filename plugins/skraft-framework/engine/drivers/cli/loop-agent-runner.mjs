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
 * @typedef {{ label: string, agent: string, model: string | null, brief: string, reply: string, token: string }} HandedDispatch
 *   brief: the prompt the run wrote for the agent; reply: where its final reply goes, both
 *   relative to the run's tracking folder; model: the Copilot model its family runs on, null for
 *   the session's; token: what the reply must end with, written only in the brief, so that a
 *   reply shows its brief was read (not which agent read it).
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
 * @param {{ files: TrackingFiles, slug: string | null, replies: ReadonlyMap<string, AgentAnswer>, token: () => string }} options
 *   token: a new one-time token for each brief
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
const answersOf = async ({ files, slug, replies, token }, dispatches) => {
  const unanswered = dispatches.filter(({ label }) => !replies.has(label))
  if (unanswered.length === 0) return { answers: dispatches.map(({ label }) => /** @type {AgentAnswer} */ (replies.get(label))) }
  await handOver(files, /** @type {string} */ (slug), unanswered.map((dispatch, index) => ({ dispatch, handed: handedOf(dispatch, index, token()) })))
  throw new HandedOver()
}

/**
 * Writes each brief, ending with its token, and an empty reply, then the list of what is pending.
 * @param {TrackingFiles} files @param {string} slug @param {Array<{ dispatch: AgentDispatch, handed: HandedDispatch }>} each
 */
const handOver = async (files, slug, each) => {
  for (const { dispatch, handed } of each) {
    await files.write(slug, handed.brief, `${dispatch.prompt}\n\n## Reply token\nEnd your reply with this line, as it is: ${tokenLine(handed.token)}\n`)
    await files.write(slug, handed.reply, '')
  }
  await files.write(slug, PENDING_FILE, `${JSON.stringify({ dispatches: each.map(({ handed }) => handed) }, null, 2)}\n`)
}

/** @param {string} token */
const tokenLine = (token) => `skraft-reply: ${token}`

/** @param {AgentDispatch} dispatch @param {number} index @param {string} token @returns {HandedDispatch} */
const handedOf = ({ label, agent, models }, index, token) => ({
  label,
  agent,
  model: models?.copilot?.[0] ?? null,
  brief: `${LOOP_FOLDER}/dispatch-${index + 1}.brief.md`,
  reply: `${LOOP_FOLDER}/dispatch-${index + 1}.reply.md`,
  token,
})

/**
 * What the run handed over and nobody recorded yet; none once recorded; null when the file is
 * not the list skraft wrote.
 * @param {TrackingFiles} files @param {string} slug @returns {Promise<HandedDispatch[] | null>}
 */
export const pendingDispatches = async (files, slug) => {
  const text = await files.read(slug, PENDING_FILE)
  if (text === null) return []
  const dispatches = parsed(text)?.dispatches
  return Array.isArray(dispatches) ? dispatches : null
}

/** @param {string} text @returns {any} null when it is no JSON */
const parsed = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * The replies recorded since the last `next`, with each pending dispatch's reply as the agent
 * saved it, by label; a reply without its brief's token is no answer. The pending list is
 * cleared. Null, and nothing changed, when the recorded replies are not what skraft wrote.
 * @param {TrackingFiles} files @param {string} slug @param {HandedDispatch[]} pending
 * @returns {Promise<Map<string, AgentAnswer> | null>}
 */
export const takeReplies = async (files, slug, pending) => {
  const recorded = parsed((await files.read(slug, REPLIES_FILE)) ?? '')
  if (recorded === null || typeof recorded !== 'object' || Array.isArray(recorded)) return null
  const replies = new Map(Object.entries(recorded))
  for (const { label, reply, token } of pending) replies.set(label, answerOf(await files.read(slug, reply), token))
  await files.write(slug, REPLIES_FILE, `${JSON.stringify(Object.fromEntries(replies), null, 2)}\n`)
  await files.write(slug, PENDING_FILE, `${JSON.stringify({ dispatches: [] }, null, 2)}\n`)
  return replies
}

/**
 * A `next` starts the run afresh: no reply recorded before it answers a dispatch again.
 * @param {TrackingFiles} files @param {string} slug
 */
export const forgetReplies = (files, slug) => files.write(slug, REPLIES_FILE, '{}\n')

/**
 * The reply without its token line; no answer when it is empty or does not carry the token.
 * @param {string | null} text absent when the reply file was removed @param {string} token
 * @returns {AgentAnswer}
 */
const answerOf = (text, token) => {
  const lines = (text ?? '').split(/\r?\n/)
  const kept = lines.filter((line) => line.trim() !== tokenLine(token))
  if (kept.join('\n').trim() === '') return { ok: false, text: '', error: 'no reply was saved' }
  if (kept.length === lines.length) return { ok: false, text: '', error: 'the reply does not carry the token of its brief' }
  return { ok: true, text: kept.join('\n') }
}
