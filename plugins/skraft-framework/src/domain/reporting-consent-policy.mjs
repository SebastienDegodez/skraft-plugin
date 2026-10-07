import { validateReportingPreferences } from './reporting-preferences.mjs'

// Pure: the reporting consent checkpoint RunPipeline asks once per pipeline (what
// skraft-orchestrator.md Phase 0 step 5 asked by hand). The question shows the scope read
// from the repository — provider, host, repository, branch — so the answer confirms it;
// the answer names the destinations. Silence, a recommendation or an example is not
// consent: an answer that does not parse is refused, never completed with defaults.
//
// Answer grammar (case-insensitive, any order):
//   local | chat | pr | issue | pr+issue | pr+issue+chat …   destinations ('+' or spaces)
//   pr=#N  issue=#N   media=N   draft
// `issue` beside `pr` posts a link to the PR report; `issue` alone posts the full report.

const HOST_PROVIDERS = Object.freeze({ 'github.com': 'github', 'gitlab.com': 'gitlab', 'dev.azure.com': 'azure-devops' })

// Provider scope of an `origin` URL (https or scp-like ssh), or null when unknown.
export const remoteScopeOf = (url) => {
  if (typeof url !== 'string' || url.trim() === '') return null
  const text = url.trim()
  const match = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)(?::\d+)?[/:](.+?)(?:\.git)?\/?$/i.exec(text)
  if (!match) return null
  const host = match[1].toLowerCase().replace(/^ssh\./, '')
  const path = match[2].replace(/^\/+/, '')
  const provider = HOST_PROVIDERS[host] ?? null
  if (provider === 'azure-devops') {
    const azure = /^(?:v3\/)?([^/]+)\/([^/]+)\/(?:_git\/)?([^/]+)$/.exec(path)
    return azure ? { provider, host, organization: azure[1], project: azure[2], repo: azure[3] } : null
  }
  if (provider === 'github') {
    const parts = path.split('/')
    return parts.length === 2 ? { provider, host, repo: path } : null
  }
  if (provider === 'gitlab') return { provider, host, repo: path }
  return null
}

const scopeLine = (scope) => (scope
  ? `${scope.provider} ${scope.host} ${scope.organization ? `${scope.organization}/${scope.project}/` : ''}${scope.repo}`
  : 'no recognised remote (origin) — only local or chat reports are possible')

export const CONSENT_KEY = 'reporting:consent'

export const consentQuestion = ({ scope, branch, issueNumber }) => [
  'Reporting for this pipeline: where should the forecast (after DISTILL) and outcome (after DELIVER) reports go?',
  `Scope: ${scopeLine(scope)}, branch ${branch ?? '(detached)'}${issueNumber ? `, issue #${issueNumber}` : ''}.`,
  'Answer with destinations: "local" (Markdown only), "chat" (a summary here), "pr" (a comment on the pull request),',
  '"issue" (a link on the issue when beside pr, the full report otherwise) — combine with "+", e.g. "pr+issue+chat".',
  'Add "pr=#N" to name the pull request, "issue=#N" for another issue, "media=N" to embed N screenshots, "draft" to allow a draft PR.',
  'Each remote destination adds tool calls and tokens.',
].join('\n')

export const CONSENT_OPTIONS = Object.freeze(['local', 'chat', 'pr+issue+chat', 'pr+chat'])

const NUMBER = /^#?(\d+)$/

// answer → { ok: true, preferences } | { ok: false, reason }
export const interpretConsent = (answer, { scope, branch, issueNumber = null }) => {
  const words = String(answer ?? '').toLowerCase().split(/[\s,+]+/).filter(Boolean)
  if (words.length === 0) return { ok: false, reason: 'no destination named' }
  const chosen = new Set()
  let prNumber = null
  let issue = issueNumber
  let maxMedia = 0
  let allowDraftPr = false
  for (const word of words) {
    const [key, value] = word.split('=')
    if (value !== undefined) {
      if (key === 'media' && /^\d+$/.test(value)) { maxMedia = Number(value); continue }
      if ((key === 'pr' || key === 'issue') && NUMBER.test(value)) {
        const number = Number(NUMBER.exec(value)[1])
        if (number <= 0) return { ok: false, reason: `${key} number must be positive` }
        if (key === 'pr') { prNumber = number; chosen.add('pr') } else { issue = number; chosen.add('issue') }
        continue
      }
      return { ok: false, reason: `"${word}" is not understood` }
    }
    if (['local', 'chat', 'pr', 'issue'].includes(word)) { chosen.add(word); continue }
    if (word === 'draft') { allowDraftPr = true; continue }
    return { ok: false, reason: `"${word}" is not a destination` }
  }
  if (chosen.has('local') && chosen.size > 1) return { ok: false, reason: '"local" excludes every other destination' }
  const pr = chosen.has('pr')
  const destinations = {
    pr,
    issue: chosen.has('issue') ? (pr ? 'link' : 'full') : 'none',
    chat: chosen.has('chat'),
  }
  const remote = destinations.pr || destinations.issue !== 'none'
  if (remote && !scope) return { ok: false, reason: 'a remote destination needs a recognised origin remote' }
  const preferences = {
    confirmed: true,
    ...(remote ? scope : { repo: null }),
    branch: branch ?? '',
    prNumber,
    issueNumber: destinations.issue === 'none' ? (issueNumber ?? null) : issue,
    destinations,
    maxMedia,
    allowDraftPr,
  }
  const valid = validateReportingPreferences(preferences)
  return valid.ok ? { ok: true, preferences: valid.value } : { ok: false, reason: valid.error.reason }
}
