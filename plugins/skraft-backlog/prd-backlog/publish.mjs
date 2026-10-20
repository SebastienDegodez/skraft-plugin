// Executes a reviewed handoff on GitHub, idempotently: every issue it creates carries a hidden
// marker, so a second run finds it and creates nothing twice. Before the first write it binds
// every operation to the confirmed repository (HVE destination binding); a `{{TEMP-N}}` that
// cannot be resolved skips its operation instead of reaching GitHub.
import { spawnSync } from 'node:child_process'
import { MARKER, leaksOf } from './render.mjs'

/**
 * @typedef {{ status: number, stdout: string, stderr: string }} GhResult
 * @typedef {(args: string[], input?: string) => GhResult} GhRun
 * @typedef {{ ok: true, data: any } | { ok: false, status: number, message: string }} ApiResult
 */

/** `gh` with an argv array, never a shell string. @returns {GhRun} */
export const ghCli = (cwd) => (args, input) => {
  const result = spawnSync('gh', args, { cwd, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? (result.error?.message ?? '') }
}

/**
 * The GitHub REST calls the publisher needs, over a `gh` runner.
 * @param {GhRun} run
 */
export const createGitHub = (run) => {
  /** @param {string} method @param {string} path @param {object} [body] @returns {ApiResult} */
  const api = (method, path, body) => {
    const args = ['api', '--method', method, '-H', 'Accept: application/vnd.github+json', path]
    const result = body === undefined ? run(args) : run([...args, '--input', '-'], JSON.stringify(body))
    if (result.status === 0) return { ok: true, data: result.stdout.trim() ? JSON.parse(result.stdout) : null }
    return { ok: false, status: httpStatus(result), message: messageOf(result) }
  }
  /** @param {string} path @returns {any[]} */
  const all = (path) => {
    const result = run(['api', '--paginate', '--slurp', '-H', 'Accept: application/vnd.github+json', path])
    if (result.status !== 0) throw new Error(`GET ${path}: ${messageOf(result)}`)
    return JSON.parse(result.stdout || '[]').flat()
  }
  return Object.freeze({ api, all })
}

/** @param {GhResult} result */
const httpStatus = (result) => Number(/HTTP (\d{3})/.exec(result.stderr)?.[1] ?? 0)

/** @param {GhResult} result */
const messageOf = (result) => {
  try {
    const body = JSON.parse(result.stdout)
    return [body.message, ...(body.errors ?? []).map((e) => e.message ?? e.code)].filter(Boolean).join(': ')
  } catch {
    return (result.stderr || result.stdout).trim()
  }
}

/** A link GitHub already holds answers 422; that is the state we asked for. */
const alreadyLinked = (result) => !result.ok && result.status === 422 && /already|exists|duplicate/i.test(result.message)

/**
 * @typedef {{ ref: string, status: 'created' | 'existing' | 'updated' | 'linked' | 'skipped' | 'failed' | 'dry-run', detail: string }} OperationLog
 * @typedef {{ binding: string, mapping: Record<string, string>, operations: OperationLog[], failed: number, skipped: number }} PublishReport
 *   failed: GitHub refused the call; skipped: the call was not sent (an end or a {{TEMP-N}} was missing)
 */

/**
 * @param {{
 *   plan: import('./handoff.mjs').Plan,
 *   repo: string,
 *   github: ReturnType<typeof createGitHub>,
 *   dryRun?: boolean,
 *   once?: <T>(key: string, produce: () => T) => Promise<T> | T,
 * }} request once: journals one operation so a resumed run does not redo it (ctx.step)
 * @returns {Promise<PublishReport>}
 */
export const publish = async ({ plan, repo, github, dryRun = false, once = (_key, produce) => produce() }) => {
  const binding = bindDestination(github, repo)
  const existing = existingItems(github, repo)
  const report = { binding, mapping: /** @type {Record<string, string>} */ ({}), operations: /** @type {OperationLog[]} */ ([]), failed: 0, skipped: 0 }
  const numbers = /** @type {Map<string, { number: number, id: number }>} */ (new Map())
  const log = (ref, status, detail) => {
    report.operations.push({ ref, status, detail })
    if (status === 'failed') report.failed += 1
    if (status === 'skipped') report.skipped += 1
  }
  if (!dryRun) await once('setup-v1', () => setUp(github, repo, plan))
  const milestones = dryRun ? new Map() : milestoneNumbers(github, repo, plan)
  const temps = new Map(plan.issues.map((i) => [i.temp, i.id]))
  for (const issue of plan.issues) {
    const found = existing.get(issue.id)
    const outcome = found ? { status: 'existing', number: found.number, id: found.id }
      : dryRun ? { status: 'dry-run', number: 0, id: 0 }
        : await once(`create-v1:${issue.id}`, () => create(github, repo, issue, { numbers, milestones, temps }))
    if (outcome.number) numbers.set(issue.id, { number: outcome.number, id: outcome.id })
    if (outcome.number) report.mapping[issue.temp] = `#${outcome.number}`
    log(issue.ref, outcome.status, outcome.number ? `${issue.id} → #${outcome.number}` : `${issue.id}${outcome.detail ? `: ${outcome.detail}` : ''}`)
  }
  for (const link of plan.links) {
    const outcome = dryRun ? { status: 'dry-run', detail: `${link.from} ${link.type} ${link.to}` }
      : await once(`link-v1:${link.type}:${link.from}:${link.to}`, () => linkOf(github, repo, link, numbers))
    log(link.ref, outcome.status, outcome.detail)
  }
  return report
}

/**
 * Every operation targets the confirmed repository: the repository must answer under that exact
 * name, and an item already carrying our marker must live there.
 * @param {ReturnType<typeof createGitHub>} github @param {string} repo
 */
const bindDestination = (github, repo) => {
  const answer = github.api('GET', `repos/${repo}`)
  if (!answer.ok) throw new Error(`destination binding: ${repo} cannot be read: ${answer.message}`)
  if (String(answer.data.full_name).toLowerCase() !== repo.trim().toLowerCase()) {
    throw new Error(`destination binding: ${repo} answers as ${answer.data.full_name}`)
  }
  return answer.data.full_name
}

/** @param {ReturnType<typeof createGitHub>} github @param {string} repo */
const existingItems = (github, repo) => {
  const items = new Map()
  for (const issue of github.all(`repos/${repo}/issues?state=all&labels=skraft-backlog&per_page=100`)) {
    const id = MARKER.exec(issue.body ?? '')?.[1]
    if (!id || issue.pull_request) continue
    if (!String(issue.repository_url ?? '').toLowerCase().endsWith(`/repos/${repo.toLowerCase()}`)) {
      throw new Error(`destination binding: ${id} is #${issue.number} of another repository`)
    }
    items.set(id, { number: issue.number, id: issue.id })
  }
  return items
}

/** @param {ReturnType<typeof createGitHub>} github @param {string} repo @param {import('./handoff.mjs').Plan} plan */
const setUp = (github, repo, plan) => {
  const labels = new Set(github.all(`repos/${repo}/labels?per_page=100`).map((l) => l.name))
  for (const label of plan.labels.filter((l) => !labels.has(l.name))) {
    const answer = github.api('POST', `repos/${repo}/labels`, label)
    if (!answer.ok && !alreadyLinked(answer)) throw new Error(`label ${label.name}: ${answer.message}`)
  }
  const milestones = new Set(github.all(`repos/${repo}/milestones?state=all&per_page=100`).map((m) => m.title))
  for (const milestone of plan.milestones.filter((m) => !milestones.has(m.title))) {
    const body = { title: milestone.title, ...(milestone.description ? { description: milestone.description } : {}), ...(milestone.dueOn ? { due_on: `${milestone.dueOn}T23:59:59Z` } : {}) }
    const answer = github.api('POST', `repos/${repo}/milestones`, body)
    if (!answer.ok && !alreadyLinked(answer)) throw new Error(`milestone ${milestone.title}: ${answer.message}`)
  }
  return true
}

/**
 * The GitHub number of each planned milestone, by the map's milestone id.
 * @param {ReturnType<typeof createGitHub>} github @param {string} repo @param {import('./handoff.mjs').Plan} plan
 */
const milestoneNumbers = (github, repo, plan) => {
  const byTitle = new Map(github.all(`repos/${repo}/milestones?state=all&per_page=100`).map((m) => [m.title, m.number]))
  return new Map(plan.milestones.map((m) => [m.id, byTitle.get(m.title)]))
}

/**
 * @param {ReturnType<typeof createGitHub>} github @param {string} repo
 * @param {import('./handoff.mjs').PlannedIssue} issue
 * @param {{ numbers: Map<string, { number: number, id: number }>, milestones: Map<string, number | undefined>, temps: Map<string, string> }} known
 */
const create = (github, repo, issue, { numbers, milestones, temps }) => {
  const body = resolveTemps(issue.body, numbers, temps)
  if (body === null) return { status: 'skipped', number: 0, id: 0, detail: 'a {{TEMP-N}} could not be resolved' }
  const leaks = leaksOf(body)
  if (leaks.length) return { status: 'skipped', number: 0, id: 0, detail: `the body carries ${leaks.join(', ')}` }
  const milestone = issue.milestone ? milestones.get(issue.milestone) : undefined
  if (issue.milestone && !milestone) return { status: 'failed', number: 0, id: 0, detail: `milestone ${issue.milestone} does not exist` }
  const answer = github.api('POST', `repos/${repo}/issues`, { title: issue.title, body, labels: issue.labels, ...(milestone ? { milestone } : {}) })
  if (!answer.ok) return { status: 'failed', number: 0, id: 0, detail: answer.message }
  return { status: 'created', number: answer.data.number, id: answer.data.id }
}

/**
 * Replaces each `{{TEMP-N}}` of the body by the issue it stands for; null when one is unknown.
 * @param {string} body @param {Map<string, { number: number }>} numbers @param {Map<string, string>} temps `{{TEMP-N}}` → item id
 */
const resolveTemps = (body, numbers, temps) => {
  let unresolved = false
  const resolved = body.replace(/\{\{TEMP-\d+\}\}/g, (temp) => {
    const number = numbers.get(temps.get(temp) ?? '')?.number
    if (!number) unresolved = true
    return number ? `#${number}` : temp
  })
  return unresolved ? null : resolved
}

/**
 * @param {ReturnType<typeof createGitHub>} github @param {string} repo
 * @param {{ type: 'sub-issue' | 'blocked-by', from: string, to: string }} link
 * @param {Map<string, { number: number, id: number }>} numbers
 */
const linkOf = (github, repo, link, numbers) => {
  const from = numbers.get(link.from)
  const to = numbers.get(link.to)
  const detail = `${link.from} ${link.type} ${link.to}`
  if (!from || !to) return { status: 'skipped', detail: `${detail}: an end does not exist` }
  const answer = link.type === 'sub-issue'
    ? github.api('POST', `repos/${repo}/issues/${from.number}/sub_issues`, { sub_issue_id: to.id })
    : github.api('POST', `repos/${repo}/issues/${from.number}/dependencies/blocked_by`, { issue_id: to.id })
  if (answer.ok || alreadyLinked(answer)) return { status: 'linked', detail: `#${from.number} ${link.type} #${to.number}` }
  return { status: 'failed', detail: `${detail}: ${answer.message}` }
}

/**
 * The issue each published story became: the stories of the plan whose `{{TEMP-N}}` the report maps.
 * @param {import('./handoff.mjs').Plan} plan @param {PublishReport} report @param {string} repo
 * @returns {Record<string, { number: number, url: string }>}
 */
export const publishedItems = (plan, report, repo) => Object.fromEntries(plan.issues
  .filter((issue) => issue.kind === 'story' && report.mapping[issue.temp])
  .map((issue) => {
    const number = Number(report.mapping[issue.temp].slice(1))
    return [issue.id, { number, url: `https://github.com/${repo}/issues/${number}` }]
  }))

/**
 * The execution record of the HVE contract.
 * @param {PublishReport} report @param {{ slug: string, now: string, dryRun: boolean }} context
 */
export const renderHandoffLogs = (report, { slug, now, dryRun }) => {
  const count = (status) => report.operations.filter((o) => o.status === status).length
  return [
    '<!-- markdownlint-disable-file -->',
    '<!-- markdown-table-prettify-ignore-start -->',
    `# Handoff Logs - ${slug}${dryRun ? ' (dry run)' : ''}`,
    '',
    '## Execution Summary',
    '',
    `* **Status**: ${report.failed + report.skipped ? 'Blocked' : 'Complete'}`,
    `* **Created**: ${count('created')}`,
    `* **Existing**: ${count('existing')}`,
    `* **Linked**: ${count('linked')}`,
    `* **Failed**: ${report.failed}`,
    `* **Skipped**: ${report.skipped}`,
    '',
    '## Destination Binding',
    '',
    `* **Confirmed destination**: ${report.binding}`,
    `* **Verified**: ${now}`,
    '',
    '## Temporary ID Mapping',
    '',
    ...Object.entries(report.mapping).map(([temp, ref]) => `* \`${temp}\` -> ${ref}`),
    '',
    '## Operations',
    '',
    ...report.operations.map((o) => `* [${['created', 'existing', 'linked'].includes(o.status) ? 'x' : ' '}] ${o.ref} - ${o.status} - ${o.detail}`),
    '',
    '<!-- markdown-table-prettify-ignore-end -->',
    '',
  ].join('\n')
}
