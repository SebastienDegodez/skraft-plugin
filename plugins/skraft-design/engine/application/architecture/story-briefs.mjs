import { adrStatus, briefProblem, citedPaths, freshnessOf, isBriefPath, readBrief } from '../../domain/architecture/brief.mjs'

export const architectureEvents = async (deps, slug) => (await deps.journal.lines(slug)).map((line) => JSON.parse(line))
export const passIndex = (events) => events.filter((event) => event.type === 'architecture.pass-completed').length
export const currentStories = (events) => {
  const included = new Set(allIncluded(events).map(({ number }) => number))
  return (events.find((event) => event.type === 'architecture.scope')?.stories ?? [])
    .slice(passIndex(events) * 20, (passIndex(events) + 1) * 20).filter(({ number }) => included.has(number))
}
export const allIncluded = (events) => {
  const excluded = events.filter((event) => event.type === 'architecture.excluded').flatMap((event) => event.stories.map(({ issue }) => issue))
  return (events.find((event) => event.type === 'architecture.scope')?.stories ?? []).filter(({ number }) => !excluded.includes(number))
}

export const blockedStories = async (deps, slug, stories) => {
  const text = await deps.files.read(slug, 'details/blocked-stories.json')
  if (text === null) return { ok: true, stories: [] }
  try {
    const blocked = JSON.parse(text)
    if (!Array.isArray(blocked) || !blocked.every((item) => stories.some(({ number }) => item.issue === number) && typeof item.reason === 'string' && item.reason.trim() !== '')) return { ok: false }
    return { ok: true, stories: blocked }
  } catch {
    return { ok: false }
  }
}

export const storyBriefFailures = async (deps, slug) => {
  const events = await architectureEvents(deps, slug)
  const stories = currentStories(events)
  const blocked = await blockedStories(deps, slug, stories)
  if (!blocked.ok) return ['details/blocked-stories.json must list only this pass\'s blocked stories and their reasons.']
  const failures = []
  for (const story of stories.filter(({ number }) => !blocked.stories.some((item) => item.issue === number))) failures.push(...await storyFailures(deps, story))
  return failures
}

const storyFailures = async (deps, story) => {
  const files = await deps.workspace.list('docs/architecture/stories')
  const matches = (files ?? []).filter(({ kind, name }) => kind === 'file' && isBriefPath(`docs/architecture/stories/${name}`, story.number))
  if (matches.length !== 1) return [`Story #${story.number} needs exactly one architecture brief or an explicit blocked reason.`]
  const path = `docs/architecture/stories/${matches[0].name}`
  const text = await deps.workspace.read(path)
  const brief = readBrief(text)
  if (brief === null) return [`${path}: the brief is unreadable: ${briefProblem(text)}.`]
  if (freshnessOf(brief, story) !== 'current') return [headerFailure(path, brief, story)]
  return dependenciesExist(deps, brief)
}

const HEADER_FIELDS = ['issue', 'forge', 'repository', 'bodySha256']

const headerFailure = (path, brief, story) => {
  const wrong = HEADER_FIELDS.filter((field) => brief[field] !== (field === 'issue' ? story.number : story[field]))
  const expected = wrong.map((field) => `${field}=${JSON.stringify(field === 'issue' ? story.number : story[field])}`).join(', ')
  return `${path}: the brief header does not match the engine's identity; copy exactly ${expected}.`
}

const dependenciesExist = async (deps, brief) => {
  const failures = []
  for (const path of citedPaths(brief)) if ((await deps.workspace.read(path)) === null) failures.push(`${path}: an architecture dependency is missing.`)
  return failures
}

export const acceptedBriefFailures = async (deps, stories, baseSha) => {
  const failures = []
  for (const story of stories) failures.push(...await acceptedStory(deps, story, baseSha))
  return failures
}

const acceptedStory = async (deps, story, baseSha) => {
  const files = await deps.workspace.list('docs/architecture/stories')
  const path = (files ?? []).map(({ name }) => `docs/architecture/stories/${name}`).find((name) => isBriefPath(name, story.number))
  const brief = path ? readBrief(await deps.workspace.read(path)) : null
  if (brief === null) return [`Story #${story.number} has no valid brief to publish.`]
  const failures = []
  for (const adr of brief.adrs) if (!await acceptedOrNewProposal(deps, adr, baseSha)) failures.push(`${adr}: cite an Accepted ADR or a new Proposed ADR from this design run.`)
  return failures
}

const acceptedOrNewProposal = async (deps, path, baseSha) => {
  const status = adrStatus(await deps.workspace.read(path))
  if (status === 'Accepted') return true
  if (status !== 'Proposed' || baseSha === null) return false
  return !await deps.sourceControl.existsAt('.', baseSha, path)
}
