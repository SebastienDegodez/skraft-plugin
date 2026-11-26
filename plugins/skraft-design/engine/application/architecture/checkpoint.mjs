import { contextQuestion, stopped, stopRun, waitingFor } from './context.mjs'
import { acceptedBriefFailures, allIncluded, blockedStories, currentStories, passIndex, pinBriefs } from './story-briefs.mjs'
import { engineMessage, issueOf } from '../../domain/pipeline/commits.mjs'
import { publishResearch } from './publish-research.mjs'
import { deriveRun } from '../../domain/journal/run-state.mjs'
import { concurrencyCheckpoint } from './concurrent-designs.mjs'
import { OPEN_QUESTIONS_FILE, openQuestions, questionsText } from '../../domain/architecture/open-questions.mjs'
import { interpretReply } from './reply-interpreter.mjs'
import { REFRESH_OFFER, refreshCheckpoint } from './refresh-run.mjs'

export { REFRESH_OFFER }

/** What a checkpoint gives when it settled a question itself: the run takes its next step again. */
export const AGAIN = Object.freeze({ again: true })

/** A REFRESH a person asked for comes first, whatever the next step; then that step's own checkpoint. */
export const architectureCheckpoint = async (context, next) => (await refreshCheckpoint(context)) ?? stepCheckpoint(context, next)

const stepCheckpoint = async (context, next) => {
  if (next.node?.id === 'design') return researchCheckpoint(context)
  if (next.node?.id === 'pr_writer') return concurrencyCheckpoint(context)
  if (next.node?.id !== 'design_review') return null
  return (await scopeCheckpoint(context)) ?? questionsCheckpoint(context)
}

/** The stories the architect could not design: a person keeps the others or stops, before any review. */
const scopeCheckpoint = async (context) => {
  const stories = currentStories(context.journal.events)
  const blocked = await blockedStories(context.deps, context.slug, stories)
  if (!blocked.ok || blocked.stories.length === 0) return null
  return consentToExclusions(context, blocked.stories)
}

/**
 * The content questions the pass left on the stories it kept: one decision holds them all, so a
 * person answers them together, the answers run the design again once, and the review reads the
 * design they settle (#662). The same questions left again are not asked again.
 */
const questionsCheckpoint = async (context) => {
  const { deps, slug, journal } = context
  const issues = currentStories(journal.events).map(({ number }) => number)
  const questions = openQuestions(await deps.files.read(slug, OPEN_QUESTIONS_FILE), issues)
  if (questions.length === 0) return null
  const hash = await deps.hasher.sha256(JSON.stringify(questions))
  const key = `architecture-questions-${passIndex(journal.events)}-${hash.slice(0, 12)}`
  const question = await contextQuestion(journal, { key, kind: 'architecture-questions', text: questionsText(questions), step: 'design', details: { questions } })
  if (!question.answer) return (await interpretReply(context, question)) ? AGAIN : waitingFor(slug, question)
  return question.answer === 'STOP' ? stopRun({ slug, journal }, 'architecture-stopped', 'A human stopped architecture design.') : null
}

const researchCheckpoint = async (context) => {
  const result = await publishResearch(context)
  return result.ok ? null : stopped(context.slug, 'research-publication-failed', result.reason)
}

const consentToExclusions = async ({ deps, slug, journal }, stories) => {
  const hash = await deps.hasher.sha256(JSON.stringify(stories))
  const key = `architecture-blocked-${passIndex(journal.events)}-${hash.slice(0, 12)}`
  const text = `The solution architect blocked these stories: ${stories.map(({ issue, reason }) => `#${issue}: ${reason}`).join('; ')}. Continue without them or stop? Use /skraft-refine for excluded stories.${REFRESH_OFFER}`
  const question = await contextQuestion(journal, { key, kind: 'architecture-blocked', text, step: 'design_review', details: { facts: { stories } } })
  if (!question.answer) return waitingFor(slug, question)
  if (question.answer === 'STOP') return stopRun({ slug, journal }, 'architecture-stopped', 'A human stopped architecture design.')
  return excludeStories({ deps, slug, journal }, key, stories)
}

