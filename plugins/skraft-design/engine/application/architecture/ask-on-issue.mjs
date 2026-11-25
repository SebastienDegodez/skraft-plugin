import { deriveRun } from '../../domain/journal/run-state.mjs'
import { QUESTION_MARKER, questionComment } from '../../domain/architecture/question-comment.mjs'
import { openActiveRun } from '../pipeline/active-run.mjs'
import { loadConfig } from '../config/bases.mjs'
import { forgeAdapters } from '../config/forge.mjs'
import { pushedBranch } from '../publish/forge-writes.mjs'
import { storyLanguage } from '../publish/story-language.mjs'

/**
 * Asks a CI run's pending question on its issue or epic, the run's branch pushed first so the job
 * that reads the reply resumes on it: one marked comment, kept up to date from one question to the
 * next. Only with the publication consent (#662).
 * @param {any} deps @param {{ slug: string, question: any }} outcome
 */
export const askOnIssue = async (deps, { slug, question }) => {
  const opened = await openActiveRun(deps, slug)
  if (!opened.ok) return { ok: false, slug, code: opened.outcome.code, reason: opened.outcome.reason }
  const loaded = await loadConfig(deps)
  if (!loaded.ok) return { ok: false, slug, code: 'config-invalid', reason: loaded.reason }
  if (loaded.config.publish.pullRequest !== true) return { ok: false, slug, code: 'publication-not-consented', reason: 'Asking on the issue requires publish.pullRequest consent in skraft-design-config.json' }
  const { codeHost } = await forgeAdapters(deps, loaded.config.forge)
  const pushed = await pushedBranch(opened.journal, codeHost, await codeHost.currentBranch())
  if (!pushed.ok) return { ok: false, slug, code: 'not-pushed', reason: pushed.reason }
  return postQuestion({ ...deps, codeHost }, { slug, journal: opened.journal }, question)
}

/** @param {any} deps @param {{ slug: string, journal: any }} run @param {any} question */
const postQuestion = async (deps, { slug, journal }, question) => {
  const number = journal.events.find((event) => event.type === 'architecture.scope').root.number
  const body = questionComment(question, await storyLanguage(deps, slug, deriveRun(journal.events)))
  const previous = journal.events.findLast((event) => event.type === 'architecture.question-posted')
  await deps.files.write(slug, 'publish/question.md', body)
  await deps.files.write(slug, 'publish/question.json', JSON.stringify({ text: body }))
  const kept = await deps.codeHost.keepIssueComment({ number, marker: QUESTION_MARKER, url: previous?.url ?? null, body,
    bodyFile: deps.files.location(slug, 'publish/question.md'), requestFile: deps.files.location(slug, 'publish/question.json') })
  if (!kept.ok) return { ok: false, slug, code: 'not-asked', reason: kept.reason }
  await journal.append('architecture.question-posted', { key: question.key, url: kept.url })
  return { ok: true, slug, on: 'issue', url: kept.url, code: null, reason: `asked on #${number}: ${kept.url}` }
}
