import {
  RUN_JOURNAL_PATH, journalAnswered, journalAwaiting, journalFinished, journalLine, journalPhase, journalStarted,
} from '../../domain/pipeline/run-journal-policy.mjs'

// Step of RunPipeline: keeps {tracking}/{slug}/run.json (domain run-journal-policy) as the
// run goes. It decorates two ports the use case already has — PipelineProgress (phases and
// log lines) and HumanInteraction (a question asked, then answered) — so the journal sees
// exactly what the person watching sees. Writes are chained in order; a failed write is
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
    begin: async (runSlug, story) => {
      slug = runSlug
      let previous = null
      try { previous = JSON.parse(await trackingStore.read(runSlug, RUN_JOURNAL_PATH)) } catch { /* first run */ }
      await save(journalStarted(previous, { at: now(), story }))
    },
    finish: (outcome) => update((j) => journalFinished(j, outcome, now())),
    flush: () => pending,
    observeProgress: (progress) => Object.freeze({
      phase: (title) => { progress.phase(title); void update((j) => journalPhase(j, title, now())) },
      log: (message) => { progress.log(message); void update((j) => journalLine(j, message, now())) },
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
