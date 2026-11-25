import { createInit } from '../pipeline/init-usecase.mjs'
import { openActiveRun } from '../pipeline/active-run.mjs'
import { createReadiness } from './readiness.mjs'
import { normalBody } from '../../domain/architecture/brief.mjs'
import { stopped } from './context.mjs'
import { runIdentity } from './run-identity.mjs'
import { MODES } from './ci-mode.mjs'

export const createDesignRun = (deps) => Object.freeze({
  start: (request) => start(deps, request),
  prepare: () => prepare(deps),
})

const start = async (deps, request) => {
  const mode = request.mode ?? 'interactive'
  if (!MODES.includes(mode)) return { status: 'refused', ok: false, code: 'invalid-mode', reason: `mode is ${MODES.join(' or ')}.` }
  const scope = await createReadiness(deps).check(request)
  if (!scope.ok) return { status: 'refused', ...scope }
  const identity = await runIdentity(deps, `${request.epic ? 'epic' : 'issue'}-${scope.root.number}`)
  if (!identity.ok) return { status: 'refused', ...identity }
  const { slug } = identity
  const branched = await deps.architectureRepository.branch({ name: `design/${slug}`, existing: identity.existing })
  if (!branched.ok) return { status: 'refused', ...branched }
  return initializeScope(deps, slug, { ...scope, mode })
}

const initializeScope = async (deps, slug, scope) => {
  const initialized = await createInit({ ...deps, initialIssue: scope.root }).init({ slug, story: { issue: scope.root.number, title: scope.root.title } })
  if (!initialized.ok) return { status: 'refused', ...initialized }
  const opened = await openActiveRun(deps, slug)
  if (!opened.ok) return opened.outcome
  if (!opened.journal.events.some((event) => event.type === 'architecture.scope')) await keepScope(deps, opened, scope)
  return prepare(deps)
}

const keepScope = async (deps, { slug, journal }, scope) => {
  const stories = []
  for (const story of scope.stories) stories.push({ ...story, bodySha256: await deps.hasher.sha256(normalBody(story.body)) })
  await journal.append('architecture.scope', { root: scope.root, stories, excluded: scope.excluded, batchSize: 20, mode: scope.mode })
}

const prepare = async (deps) => {
  const opened = await openActiveRun(deps, null)
  if (!opened.ok) return opened.outcome
  const scope = opened.journal.events.find((event) => event.type === 'architecture.scope')
  if (!scope) return stopped(opened.slug, 'architecture-scope-missing', 'Start design with an issue or epic first.')
  const binding = await bindScope(deps, opened, scope)
  if (binding) return binding
  // A closed story of the epic is left out without asking: the scope keeps it, the pull request lists it.
  return { status: 'ready', slug: opened.slug }
}

const bindScope = async (deps, { slug, journal }, scope) => {
  if (journal.events.some((event) => event.type === 'architecture.bound')) return null
  const previous = await deps.architectureForge.research(scope.root.number)
  if (!previous.ok) return stopped(slug, 'research-unreadable', 'The previous research comment could not be read; restore forge access and resume.')
  await deps.files.write(slug, 'plans/architecture-scope.json', JSON.stringify(scope, null, 2))
  await deps.files.write(slug, 'plans/architecture-pass.json', JSON.stringify({ stories: scope.stories.slice(0, 20) }, null, 2))
  await deps.files.write(slug, 'plans/prior-research.md', previous.body ?? 'No previous research comment.')
  await journal.append('architecture.bound', { artifacts: ['plans/architecture-scope.json', 'plans/architecture-pass.json', 'plans/prior-research.md'] })
  return null
}
