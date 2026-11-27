// Executes a reviewed handoff on Azure DevOps Boards through `az`, idempotently: every work item
// it creates carries a marker in its description and the `skraft-backlog` tag, so a second run
// finds it and creates nothing twice.
//
// The hierarchy follows the project's process, read before any write: one Epic for the PRD, one
// Feature per epic of the story map, one requirement per story (User Story under Agile, Product
// Backlog Item under Scrum, Requirement under CMMI). A process without Feature (Basic) has no
// PRD level: an epic is an Epic, a story an Issue. A milestone is an iteration that already
// exists; a missing one is created only when the human checked it in the handoff, and when it
// cannot be, the items carry a `milestone/<title>` tag and the report says to create it by hand.
import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'

import { PublishBlocked, ghCli } from './publish.mjs'
import { leaksOf } from './render.mjs'

/** The marker a work item carries: plain text, which the description sanitizer keeps. */
export const BOARDS_MARKER = /skraft-backlog:item=([A-Za-z0-9._-]+)/
const markerLine = (id) => `<p><sub>skraft-backlog:item=${id}</sub></p>`

/** The developer signs in once, in a terminal; skraft never does and never reads a token. */
export const SIGN_IN = 'az cannot read the Azure DevOps project: sign in once in a terminal with `az login` (a guest of the organization: `az devops login` with a PAT; an automation: AZURE_DEVOPS_EXT_PAT), check the azure-devops extension (`az extension add --name azure-devops`) and the organization/project, then run again'

/** The requirement type of each process, in the order a project is tried. */
const REQUIREMENT_TYPES = Object.freeze(['User Story', 'Product Backlog Item', 'Requirement', 'Issue'])

/**
 * @typedef {{ status: number, stdout: string, stderr: string }} AzResult
 * @typedef {(args: string[], input?: string) => AzResult | Promise<AzResult>} AzRun
 * @typedef {{ org: string, project: string }} BoardsTarget
 * @typedef {{ epic: string | null, feature: string, story: string }} Hierarchy
 *   epic: the type of the PRD's item, null when the process has no Feature level
 * @typedef {import('./publish.mjs').OperationLog} OperationLog
 * @typedef {{ binding: string, mapping: Record<string, string>, operations: OperationLog[], failed: number, skipped: number,
 *   hierarchy: Hierarchy | null, iterations: { title: string, status: 'existing' | 'created' | 'tagged', detail: string }[] }} BoardsReport
 */

/**
 * An `az` runner over argv arrays, never a shell. Under Windows `az` is `az.cmd`, which only
 * cmd.exe can start and whose quoting would mangle a description: the runner starts the Python
 * that `az.cmd` wraps (`<CLI2>\\python.exe -IBm azure.cli`), as `az.cmd` itself does.
 * @param {string | undefined} cwd @param {{ signal?: AbortSignal, platform?: NodeJS.Platform, path?: string }} [options]
 * @returns {AzRun}
 */
export const azCli = (cwd, { signal, platform = process.platform, path = process.env.PATH ?? '' } = {}) => {
  if (platform !== 'win32') return ghCli(cwd, { signal, program: 'az' })
  const wrapper = path.split(delimiter).map((dir) => join(dir, 'az.cmd')).find((file) => existsSync(file))
  const python = wrapper ? join(dirname(wrapper), '..', 'python.exe') : null
  if (!python || !existsSync(python)) return () => ({ status: 1, stdout: '', stderr: 'az.cmd and its python.exe were not found on the PATH' })
  const run = ghCli(cwd, { signal, program: python, platform })
  return (args, input) => run(['-IBm', 'azure.cli', ...args], input)
}

