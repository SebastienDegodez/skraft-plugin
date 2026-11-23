export const createReadiness = (deps) => Object.freeze({
  check: (request) => check(deps, request),
})

const check = async ({ architectureForge }, request) => {
  const number = request.issue ?? request.epic
  if (!validRequest(request, number)) return invalid()
  const root = await architectureForge.read(number)
  if (!root.ok) return root
  const scope = await scopeOf(architectureForge, request, root.issue)
  if (!scope.ok) return scope
  const ready = scope.stories.filter((story) => story.labels.includes('status/ready'))
  const excluded = scope.stories.filter((story) => !story.labels.includes('status/ready')).map(exclusion)
  if (ready.length === 0) return { ok: false, code: 'story-not-ready', reason: 'No ready story. Refine or split the stories with /skraft-refine.', excluded }
  return { ok: true, root: root.issue, stories: ready, excluded, batches: chunks(ready) }
}

const scopeOf = (forge, request, issue) => {
  if (request.epic) return forge.descendants(issue.number)
  return issue.story ? { ok: true, stories: [issue] } : { ok: false, code: 'issue-not-a-story', reason: 'Choose a story issue, or use the epic input to discover stories.' }
}
const invalid = () => ({ ok: false, code: 'invalid-scope', reason: 'Choose exactly one positive issue or epic number.' })
const validRequest = (request, number) => Number.isSafeInteger(number) && number > 0 && Boolean(request.issue) !== Boolean(request.epic)
const exclusion = ({ number }) => ({ issue: number, reason: 'Missing status/ready; use /skraft-refine.' })
const chunks = (stories) => Array.from({ length: Math.ceil(stories.length / 20) }, (_, index) => stories.slice(index * 20, index * 20 + 20))
