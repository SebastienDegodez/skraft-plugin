import { contextQuestion, stopped, stopRun, waitingFor } from './context.mjs'
import { acceptedBriefFailures, allIncluded, blockedStories, currentStories, passIndex } from './story-briefs.mjs'
import { publishResearch } from './publish-research.mjs'
import { deriveRun } from '../../domain/journal/run-state.mjs'

export const architectureCheckpoint = async (context, next) => {
  if (next.node?.id === 'design') return researchCheckpoint(context)
  if (next.node?.id !== 'design_review') return null
  const stories = currentStories(context.journal.events)
  const blocked = await blockedStories(context.deps, context.slug, stories)
  if (!blocked.ok || blocked.stories.length === 0) return null
  return consentToExclusions(context, blocked.stories)
}

const researchCheckpoint = async (context) => {
  const result = await publishResearch(context)
  return result.ok ? null : stopped(context.slug, 'research-publication-failed', result.reason)
}

const consentToExclusions = async ({ deps, slug, journal }, stories) => {
  const hash = await deps.hasher.sha256(JSON.stringify(stories))
  const key = `architecture-blocked-${passIndex(journal.events)}-${hash.slice(0, 12)}`
  const text = `The solution architect blocked these stories: ${stories.map(({ issue, reason }) => `#${issue}: ${reason}`).join('; ')}. Continue without them or stop? Use /skraft-refine for excluded stories.`
  const question = await contextQuestion(journal, { key, kind: 'architecture-blocked', text, step: 'design_review' })
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
  const failures = await acceptedBriefFailures(deps, nextPass(journal.events) === 'NEXT' ? stories : allIncluded(journal.events), baseSha)
  if (failures.length > 0) return { environment: failures.join('; ') }
  return recordArchitecturePass({ deps, slug, journal, visit, stories })
}

const recordArchitecturePass = async ({ deps, slug, journal, visit, stories }) => {
  await journal.append('architecture.pass-completed', { architectureVisit: visit, stories, next: nextPass(journal.events) })
  const following = currentStories(journal.events)
  await deps.files.write(slug, 'plans/architecture-pass.json', `${JSON.stringify({ stories: following }, null, 2)}\n`)
  return answered(following.length > 0 ? 'NEXT' : 'COMPLETE')
}

const includedStories = async (deps, slug, events) => {
  const stories = currentStories(events)
  const blocked = await blockedStories(deps, slug, stories)
  if (!blocked.ok) return []
  return stories.filter(({ number }) => !blocked.stories.some((item) => item.issue === number))
}

const nextPass = (events) => (events.find((event) => event.type === 'architecture.scope')?.stories.length > (passIndex(events) + 1) * 20 ? 'NEXT' : 'COMPLETE')
const answered = (answer) => ({ answered: { answer, reason: 'The engine accounted for every story in this architecture pass.' } })