/** The organization and project of an Azure DevOps remote URL, or null. @param {string} url @returns {BoardsTarget | null} */
export const boardsTargetOf = (url) => {
  const text = url.trim()
  const patterns = [
    /^https:\/\/(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/[^/]+\/?$/i,
    /^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/[^/]+$/i,
    /^https:\/\/([^./]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/[^/]+\/?$/i,
    /^[^@]+@vs-ssh\.visualstudio\.com:v3\/([^/]+)\/([^/]+)\/[^/]+$/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (match) return { org: decodeURIComponent(match[1]), project: decodeURIComponent(match[2]) }
  }
  return null
}

/** The organization URL `az` takes. @param {BoardsTarget} target */
const orgUrl = (target) => `https://dev.azure.com/${encodeURIComponent(target.org)}`

/** @param {AzResult} result */
const parsed = (result) => {
  try { return JSON.parse(result.stdout || 'null') } catch { return null }
}

/**
 * The Azure Boards calls the publisher needs, over an `az` runner (argv array, never a shell).
 * Every refusal carries a reason fixed by code, never `az` or Azure DevOps text.
 * @param {AzRun} run @param {BoardsTarget} target
 */
export const createBoards = (run, target) => {
  const scope = ['--org', orgUrl(target)]
  const project = [...scope, '--project', target.project]
  /** @param {string[]} args @param {string} what */
  const json = async (args, what) => {
    const result = await run([...args, '--output', 'json'])
    if (result.status !== 0) throw new PublishBlocked(`az: ${what} failed`)
    return parsed(result)
  }
  return Object.freeze({
    /** The work item types of the project. */
    types: async () => {
      const result = await run(['devops', 'invoke', ...scope, '--area', 'wit', '--resource', 'workitemtypes',
        '--route-parameters', `project=${target.project}`, '--api-version', '7.1', '--output', 'json'])
      if (result.status !== 0) throw new PublishBlocked(SIGN_IN)
      return (parsed(result)?.value ?? []).map((t) => t.name)
    },
    /** Every work item tagged skraft-backlog, with its description. */
    tagged: async () => (await json(['boards', 'query', ...project, '--wiql',
      `SELECT [System.Id], [System.Description] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.Tags] CONTAINS 'skraft-backlog'`], 'reading the skraft work items')) ?? [],
    /** The iterations of the project, as nodes with a name and a path. */
    iterations: async () => json(['boards', 'iteration', 'project', 'list', ...project, '--depth', '10'], 'reading the iterations'),
    /** Dates are left to the team: Azure DevOps takes a finish date only with a start date. @param {{ name: string }} iteration */
    createIteration: async ({ name }) => {
      const result = await run(['boards', 'iteration', 'project', 'create', ...project, '--name', name, '--output', 'json'])
      return result.status === 0
    },
    /** @param {{ type: string, title: string, description: string, fields: string[] }} item */
    create: async ({ type, title, description, fields }) => {
      const result = await run(['boards', 'work-item', 'create', ...project, '--type', type, '--title', title, '--description', description,
        ...(fields.length ? ['--fields', ...fields] : []), '--output', 'json'])
      return result.status === 0 ? { ok: true, id: Number(parsed(result)?.id) } : { ok: false, id: 0 }
    },
    /** @param {number} id @param {'parent' | 'predecessor'} relation @param {number} target */
    relate: async (id, relation, targetId) => {
      const result = await run(['boards', 'work-item', 'relation', 'add', ...scope, '--id', String(id), '--relation-type', relation, '--target-id', String(targetId), '--output', 'json'])
      if (result.status === 0) return 'linked'
      return /already exists|already has|relation exists/i.test(`${result.stderr}${result.stdout}`) ? 'linked' : 'failed'
    },
  })
}

/** The hierarchy the project's process allows. @param {string[]} types @returns {Hierarchy} */
export const hierarchyOf = (types) => {
  const story = REQUIREMENT_TYPES.find((type) => types.includes(type))
  if (!story) throw new PublishBlocked('az: the project offers no requirement type (User Story, Product Backlog Item, Requirement or Issue)')
  if (types.includes('Feature') && types.includes('Epic')) return { epic: 'Epic', feature: 'Feature', story }
  if (types.includes('Epic')) return { epic: null, feature: 'Epic', story }
  throw new PublishBlocked('az: the project offers no Epic type')
}

/**
 * @param {{
 *   plan: import('./handoff.mjs').Plan, target: BoardsTarget, boards: ReturnType<typeof createBoards>,
 *   prd: { id: string, title: string, body: string }, createIterations: boolean, dryRun?: boolean,
 *   once?: <T>(key: string, produce: () => T) => Promise<T> | T,
 * }} request prd: the PRD's own item, created above the epics when the process has a Feature level;
 *   createIterations: the human checked, in the handoff, that missing iterations may be created
 * @returns {Promise<BoardsReport>}
 */
export const publishToBoards = async ({ plan, target, boards, prd, createIterations, dryRun = false, once = (_key, produce) => produce() }) => {
  const report = /** @type {BoardsReport} */ ({ binding: `${target.org}/${target.project}`, mapping: {}, operations: [], failed: 0, skipped: 0, hierarchy: null, iterations: [] })
  const log = (ref, status, detail) => {
    report.operations.push({ ref, status, detail })
    if (status === 'failed') report.failed += 1
    if (status === 'skipped') report.skipped += 1
  }
  const hierarchy = hierarchyOf(await boards.types())
  report.hierarchy = hierarchy
  const existing = existingWorkItems(await boards.tagged())
  const iterations = await iterationPaths(boards, target, plan, { createIterations, dryRun, report, once })
  const ids = /** @type {Map<string, number>} */ (new Map(existing))
  const temps = new Map(plan.issues.map((i) => [i.temp, i.id]))
  const items = hierarchy.epic ? [{ ref: 'WI000', temp: '', kind: 'prd', id: prd.id, title: prd.title, body: prd.body, labels: ['skraft-backlog', 'type/prd'], milestone: null }, ...plan.issues] : plan.issues
  for (const item of items) {
    const found = ids.get(item.id)
    const outcome = found ? { status: 'existing', id: found }
      : dryRun ? { status: 'dry-run', id: 0 }
        : await once(`boards-create-v1:${item.id}`, () => createItem(boards, item, { hierarchy, ids, temps, iterations }))
    if (outcome.id) ids.set(item.id, outcome.id)
    if (outcome.id && item.temp) report.mapping[item.temp] = `#${outcome.id}`
    log(item.ref, outcome.status, outcome.id ? `${item.id} → #${outcome.id}` : `${item.id}${outcome.detail ? `: ${outcome.detail}` : ''}`)
  }
  const links = [
    ...(hierarchy.epic ? plan.issues.filter((i) => i.kind === 'epic').map((i, n) => ({ ref: `WL${String(n + 1).padStart(3, '0')}`, type: 'sub-issue', from: prd.id, to: i.id })) : []),
    ...plan.links,
  ]
  for (const link of links) {
    const outcome = dryRun ? { status: 'dry-run', detail: `${link.from} ${link.type} ${link.to}` }
      : await once(`boards-link-v1:${link.type}:${link.from}:${link.to}`, () => linkItems(boards, link, ids))
    log(link.ref, outcome.status, outcome.detail)
  }
  return report
}

/** The work items skraft created, by the id their marker names. @param {any[]} items @returns {Map<string, number>} */
const existingWorkItems = (items) => {
  const found = new Map()
  for (const item of items) {
    const id = BOARDS_MARKER.exec(String(item?.fields?.['System.Description'] ?? ''))?.[1]
    if (id && !found.has(id)) found.set(id, Number(item.id))
  }
  return found
}

/**
 * The iteration path of each planned milestone, by its id; a milestone without one gets a tag.
 * @param {ReturnType<typeof createBoards>} boards @param {BoardsTarget} target @param {import('./handoff.mjs').Plan} plan
 * @param {{ createIterations: boolean, dryRun: boolean, report: BoardsReport, once: Function }} context
 * @returns {Promise<Map<string, { path: string } | { tag: string }>>}
 */
const iterationPaths = async (boards, target, plan, { createIterations, dryRun, report, once }) => {
  if (!plan.milestones.length) return new Map()
  const known = pathsByName(await boards.iterations())
  const paths = new Map()
  for (const milestone of plan.milestones) {
    let path = known.get(milestone.title)
    if (!path && createIterations && !dryRun) {
      const created = await once(`boards-iteration-v1:${milestone.title}`, () => boards.createIteration({ name: milestone.title }))
      if (created) path = `${target.project}\\${milestone.title}`
      report.iterations.push(created ? { title: milestone.title, status: 'created', detail: `iteration ${milestone.title} created` }
        : { title: milestone.title, status: 'tagged', detail: `iteration ${milestone.title} could not be created (rights?): create it by hand, then resume; the items carry the tag milestone/${milestone.title}` })
    } else if (!path) {
      report.iterations.push({ title: milestone.title, status: 'tagged', detail: `iteration ${milestone.title} does not exist: check its box in the handoff to create it, or create it by hand, then resume; the items carry the tag milestone/${milestone.title}` })
    } else report.iterations.push({ title: milestone.title, status: 'existing', detail: `iteration ${path}` })
    paths.set(milestone.id, path ? { path } : { tag: `milestone/${milestone.title}` })
  }
  return paths
}

/** Every iteration node by its name, as the `System.IterationPath` value (`Project\\Sprint 1`). @param {any} root */
const pathsByName = (root) => {
  const found = new Map()
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    const path = String(node.path ?? '').replace(/^\\+/, '').split('\\').filter((part, index) => !(index === 1 && part === 'Iteration'))
    if (node.name && path.length > 1 && !found.has(node.name)) found.set(node.name, path.join('\\'))
    for (const child of node.children ?? []) visit(child)
  }
  for (const node of Array.isArray(root) ? root : [root]) visit(node)
  return found
}

/**
 * @param {ReturnType<typeof createBoards>} boards @param {any} item
 * @param {{ hierarchy: Hierarchy, ids: Map<string, number>, temps: Map<string, string>, iterations: Map<string, { path: string } | { tag: string }> }} known
 */
const createItem = async (boards, item, { hierarchy, ids, temps, iterations }) => {
  const body = resolveTemps(item.body, ids, temps)
  if (body === null) return { status: 'skipped', id: 0, detail: 'a {{TEMP-N}} could not be resolved' }
  const leaks = leaksOf(body)
  if (leaks.length) return { status: 'skipped', id: 0, detail: `the body carries ${leaks.join(', ')}` }
  const iteration = item.milestone ? iterations.get(item.milestone) : undefined
  const tags = [...item.labels, ...(iteration && 'tag' in iteration ? [iteration.tag] : [])]
  const fields = [`System.Tags=${tags.join('; ')}`, ...(iteration && 'path' in iteration ? [`System.IterationPath=${iteration.path}`] : [])]
  const type = item.kind === 'prd' ? /** @type {string} */ (hierarchy.epic) : item.kind === 'epic' ? hierarchy.feature : hierarchy.story
  const answer = await boards.create({ type, title: plainTitle(item.title), description: `${htmlOf(body)}\n${markerLine(item.id)}`, fields })
  return answer.ok ? { status: 'created', id: answer.id } : { status: 'failed', id: 0, detail: `az could not create the ${type}` }
}

/** The GitHub title prefix (`feat(ep-001): `) is a commit convention, not a work item title. @param {string} title */
const plainTitle = (title) => title.replace(/^[a-z]+\([^)]*\):\s*/, '')

