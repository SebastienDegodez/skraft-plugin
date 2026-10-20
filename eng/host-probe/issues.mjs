// What the host probe does on GitHub: a comment with the measurement on the issue a check is
// linked to, a new issue for a failed requirement that no open issue covers yet.
import { spawnSync } from 'node:child_process'

export const DEFAULT_REPO = 'SebastienDegodez/skraft-plugin'
export const MILESTONE_TITLE = '2.0.0 — V2'
/** The host-verification issue every new issue from the probe goes under. */
export const PARENT_ISSUE = 251

/** One line per observed value, shown in an issue. */
const observedLines = (observed) => Object.entries(observed ?? {}).map(([key, value]) => `- \`${key}\`: \`${JSON.stringify(value)}\``).join('\n')

const VERDICT_TEXT = Object.freeze({
  pass: 'mesuré conforme',
  fail: 'mesuré non conforme',
  inconclusive: 'non concluant',
})

/** The comment posted on a check's linked issue. */
export const commentBody = (check, environment) => [
  `**Sonde d'hôte Copilot — \`${check.id}\`** : ${VERDICT_TEXT[check.verdict]}.`,
  '',
  check.expected,
  '',
  observedLines(check.observed),
  '',
  `Environnement : ${environmentLine(environment)}`,
].join('\n')

/** The body of a new issue opened for a failed requirement. */
export const issueBody = (check, environment) => [
  check.body,
  '',
  `**Mesure** (\`${check.id}\`, sonde \`eng/host-probe/copilot-probe.mjs\`) : ${check.expected}`,
  '',
  observedLines(check.observed),
  '',
  `Environnement : ${environmentLine(environment)}`,
].join('\n')

const environmentLine = ({ copilot, sdk, node, os } = {}) => `Copilot CLI ${copilot ?? '?'}, SDK ${sdk ?? '?'}, Node ${node ?? '?'}, ${os ?? '?'}`

/**
 * The GitHub actions for a probe report: a comment for each check linked to an issue and
 * conclusive, an issue for each failed requirement without an open issue of the same title.
 * @param {{ checks: any[], environment: object }} report
 * @param {{ openTitles: Set<string> }} known
 */
export const planIssueActions = ({ checks, environment }, { openTitles }) => {
  const actions = []
  for (const check of checks) {
    if (check.verdict === 'inconclusive') continue
    if (typeof check.issue === 'number') actions.push({ kind: 'comment', issue: check.issue, check: check.id, body: commentBody(check, environment) })
    else if (check.verdict === 'fail' && check.title && !openTitles.has(check.title)) {
      actions.push({ kind: 'open', title: check.title, check: check.id, labels: check.labels ?? [], body: issueBody(check, environment) })
      openTitles.add(check.title)
    }
  }
  return actions
}

/** `gh api` with a JSON body on stdin, so nothing goes through a shell. */
const ghApi = (path, { method = 'GET', body } = {}) => {
  const args = ['api', path, '-X', method, ...(body === undefined ? [] : ['--input', '-'])]
  const run = spawnSync('gh', args, { input: body === undefined ? undefined : JSON.stringify(body), encoding: 'utf8' })
  if (run.error) throw new Error(`gh could not be started: ${run.error.code ?? 'unknown'}`)
  if (run.status !== 0) throw new Error(`gh api ${method} ${path} exited ${run.status}`)
  return run.stdout.trim() === '' ? null : JSON.parse(run.stdout)
}

/** Every open issue of the repository, read page by page. */
const openIssues = (repo) => {
  const all = []
  for (let page = 1; page <= 10; page++) {
    const batch = ghApi(`repos/${repo}/issues?state=open&per_page=100&page=${page}`)
    all.push(...batch.filter((item) => !item.pull_request))
    if (batch.length < 100) break
  }
  return all
}

/**
 * Plans then applies the actions with `gh api` (REST only). dryRun prints the plan and touches
 * nothing.
 * @returns {Promise<Array<{ action: object, url?: string, error?: string }>>}
 */
export const reportToGitHub = async (report, { repo = DEFAULT_REPO, dryRun = false, log = console.log } = {}) => {
  const titles = new Set(openIssues(repo).map((issue) => issue.title))
  const actions = planIssueActions(report, { openTitles: titles })
  if (dryRun) {
    for (const action of actions) log(`[dry-run] ${action.kind} ${action.issue ? `#${action.issue}` : `"${action.title}"`} (${action.check})`)
    return actions.map((action) => ({ action }))
  }
  const milestone = actions.some((action) => action.kind === 'open') ? milestoneNumber(repo) : null
  return actions.map((action) => applyAction(repo, action, milestone, log))
}

const milestoneNumber = (repo) => {
  const found = ghApi(`repos/${repo}/milestones?state=open&per_page=100`).find((item) => item.title === MILESTONE_TITLE)
  if (!found) throw new Error(`milestone "${MILESTONE_TITLE}" not found in ${repo}`)
  return found.number
}

const applyAction = (repo, action, milestone, log) => {
  try {
    if (action.kind === 'comment') {
      const comment = ghApi(`repos/${repo}/issues/${action.issue}/comments`, { method: 'POST', body: { body: action.body } })
      log(`commented #${action.issue} (${action.check}): ${comment.html_url}`)
      return { action, url: comment.html_url }
    }
    const issue = ghApi(`repos/${repo}/issues`, { method: 'POST', body: { title: action.title, body: action.body, labels: action.labels, milestone } })
    ghApi(`repos/${repo}/issues/${PARENT_ISSUE}/sub_issues`, { method: 'POST', body: { sub_issue_id: issue.id } })
    log(`opened #${issue.number} (${action.check}): ${issue.html_url}`)
    return { action, url: issue.html_url }
  } catch (error) {
    log(`failed ${action.kind} (${action.check}): ${error.message}`)
    return { action, error: error.message }
  }
}