const excludeStories = async ({ deps, slug, journal }, key, stories) => {
  if (!journal.events.some((event) => event.type === 'architecture.excluded' && event.key === key)) await journal.append('architecture.excluded', { key, stories })
  const excluded = journal.events.filter((event) => event.type === 'architecture.excluded').flatMap((event) => event.stories)
  await deps.files.write(slug, 'plans/architecture-pass.json', `${JSON.stringify({ stories: currentStories(journal.events), excluded }, null, 2)}\n`)
  await deps.files.write(slug, 'details/blocked-stories.json', '[]\n')
  return allIncluded(journal.events).length === 0 ? stopRun({ slug, journal }, 'architecture-empty', 'Every story was excluded; refine the blocked stories before starting design again.') : null
}

export const completeArchitecturePass = async ({ deps, slug, journal }) => {
  const last = journal.events.findLast((event) => event.type === 'step.started' && event.step === 'architecture_pass')
  if (!last) return { environment: 'the architecture pass has no started visit to complete' }
  return finishArchitecturePass({ deps, slug, journal, visit: last.visit })
}

const finishArchitecturePass = async ({ deps, slug, journal, visit }) => {
  const recorded = journal.events.find((event) => event.type === 'architecture.pass-completed' && event.architectureVisit === visit)
  if (recorded) return answered(recorded.next)
  const stories = await includedStories(deps, slug, journal.events)
  const baseSha = deriveRun(journal.events).base.find(({ component }) => component === null)?.sha ?? null
  const failures = await acceptedBriefFailures(deps, { slug, stories: nextPass(journal.events) === 'NEXT' ? stories : allIncluded(journal.events), baseSha })
  if (failures.length > 0) return { environment: failures.join('; ') }
  return recordArchitecturePass({ deps, slug, journal, visit, stories })
}

const recordArchitecturePass = async ({ deps, slug, journal, visit, stories }) => {
  await journal.append('architecture.pass-completed', { architectureVisit: visit, stories, next: nextPass(journal.events) })
  const following = currentStories(journal.events)
  await deps.files.write(slug, 'plans/architecture-pass.json', `${JSON.stringify({ stories: following }, null, 2)}\n`)
  if (following.length === 0) await pinRun({ deps, slug, journal })
  return answered(following.length > 0 ? 'NEXT' : 'COMPLETE')
}

const includedStories = async (deps, slug, events) => {
  const stories = currentStories(events)
  const blocked = await blockedStories(deps, slug, stories)
  if (!blocked.ok) return []
  return stories.filter(({ number }) => !blocked.stories.some((item) => item.issue === number))
}

/** Every pass accepted: the briefs pin what they cite, in one engine commit (#669). @param {{ deps: any, slug: string, journal: any }} run */
const pinRun = async ({ deps, slug, journal }) => {
  const pinned = await pinBriefs(deps, slug, allIncluded(journal.events))
  if (pinned.length > 0) await deps.sourceControl.commitFiles('.', pinned, engineMessage(`docs(${slug}): pin the documents its briefs cite`, issueOf(deriveRun(journal.events).story)))
}

const nextPass = (events) => (events.find((event) => event.type === 'architecture.scope')?.stories.length > (passIndex(events) + 1) * 20 ? 'NEXT' : 'COMPLETE')
const answered = (answer) => ({ answered: { answer, reason: 'The engine accounted for every story in this architecture pass.' } })

/**
 * The publication a design run ends on: a pull request ready for review, whatever publish.draft
 * says, its merge being the ratification of the architecture; the draft the run opened to ask a
 * person is made ready then. @param {any} publish the configuration's
 */
export const finalPublication = (publish) => ({ ...publish, draft: false })