/** @param {ReturnType<typeof createBoards>} boards @param {{ type: string, from: string, to: string }} link @param {Map<string, number>} ids */
const linkItems = async (boards, link, ids) => {
  const from = ids.get(link.from)
  const to = ids.get(link.to)
  const detail = `${link.from} ${link.type} ${link.to}`
  if (!from || !to) return { status: 'skipped', detail: `${detail}: an end does not exist` }
  const status = link.type === 'sub-issue' ? await boards.relate(to, 'parent', from) : await boards.relate(from, 'predecessor', to)
  return { status, detail: status === 'linked' ? `#${from} ${link.type} #${to}` : `${detail}: az could not link them` }
}

/** @param {string} body @param {Map<string, number>} ids @param {Map<string, string>} temps */
const resolveTemps = (body, ids, temps) => {
  let unresolved = false
  const resolved = body.replace(/\{\{TEMP-\d+\}\}/g, (temp) => {
    const id = ids.get(temps.get(temp) ?? '')
    if (!id) unresolved = true
    return id ? `#${id}` : temp
  }).replace(/<!-- skraft-backlog:item=[^\s]+ -->\n?/g, '')
  return unresolved ? null : resolved
}

// ── Markdown to the HTML a work item description holds ───────────────────────────────────────

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (text) => escape(text)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')

