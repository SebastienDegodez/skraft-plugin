import { deriveRun } from '../../domain/journal/run-state.mjs'
import { questionOf } from '../../domain/decisions/questions.mjs'

export const contextQuestion = async (journal, { key, kind, text, step = 'readiness' }) => {
  const found = deriveRun(journal.events).questions[key]
  if (found) return found
  const asked = { ...questionOf(kind, key, text), step, visit: 1, subjects: [] }
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

export const bindDocuments = async ({ files }, { slug, journal }, { documents, sha, path }) => {
  const artifacts = []
  for (const { path, text } of documents) {
    const snapshot = `architecture/${path}`
    await files.write(slug, snapshot, text)
    artifacts.push(snapshot)
  }
  artifacts.push(await writeArchitectureContext(files, slug, { mode: 'merged', sha, brief: path, documents }))
  await journal.append('architecture.bound', { artifacts })
}

export const writeArchitectureContext = async (files, slug, { mode, sha = null, brief = null, documents }) => {
  const context = { version: 1, mode, sha, brief, documents: documents.map(({ path }) => ({ source: path, snapshot: `architecture/${path}` })) }
  await files.write(slug, 'architecture/context.json', `${JSON.stringify(context, null, 2)}\n`)
  return 'architecture/context.json'
}
