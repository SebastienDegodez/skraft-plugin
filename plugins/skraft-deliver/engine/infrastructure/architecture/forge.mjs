import { STORY_TYPES, workItemReading } from '../../domain/pipeline/work-item.mjs'
import { remoteOf, run as azureRun, readJson, succeeded, QUIET } from '../code-host/az-cli.mjs'
import { RESEARCH_MARKER } from '../../domain/architecture/research.mjs'
import { readOwnComments } from '../code-host/az-boards.mjs'
import { azureRepositoryKeyOf } from '../../domain/config/azure-remote.mjs'

const failed = (reason) => ({ ok: false, code: 'forge-unreadable', reason })
const parse = (answer) => succeeded(answer) ? readJson(answer.stdout) : null
const gh = (deps, args) => deps.commandRunner.run({ argv: ['gh', ...args], cwd: '.', timeoutMs: 120_000 })

export const createArchitectureForge = (deps) => Object.freeze({
  read: (number) => read(deps, number),
  descendants: (number) => descendants(deps, number),
  research: (number) => research(deps, number),
})

const read = async (deps, number) => {
  const unavailable = await deps.codeHost.unavailable()
  if (unavailable !== null) return failed(unavailable)
  const repository = await repositoryOf(deps)
  if (repository === null) return failed('The configured forge names no repository.')
  return deps.forge === 'azure-devops' ? azureIssue(deps, repository, number) : githubIssue(deps, repository, number)
}

const repositoryOf = async (deps) => {
  if (deps.forge !== 'azure-devops') return deps.codeHost.repository()
  const remote = await remoteOf(deps.commandRunner)
  return remote === null ? null : azureRepositoryKeyOf(remote)
}
const githubIdentity = ({ host, repository }) => host.toLowerCase() === 'github.com' ? repository : `${host.toLowerCase()}/${repository}`

const githubIssue = async (deps, repository, number) => {
  const item = parse(await gh(deps, ['api', `--hostname=${repository.host}`, `repos/${repository.repository}/issues/${number}`]))
  if (!item || item.pull_request || item.number !== number || typeof item.body !== 'string' || typeof item.title !== 'string') return failed('GitHub did not return a readable issue.')
  const labels = (item.labels ?? []).map((label) => typeof label === 'string' ? label : label.name)
  return { ok: true, issue: { number, title: item.title, body: item.body, url: item.html_url, labels, story: true, forge: 'github', repository: githubIdentity(repository) } }
}

const azureItem = async (deps, number) => {
  const remote = await remoteOf(deps.commandRunner)
  if (remote === null) return null
  const answer = await azureRun(deps.commandRunner, ['az', 'boards', 'work-item', 'show', `--id=${number}`, '--expand=relations', `--organization=${remote.organization}`, ...QUIET])
  return { remote, item: parse(answer) }
}

const azureIssue = async (deps, repository, number) => {
  const fetched = await azureItem(deps, number)
  if (!fetched?.item) return failed('Azure DevOps did not return a readable work item.')
  const { item, remote } = fetched
  const type = item.fields?.['System.WorkItemType']
  if (![...STORY_TYPES, 'Epic', 'Feature'].includes(type)) return failed('The work item is neither a supported story, an Epic nor a Feature.')
  const reading = workItemReading({ number, ...remote }, { ...item, fields: { ...item.fields, 'System.WorkItemType': 'Issue' } })
  if (reading?.read !== 'issue') return failed('The work item is unreadable or belongs to another project.')
  return { ok: true, issue: { ...reading.issue, labels: String(item.fields['System.Tags'] ?? '').split(';').map((tag) => tag.trim()), story: STORY_TYPES.includes(type), forge: 'azure-devops', repository: repository.repository } }
}

const children = async (deps, number) => {
  if (deps.forge === 'azure-devops') return azureChildren(deps, number)
  const repository = await deps.codeHost.repository()
  if (repository === null) return null
  const pages = parse(await gh(deps, ['api', `--hostname=${repository.host}`, '--paginate', '--slurp', `repos/${repository.repository}/issues/${number}/sub_issues?per_page=100`]))
  return Array.isArray(pages) && pages.every(Array.isArray) ? pages.flat().map((issue) => issue.number) : null
}

const azureChildren = async (deps, number) => {
  const fetched = await azureItem(deps, number)
  if (!fetched?.item || !Array.isArray(fetched.item.relations ?? [])) return null
  return (fetched.item.relations ?? []).filter((relation) => relation.rel === 'System.LinkTypes.Hierarchy-Forward')
    .map((relation) => Number(/\/workItems\/(\d+)$/i.exec(relation.url)?.[1]))
}

const descendants = async (deps, number) => {
  const traversal = { queue: [number], seen: new Set(), stories: [] }
  while (traversal.queue.length > 0) {
    const found = await visitDescendant(deps, traversal, number)
    if (!found.ok) return found
  }
  return { ok: true, stories: traversal.stories }
}

const visitDescendant = async (deps, traversal, root) => {
  const number = traversal.queue.shift()
  if (traversal.seen.has(number)) return { ok: true }
  if (traversal.seen.size >= 1000) return failed('The epic exceeds the 1000-item discovery limit.')
  traversal.seen.add(number)
  const found = await descendant(deps, number, number === root)
  if (!found.ok) return found
  traversal.stories.push(...found.stories)
  traversal.queue.push(...found.children)
  return { ok: true }
}

const descendant = async (deps, number, root) => {
  const found = await read(deps, number)
  if (!found.ok) return found
  if (nativeStory(deps, found.issue, root)) return { ok: true, children: [], stories: [found.issue] }
  const ids = await children(deps, number)
  if (ids === null || !ids.every((id) => Number.isSafeInteger(id) && id > 0)) return failed('The epic hierarchy could not be read.')
  return { ok: true, children: ids, stories: !root && ids.length === 0 && found.issue.story ? [found.issue] : [] }
}

const nativeStory = (deps, issue, root) => !root && deps.forge === 'azure-devops' && issue.story
const research = async (deps, number) => deps.forge === 'azure-devops' ? azureResearch(deps, number) : githubResearch(deps, number)

const githubResearch = async (deps, number) => {
  const repository = await deps.codeHost.repository()
  if (repository === null) return failed('Research comments could not be read.')
  const user = parse(await gh(deps, ['api', `--hostname=${repository.host}`, 'user']))
  const pages = parse(await gh(deps, ['api', `--hostname=${repository.host}`, '--paginate', '--slurp', `repos/${repository.repository}/issues/${number}/comments?per_page=100`]))
  if (typeof user?.login !== 'string' || !Array.isArray(pages) || !pages.every(Array.isArray)) return failed('Research comments could not be read.')
  const mine = pages.flat().filter((comment) => comment.user?.login === user.login && String(comment.body).startsWith(RESEARCH_MARKER))
  return { ok: true, body: mine.at(-1)?.body ?? null }
}

const azureResearch = async (deps, number) => {
  const own = await readOwnComments(deps.commandRunner, number)
  if (own === null) return failed('Research comments or their authenticated author could not be read completely.')
  const comments = own.filter((comment) => String(comment.text).startsWith(RESEARCH_MARKER))
  return { ok: true, body: comments.at(-1)?.text ?? null }
}
