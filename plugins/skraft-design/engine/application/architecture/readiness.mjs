export const createReadiness = (deps) => Object.freeze({
  check: (request) => check(deps, request),
})

const check = async ({ architectureForge }, request) => {
  const number = request.issue ?? request.epic
  if (!validRequest(request, number)) return invalid()
  const root = await architectureForge.read(number)
  if (!root.ok) return root
  if (!isOpen(root.issue)) return issueNotOpen()
  return checkScope(architectureForge, request, root.issue)
}

const checkScope = async (forge, request, root) => {
  const scope = await scopeOf(forge, request, root)
  if (!scope.ok) return scope
  const open = scope.stories.filter(isOpen)
  const excluded = scope.stories.filter((story) => !isOpen(story)).map(exclusion)
  if (open.length === 0) return noOpenStory(excluded)
  return { ok: true, root, stories: open, excluded, batches: chunks(open) }
}

const scopeOf = (forge, request, issue) => {
  if (request.epic) return forge.descendants(issue.number)
  return issue.story ? { ok: true, stories: [issue] } : { ok: false, code: 'issue-not-a-story', reason: 'Choose a story issue, or use the epic input to discover stories.' }
}
const invalid = () => ({ ok: false, code: 'invalid-scope', reason: 'Choose exactly one positive issue or epic number.' })
const validRequest = (request, number) => Number.isSafeInteger(number) && number > 0 && Boolean(request.issue) !== Boolean(request.epic)
const isOpen = ({ state }) => state === 'open'
const issueNotOpen = () => ({ ok: false, code: 'issue-not-open', reason: 'The selected issue is not open.' })
const noOpenStory = (excluded) => ({ ok: false, code: 'no-open-story', reason: 'No open story is available for design.', excluded })
const exclusion = ({ number }) => ({ issue: number, reason: 'Issue is not open; omit it.' })
const chunks = (stories) => Array.from({ length: Math.ceil(stories.length / 20) }, (_, index) => stories.slice(index * 20, index * 20 + 20))
