import { createInit } from '../pipeline/init-usecase.mjs'
import { openActiveRun } from '../pipeline/active-run.mjs'
import { createArchitectureReader } from './read-architecture.mjs'
import { acceptBrief, contextQuestion, stopped, waitingFor, writeArchitectureContext } from './context.mjs'
import { runIdentity } from './run-identity.mjs'
import { writeLightDesignPlan } from './light-design.mjs'
import { issueDocument } from '../../domain/pipeline/artifacts.mjs'
import { MODES } from './ci-mode.mjs'

export const createDeliveryRun = (deps) => Object.freeze({
  start: (request) => start(deps, request),
  prepare: () => prepare(deps),
})

const start = async (deps, { issue, mode = 'interactive' }) => {
  if (!Number.isSafeInteger(issue) || issue < 1) return stopped(null, 'invalid-issue', 'Choose a positive story issue number.')
  if (!MODES.includes(mode)) return { status: 'refused', ok: false, code: 'invalid-mode', reason: `mode is ${MODES.join(' or ')}.` }
  const read = await deps.architectureForge.read(issue)
  if (!read.ok) return { status: 'refused', ...read }
  if (!read.issue.story) return stopped(null, 'issue-not-a-story', 'Delivery accepts a story, not an epic or feature.')
  return startStory(deps, read.issue, mode)
}

/** The story's run: a new one on its own branch, or the one it resumes. */
const startStory = async (deps, story, mode) => {
  const issue = story.number
  const identity = await runIdentity(deps, `issue-${issue}`)
  if (!identity.ok) return { status: 'refused', ...identity }
  const { slug } = identity
  const branched = await deps.architectureRepository.branch({ name: `deliver/${slug}`, existing: identity.existing })
  if (!branched.ok) return { status: 'refused', ...branched }
  return initializeStory(deps, slug, story, mode)
}

/** A new delivery's journal, its mode in it: a CI one asks people in comments. */
const initializeStory = async (deps, slug, issue, mode) => {
  const initialized = await createInit({ ...deps, initialIssue: issue }).init({ slug, story: { issue: issue.number, title: issue.title } })
  if (!initialized.ok) return { status: 'refused', ...initialized }
  const opened = await openActiveRun(deps, slug)
  if (opened.ok && !opened.journal.events.some(({ type }) => type === 'run.mode')) await opened.journal.append('run.mode', { mode })
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

/**
 * The brief merged for the story, bound; none, a light design; one delivery cannot rely on
 * (unmerged, stale, invalid, or a changed issue a person asked to design again), a wait for a
 * design, which the workflow's design_wait settles. Only a merged base Git cannot read refuses.
 */
const bindOrAsk = async (deps, opened, found) => {
  if (found === null) return withoutBrief(opened, deps)
  if (found.status === 'unreadable') return stopped(opened.slug, found.code, found.reason)
  if (found.status !== 'current' && found.status !== 'changed') return withoutBrief(opened, deps, { code: found.code, reason: found.reason })
  const kept = found.status === 'changed' ? await changed(deps, opened, found) : null
  if (kept !== null) return kept
  await acceptBrief(deps, opened, found)
  return { status: 'ready', slug: opened.slug, architecture: found.path }
}

/**
 * No brief to deliver on: a light design writes one before DISTILL, under the plan the engine gives
 * it, unless the delivery waits for a design first.
 * @param {any} opened @param {any} deps @param {{ code: string, reason: string } | null} [wait]
 */
const withoutBrief = async ({ slug, journal, issue }, deps, wait = null) => {
  const notice = wait === null ? 'No architecture brief found for this story. A light design writes one before DISTILL.' : `${wait.reason} The delivery waits for a design, or a light design.`
  const context = await writeArchitectureContext(deps.files, slug, { mode: 'absent', documents: [] })
  const plan = await writeLightDesignPlan(deps, slug, issue)
  await journal.append('architecture.bound', { artifacts: [context, plan], notice, ...(wait === null ? {} : { wait }) })
  return { status: 'ready', slug, notice }
}

const changed = async (deps, { slug, journal, issue }, found) => {
  const identity = await deps.hasher.sha256(`${found.sha}:${found.fingerprint}`)
  const question = await contextQuestion(journal, {
    key: `architecture-refresh-${identity.slice(0, 16)}`, kind: 'architecture-refresh',
    text: 'The issue body changed since design. KEEP the merged brief or REDESIGN before delivery?',
  })
  if (!question.answer) return waitingFor(slug, question)
  if (question.answer === 'KEEP') return null
  return withoutBrief({ slug, journal, issue }, deps, { code: 'architecture-redesign', reason: 'A person asked to design the story again: its issue changed since its brief.' })
}
