import { deriveRun } from '../../domain/journal/run-state.mjs'
import { questionOf } from '../../domain/decisions/questions.mjs'

export const contextQuestion = async (journal, { key, kind, text, step = 'readiness', details = {} }) => {
  const found = deriveRun(journal.events).questions[key]
  if (found) return found
  const asked = { ...questionOf(kind, key, text), ...details, step, visit: 1, subjects: [] }
  await journal.append('question.asked', asked)
  return { ...asked, answer: null }
}

export const waitingFor = (slug, question) => ({
  status: 'waiting', slug, phase: null, code: null, reason: question.text, question,
})

export const stopped = (slug, code, reason) => ({ status: 'blocked', slug, phase: null, code, reason })

export const stopRun = async ({ slug, journal }, code, reason) => {
  if (!journal.events.some((event) => event.type === 'run.finished')) await journal.append('run.finished', { status: 'cancelled', code, reason })
  return stopped(slug, code, reason)
}

export const bindDocuments = async ({ files }, { slug, journal }, documents) => {
  const artifacts = []
  for (const { path, text } of documents) {
    const snapshot = `architecture/${path}`
    await files.write(slug, snapshot, text)
    artifacts.push(snapshot)
  }
  await journal.append('architecture.bound', { artifacts })
}
