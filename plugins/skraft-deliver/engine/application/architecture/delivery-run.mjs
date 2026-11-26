import { createInit } from '../pipeline/init-usecase.mjs'
import { openActiveRun } from '../pipeline/active-run.mjs'
import { createArchitectureReader } from './read-architecture.mjs'
import { bindDocuments, contextQuestion, stopped, stopRun, waitingFor, writeArchitectureContext } from './context.mjs'
import { runIdentity } from './run-identity.mjs'
import { writeLightDesignPlan } from './light-design.mjs'
import { issueDocument } from '../../domain/pipeline/artifacts.mjs'

export const createDeliveryRun = (deps) => Object.freeze({
  start: (request) => start(deps, request),
  prepare: () => prepare(deps),
})

const start = async (deps, { issue }) => {
  if (!Number.isSafeInteger(issue) || issue < 1) return stopped(null, 'invalid-issue', 'Choose a positive story issue number.')
  const read = await deps.architectureForge.read(issue)
  if (!read.ok) return { status: 'refused', ...read }
  if (!read.issue.story) return stopped(null, 'issue-not-a-story', 'Delivery accepts a story, not an epic or feature.')
  const identity = await runIdentity(deps, `issue-${issue}`)
  if (!identity.ok) return { status: 'refused', ...identity }
  const { slug } = identity
  const branched = await deps.architectureRepository.branch({ name: `deliver/${slug}`, existing: identity.existing })
  if (!branched.ok) return { status: 'refused', ...branched }
  return initializeStory(deps, slug, read.issue)
}

const initializeStory = async (deps, slug, issue) => {
  const initialized = await createInit({ ...deps, initialIssue: issue }).init({ slug, story: { issue: issue.number, title: issue.title } })
  if (!initialized.ok) return { status: 'refused', ...initialized }
  return prepare(deps)
}

const prepare = async (deps) => {
  const opened = await openActiveRun(deps, null)
  if (!opened.ok) return opened.outcome
  if (opened.journal.events.some((event) => event.type === 'architecture.bound')) return { status: 'ready', slug: opened.slug }
  const number = opened.journal.events[0].story.issue
  const read = await deps.architectureForge.read(number)
  if (!read.ok) return { status: 'refused', ...read }
  await deps.files.write(opened.slug, opened.journal.events[0].artifacts[0], issueDocument(read.issue))
  const found = await createArchitectureReader(deps).find(read.issue)
  return bindOrAsk(deps, { ...opened, issue: read.issue }, found)
}

const bindOrAsk = async (deps, opened, found) => {
  if (found === null) return withoutBrief(opened, deps)
  if (!['current', 'changed'].includes(found.status)) return stopped(opened.slug, found.code, found.reason)
  if (found.status === 'changed') {
    const refusal = await changed(deps, opened, found)
    if (refusal) return refusal
  }
  await bindDocuments(deps, opened, found)
  await opened.journal.append('architecture.accepted', { path: found.path, sha: found.sha, status: found.status })
  return { status: 'ready', slug: opened.slug, architecture: found.path }
}

/** No brief merged for the story: a light design writes one before DISTILL, under the plan the engine gives it. */
const withoutBrief = async ({ slug, journal, issue }, deps) => {
  const notice = 'No architecture brief found for this story. A light design writes one before DISTILL.'
  const context = await writeArchitectureContext(deps.files, slug, { mode: 'absent', documents: [] })
  const plan = await writeLightDesignPlan(deps, slug, issue)
  await journal.append('architecture.bound', { artifacts: [context, plan], notice })
  return { status: 'ready', slug, notice }
}

const changed = async (deps, { slug, journal }, found) => {
  const identity = await deps.hasher.sha256(`${found.sha}:${found.fingerprint}`)
  const question = await contextQuestion(journal, {
    key: `architecture-refresh-${identity.slice(0, 16)}`, kind: 'architecture-refresh',
    text: 'The issue body changed since design. KEEP the merged brief or REDESIGN before delivery?',
  })
  if (!question.answer) return waitingFor(slug, question)
  if (question.answer === 'KEEP') return null
  return stopRun({ slug, journal }, 'architecture-redesign', 'Run skraft-design for this story, merge its pull request, then start a new delivery run.')
}
