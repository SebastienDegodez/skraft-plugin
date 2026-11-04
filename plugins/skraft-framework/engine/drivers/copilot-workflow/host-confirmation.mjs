/**
 * The person's own answer in Copilot's dialog, the only way a Copilot run or tool records one:
 * `ask` a yes or no (`session.ui.confirm`), `choose` one of the options (`session.ui.select`),
 * `write` a text (`session.ui.input`). What the dialog gives is the answer: nothing asks again to
 * confirm it. The joined session's dialogs reach the host from a tool (probe check
 * `confirm-from-tool`) and from a workflow run (`confirm-joined-session-from-workflow`,
 * `select-joined-session-from-workflow`, `input-joined-session-from-workflow`), Copilot CLI
 * 1.0.102-1. Refused, with a fixed reason, when the host declares no elicitation, in `autopilot`
 * (the host may still relay the dialog there: `confirm-in-autopilot`), when the mode cannot be
 * read in time. The run asks as often as it needs: no number of dialogs is capped. A no, a dismissed dialog or no answer
 * within the time is `not-answered`. Any other result, a throw included, means the host never put
 * the question (`not-asked`): VS Code Insiders, Copilot agent host 1.0.101, shows no dialog for a
 * request made outside a chat turn, though it does for a tool call in one.
 *
 * @typedef {{
 *   capabilities?: { ui?: { elicitation?: boolean } },
 *   rpc?: { mode?: { get?: () => Promise<unknown> } },
 *   ui?: {
 *     confirm?: (message: string) => Promise<unknown>,
 *     select?: (message: string, options: string[]) => Promise<unknown>,
 *     input?: (message: string) => Promise<unknown>,
 *   },
 * }} ConfirmingSession
 * @typedef {{ modeMs: number, answerMs: number }} Waits
 * @typedef {{ ok: true, value: unknown } | { ok: false, code: string, reason: string }} Answered
 *   value: what the dialog gave; reason: fixed here, never a value the dialog or the request carried.
 * @typedef {{
 *   by: string,
 *   ask: (message: string) => Promise<Answered>,
 *   choose: (message: string, options: readonly string[]) => Promise<Answered>,
 *   write: (message: string) => Promise<Answered>,
 * }} HostDialog by: the provenance the journal records with an answer given here.
 * @typedef {{ call: (ui: NonNullable<ConfirmingSession['ui']>) => Promise<unknown> | undefined, takes: (value: unknown) => boolean, declined: unknown }} Dialog
 *   takes: whether the value is an answer; declined: the value of a no or a dismissed dialog.
 */

/** How long the host has to say its mode, and the person to answer. */
const WAITS = Object.freeze({ modeMs: 5000, answerMs: 120_000 })
const TIMED_OUT = Symbol('timed out')

// Stryker disable StringLiteral: text shown to the model and the person; the code is what callers read
const REFUSALS = Object.freeze({
  'no-elicitation': 'this Copilot host cannot put a question to you',
  autopilot: 'Copilot does not put a question to you in autopilot',
  'mode-unknown': 'Copilot did not say whether a person is there',
  'not-answered': 'you did not answer the question in Copilot',
  'not-asked': 'Copilot did not put the question to you',
})
// Stryker restore StringLiteral

/**
 * @param {{ session: () => ConfirmingSession | null, waits?: Waits }} host
 *   session: the joined session, null before the join
 * @returns {HostDialog}
 */
// Stryker disable next-line ObjectLiteral: the tests that keep these waits answer at once; the times themselves are not observable there
export const createHostConfirmation = ({ session, waits = WAITS }) => {
  const state = { session, waits }
  return Object.freeze({
    by: 'host-confirmed',
    ask: (message) => put(state, { call: (ui) => ui.confirm?.(message), takes: (value) => value === true, declined: false }),
    choose: (message, options) => put(state, { call: (ui) => ui.select?.(message, [...options]), takes: (value) => options.includes(/** @type {string} */ (value)), declined: null }),
    write: (message) => put(state, { call: (ui) => ui.input?.(message), takes: (value) => typeof value === 'string', declined: null }),
  })
}

/**
 * One dialog, once the person can be asked: its answer, or why not.
 * @param {{ session: () => ConfirmingSession | null, waits: Waits }} state
 * @param {Dialog} dialog @returns {Promise<Answered>}
 */
const put = async (state, dialog) => {
  const joined = state.session()
  const barred = await personBarred(joined, state.waits.modeMs)
  if (barred !== null) return refused(barred)
  const value = await within(() => dialog.call(/** @type {NonNullable<ConfirmingSession['ui']>} */ (joined?.ui)), state.waits.answerMs)
  return answered(dialog, value)
}

/**
 * What the dialog's result comes to: an answer it takes; a no, a dismissed dialog or no answer in
 * time is the person's no; anything else is a dialog the host never showed.
 * @param {Dialog} dialog @param {unknown} value @returns {Answered}
 */
const answered = ({ takes, declined }, value) => {
  if (takes(value)) return { ok: true, value }
  return refused(value === declined || value === TIMED_OUT ? 'not-answered' : 'not-asked')
}

/**
 * Why the session cannot put the question to a person, null when it can.
 * @param {ConfirmingSession | null} joined @param {number} modeMs
 * @returns {Promise<'no-elicitation' | 'mode-unknown' | 'autopilot' | null>}
 */
const personBarred = async (joined, modeMs) => {
  if (joined?.capabilities?.ui?.elicitation !== true) return 'no-elicitation'
  const mode = await within(() => joined.rpc?.mode?.get?.(), modeMs)
  if (typeof mode !== 'string') return 'mode-unknown'
  return mode === 'autopilot' ? 'autopilot' : null
}

/**
 * What the call answers within the time; TIMED_OUT past it, undefined when it throws. The timer
 * is cleared once answered.
 * @param {() => Promise<unknown> | undefined} call @param {number} ms @returns {Promise<unknown>}
 */
const within = async (call, ms) => {
  /** @type {NodeJS.Timeout | undefined} */
  let timer
  const late = new Promise((done) => { timer = setTimeout(() => done(TIMED_OUT), ms) })
  try {
    return await Promise.race([call(), late])
  } catch {
    // a call that throws gives no answer
  } finally {
    clearTimeout(timer)
  }
}

/** @param {keyof typeof REFUSALS} code @returns {Answered} */
const refused = (code) => ({ ok: false, code, reason: REFUSALS[code] })
