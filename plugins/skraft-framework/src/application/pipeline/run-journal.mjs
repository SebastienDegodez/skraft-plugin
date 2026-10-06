import {
  RUN_JOURNAL_PATH, journalAnswered, journalAwaiting, journalDispatch, journalFinished, journalLine, journalPhase,
  journalStarted, journalVerification,
} from '../../domain/pipeline/run-journal-policy.mjs'

// Step of RunPipeline: keeps {tracking}/{slug}/run.json (domain run-journal-policy) as the
// run goes. It decorates three ports the use case already has — PipelineProgress (phases
// and log lines), HumanInteraction (a question asked, then answered) and AgentRunner (each
// dispatch, its duration and cost) — so the journal sees exactly what happened. Writes are chained in order; a failed write is
// dropped, never surfaced: the journal must not change a run.
export const createRunJournal = ({ trackingStore, time }) => {
  let slug = null
  let journal = null
  let pending = Promise.resolve()

  const save = (next) => {
    journal = next
    if (!slug) return pending
    const target = slug
    const text = `${JSON.stringify(next, null, 2)}\n`
    pending = pending.then(() => trackingStore.write(target, RUN_JOURNAL_PATH, text)).catch(() => {})
    return pending
  }
  const now = () => time.isoString()
  const update = (change) => (journal ? save(change(journal)) : pending)

  return Object.freeze({
    begin: async (runSlug, story, branch = null) => {
      slug = runSlug
      let previous = null
      try { previous = JSON.parse(await trackingStore.read(runSlug, RUN_JOURNAL_PATH)) } catch { /* first run */ }
      await save(journalStarted(previous, { at: now(), story, branch }))
    },
    finish: (outcome) => update((j) => journalFinished(j, outcome, now())),
    recordVerification: (verification) => update((j) => journalVerification(j, verification, now())),
    flush: () => pending,
    observeProgress: (progress) => Object.freeze({
      phase: (title) => { progress.phase(title); void update((j) => journalPhase(j, title, now())) },
      log: (message) => { progress.log(message); void update((j) => journalLine(j, message, now())) },
    }),
    observeAgents: (agentRunner) => Object.freeze({
      run: async (dispatch) => {
        const started = time.now()
        const answer = await agentRunner.run(dispatch)
        await update((j) => journalDispatch(j, {
          phase: dispatch.phase ?? null,
          role: dispatch.role ?? null,
          agent: dispatch.agent,
          label: dispatch.label,
          startedAt: started.toISOString(),
          durationMs: time.now() - started,
          ok: answer?.ok,
          usage: answer?.usage,
        }))
        return answer
      },
    }),
    observeQuestions: (humanInteraction) => Object.freeze({
      ask: async (checkpoint) => {
        await update((j) => journalAwaiting(j, checkpoint, now()))
        const answer = await humanInteraction.ask(checkpoint)
        if (answer !== null && answer !== undefined && String(answer).trim() !== '') {
          await update((j) => journalAnswered(j, checkpoint.key, now()))
        }
        return answer
      },
    }),
  })
}