/**
 * Headings, bullet and numbered lists, fenced code, tables kept as text, paragraphs: what the
 * story bodies use. Anything else stays escaped text.
 * @param {string} markdown @returns {string}
 */
export const htmlOf = (markdown) => {
  const out = []
  let list = null
  let fence = null
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null } }
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      if (fence) { out.push(`<pre>${escape(fence.join('\n'))}</pre>`); fence = null } else { closeList(); fence = [] }
      continue
    }
    if (fence) { fence.push(line); continue }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (heading) { closeList(); out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`) }
    else if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol'
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind }
      out.push(`<li>${inline((bullet ?? numbered)[1])}</li>`)
    } else if (line.trim()) { closeList(); out.push(`<p>${inline(line.trim())}</p>`) }
    else closeList()
  }
  closeList()
  if (fence) out.push(`<pre>${escape(fence.join('\n'))}</pre>`)
  return out.join('\n')
}

/**
 * The work item each published story became.
 * @param {import('./handoff.mjs').Plan} plan @param {BoardsReport} report @param {BoardsTarget} target
 * @returns {Record<string, { number: number, url: string }>}
 */
export const publishedWorkItems = (plan, report, target) => Object.fromEntries(plan.issues
  .filter((issue) => issue.kind === 'story' && report.mapping[issue.temp])
  .map((issue) => {
    const number = Number(report.mapping[issue.temp].slice(1))
    return [issue.id, { number, url: `${orgUrl(target)}/${encodeURIComponent(target.project)}/_workitems/edit/${number}` }]
  }))
