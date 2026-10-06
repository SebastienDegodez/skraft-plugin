// Pure: the journal of a pipeline run, kept beside state.json so anyone can follow a run
// that is running, paused at a checkpoint, or over — the Copilot app canvas, the Claude
// Code pane, a person reading the file. state.json says where the pipeline stands; the
// journal says what the run is doing now and what it said on the way.
//
//   { status: 'running' | 'awaiting-human' | 'done' | 'blocked' | 'error',
//     phase, reason, checkpoint: { key, question, options } | null, story,
//     startedAt, updatedAt, log: [{ at, message }] }   (newest last, bounded)

export const RUN_JOURNAL_PATH = 'run.json'
export const MAX_JOURNAL_LINES = 200

const bounded = (log) => log.slice(-MAX_JOURNAL_LINES)
const line = (at, message) => Object.freeze({ at, message: String(message) })

export const journalStarted = (previous, { at, story = null }) => ({
  status: 'running',
  phase: previous?.phase ?? null,
  reason: '',
  checkpoint: null,
  story: story ?? previous?.story ?? null,
  startedAt: at,
  updatedAt: at,
  log: bounded([...(Array.isArray(previous?.log) ? previous.log : []), line(at, 'run started')]),
})

export const journalPhase = (journal, phase, at) => ({ ...journal, phase, updatedAt: at, log: bounded([...journal.log, line(at, `phase ${phase}`)]) })

export const journalLine = (journal, message, at) => ({ ...journal, updatedAt: at, log: bounded([...journal.log, line(at, message)]) })

export const journalAwaiting = (journal, { key, question, options = [] }, at) => ({
  ...journal,
  status: 'awaiting-human',
  reason: question,
  checkpoint: { key, question, options: [...options] },
  updatedAt: at,
  log: bounded([...journal.log, line(at, `waiting for an answer to ${key}`)]),
})

export const journalAnswered = (journal, key, at) => ({
  ...journal,
  status: 'running',
  reason: '',
  checkpoint: null,
  updatedAt: at,
  log: bounded([...journal.log, line(at, `answer recorded for ${key}`)]),
})

// outcome — RunPipeline's { status, phase, reason, checkpoint? }
export const journalFinished = (journal, outcome, at) => ({
  ...journal,
  status: outcome.status,
  phase: outcome.phase ?? journal.phase,
  reason: outcome.reason ?? '',
  checkpoint: outcome.checkpoint
    ? { key: outcome.checkpoint.key, question: outcome.checkpoint.question, options: [...(outcome.checkpoint.options ?? [])] }
    : null,
  updatedAt: at,
  log: bounded([...journal.log, line(at, `${outcome.status}${outcome.reason ? ` — ${outcome.reason}` : ''}`)]),
})
