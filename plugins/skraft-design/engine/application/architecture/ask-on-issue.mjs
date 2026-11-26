import { deriveRun } from '../../domain/journal/run-state.mjs'
import { answeredComment, questionComment, questionMarker } from '../../domain/architecture/question-comment.mjs'
import { openActiveRun } from '../pipeline/active-run.mjs'
import { loadConfig } from '../config/bases.mjs'
import { forgeAdapters } from '../config/forge.mjs'
import { pushedBranch } from '../publish/forge-writes.mjs'
import { storyLanguage } from '../publish/story-language.mjs'

/**
 * A CI run's questions, each in a comment of its own (#662): on its draft pull request once one is
 * open, else on its issue or epic, the run's branch pushed first so the job that reads the reply
 * resumes on it. A question already posted is not posted again; once answered, its comment is
 * rewritten to say so. Only with the publication consent.
 */

/**
 * Asks the run's pending question on its issue or epic, nothing being designed yet.
 * @param {any} deps @param {{ slug: string, question: any }} outcome
 */
export const askOnIssue = async (deps, { slug, question }) => {
  const opened = await forgeOf(deps, slug)
  if (!opened.ok) return opened
  const pushed = await pushedBranch(opened.journal, opened.codeHost, await opened.codeHost.currentBranch())
  if (!pushed.ok) return { ok: false, slug, code: 'not-pushed', reason: pushed.reason }
  const number = opened.journal.events.find((event) => event.type === 'architecture.scope').root.number
  return postQuestion(deps, opened, { question, on: 'issue', number })
}

/**
 * Asks the run's pending question on its draft pull request, the one the run opened or updated last.
 * @param {any} deps @param {{ slug: string, question: any }} outcome
 */
export const askOnPullRequest = async (deps, { slug, question }) => {
  const opened = await forgeOf(deps, slug)
  if (!opened.ok) return opened
  const number = opened.journal.events.findLast((event) => ['pull-request.opened', 'pull-request.updated'].includes(event.type))?.number
  if (number === undefined) return { ok: false, slug, code: 'not-asked', reason: 'the run opened no draft pull request to ask on' }
  return postQuestion(deps, opened, { question, on: 'pull-request', number })
}

/**
 * Rewrites the comment of each question the run posted and got an answer to since, once.
 * @param {any} deps @param {string} slug
 */
export const markAnswered = async (deps, slug) => {
  const opened = await forgeOf(deps, slug)
  if (!opened.ok) return opened
  for (const posted of unmarked(opened.journal.events)) await markOne(deps, opened, posted)
  return { ok: true }
}

/** @param {any} deps @param {string} slug */
const forgeOf = async (deps, slug) => {
  const opened = await openActiveRun(deps, slug)
  if (!opened.ok) return { ok: false, slug, code: opened.outcome.code, reason: opened.outcome.reason }
  const loaded = await loadConfig(deps)
  if (!loaded.ok) return { ok: false, slug, code: 'config-invalid', reason: loaded.reason }
  if (loaded.config.publish.pullRequest !== true) return { ok: false, slug, code: 'publication-not-consented', reason: 'Asking in a comment requires the publication consent for this repository (skraft_design_setup)' }
  const { codeHost } = await forgeAdapters(deps, loaded.config.forge)
  return { ok: true, slug, journal: opened.journal, codeHost }
}

/**
 * @param {any} deps @param {{ slug: string, journal: any, codeHost: any }} opened
 * @param {{ question: any, on: 'issue' | 'pull-request', number: number }} place
 */
const postQuestion = async (deps, { slug, journal, codeHost }, { question, on, number }) => {
  const previous = journal.events.find((event) => event.type === 'architecture.question-posted' && event.key === question.key)
  if (previous) return { ok: true, slug, on: previous.on ?? 'issue', url: previous.url, code: null, reason: `already asked: ${previous.url}` }
  const body = questionComment(question, await storyLanguage(deps, slug, deriveRun(journal.events)), on)
  const kept = await keep({ ...deps, codeHost }, slug, { on, number, key: question.key, url: null, body })
  if (!kept.ok) return { ok: false, slug, code: 'not-asked', reason: kept.reason }
  await journal.append('architecture.question-posted', { key: question.key, url: kept.url, on, number })
  return { ok: true, slug, on, url: kept.url, code: null, reason: `asked on #${number}: ${kept.url}` }
}

/** The questions posted, answered since and not marked yet. @param {any[]} events */
const unmarked = (events) => {
  const answered = new Map(events.filter(({ type }) => type === 'question.answered').map(({ key, answer }) => [key, answer]))
  const marked = new Set(events.filter(({ type }) => type === 'architecture.question-answered').map(({ key }) => key))
  return events.filter(({ type, key, number }) => type === 'architecture.question-posted' && number !== undefined && answered.has(key) && !marked.has(key))
    .map((posted) => ({ ...posted, answer: answered.get(posted.key) }))
}

/** @param {any} deps @param {{ slug: string, journal: any, codeHost: any }} opened @param {any} posted */
const markOne = async (deps, { slug, journal, codeHost }, posted) => {
  const run = deriveRun(journal.events)
  const asked = run.questions[posted.key] ?? { key: posted.key, text: '' }
  const body = answeredComment(asked, String(posted.answer), await storyLanguage(deps, slug, run))
  const kept = await keep({ ...deps, codeHost }, slug, { ...posted, body })
  if (kept.ok) await journal.append('architecture.question-answered', { key: posted.key, url: kept.url })
}

/**
 * Posts or rewrites the comment of one question, on the issue or the pull request.
 * @param {any} deps @param {string} slug @param {{ on: string, number: number, key: string, url: string | null, body: string }} comment
 */
const keep = async (deps, slug, { on, number, key, url, body }) => {
  await deps.files.write(slug, 'publish/question.md', body)
  await deps.files.write(slug, 'publish/question.json', JSON.stringify({ text: body }))
  const request = { number, marker: questionMarker(key), url, body, bodyFile: deps.files.location(slug, 'publish/question.md'), requestFile: deps.files.location(slug, 'publish/question.json') }
  return on === 'pull-request' ? deps.codeHost.keepPullRequestComment(request) : deps.codeHost.keepIssueComment(request)
}
