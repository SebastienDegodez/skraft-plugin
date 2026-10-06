// Pure: the journal of a pipeline run, kept beside state.json so anyone can follow a run
// that is running, paused at a checkpoint, or over — the Copilot app canvas, the Claude
// Code pane, a person reading the file. state.json says where the pipeline stands; the
// journal says what the run is doing now and what it said on the way.
//
//   { status: 'running' | 'awaiting-human' | 'done' | 'blocked' | 'error',
//     phase, reason, checkpoint: { key, question, options } | null, story,
//     startedAt, updatedAt, log: [{ at, message }]          (newest last, bounded)
//     dispatches: [{ at, phase, role, agent, label, durationMs, ok, usage? }]  (every run)
//     qualityGates: { evidenceLog, verdict, findings, at } | null  (the code's last check) }

export const RUN_JOURNAL_PATH = 'run.json'
export const MAX_JOURNAL_LINES = 200
export const MAX_JOURNAL_DISPATCHES = 500

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
  dispatches: Array.isArray(previous?.dispatches) ? previous.dispatches.slice(-MAX_JOURNAL_DISPATCHES) : [],
  qualityGates: previous?.qualityGates ?? null,
})

// One subagent dispatch and what it cost, kept across runs: the cost of a pipeline is
// the sum of its dispatches.
export const journalDispatch = (journal, { phase, role, agent, label, startedAt, durationMs, ok, usage }) => ({
  ...journal,
  updatedAt: startedAt,
  dispatches: [...(journal.dispatches ?? []), Object.freeze({
    at: startedAt, phase, role, agent, label, durationMs, ok: Boolean(ok), ...(usage ? { usage: { ...usage } } : {}),
  })].slice(-MAX_JOURNAL_DISPATCHES),
})

// The code's verification of the quality-gate evidence log (EvidenceVerification).
export const journalVerification = (journal, { evidenceLog, verdict, findings = [] }, at) => ({
  ...journal,
  qualityGates: { evidenceLog, verdict, findings: [...findings], at },
  updatedAt: at,
  log: bounded([...journal.log, line(at, `quality gates ${evidenceLog}: ${verdict}`)]),
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
