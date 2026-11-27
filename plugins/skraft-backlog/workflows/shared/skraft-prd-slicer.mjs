#!/usr/bin/env node
// Drives the skraft-prd-backlog dynamic workflow from a GitHub issue labelled `skraft:prd-slicer`.
// The product owner talks to the run through the issue: one comment holds every question, the PO
// answers in one comment, a last comment proposes the epics and stories with the decisions, and
// `/skraft accept` creates the issues and closes the PRD issue. Between two runs the run's files
// live on the branch `skraft/prd-slicer-state`, one folder per issue.
//
//   node skraft-prd-slicer.mjs gate                         → todo, issue, action (start | answer | accept)
//   node skraft-prd-slicer.mjs prepare --repo o/r --issue N → restores the state, finds the PRD,
//        applies the answers, writes the workflow arguments; prints step=run|refused
//   node skraft-prd-slicer.mjs run --issue N --args <file>    → copilot workflow run skraft-prd-backlog
//   node skraft-prd-slicer.mjs after --issue N --result <file> → renders the comment to post
//   node skraft-prd-slicer.mjs save --issue N --from <dir>  → (safe job) pushes the state folder
//   node skraft-prd-slicer.mjs publish --repo o/r --issue N --plugin <dir> → (safe job) creates the
//        issues from plan.json with the skraft publisher, comments and closes the PRD issue
//
// Self-contained: gh-aw installs a copy under .github/workflows/shared/ and runs it before any
// skill exists. Every call to GitHub goes through `gh api` with an argv array, never a shell.
import { execFileSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const LABEL = 'skraft:prd-slicer'
export const STATE_BRANCH = 'skraft/prd-slicer-state'
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR'])
const ACCEPT = /^\s*\/skraft\s+accept\b/i
const MARKER = /skraft-prd-slicer step=(questions|proposal|published|refused)/
export const markerOf = (step) => `<sub>skraft-prd-slicer step=${step}</sub>`

/** The slug of the run of an issue: its tracking folder `.copilot-tracking/skraft-plans/<slug>/`. */
export const slugOf = (issue) => `prd-issue-${issue}`

const trusted = (c) => TRUSTED.has(String(c?.author_association ?? '').toUpperCase()) && String(c?.user?.type ?? '') !== 'Bot'
const hasLabel = (issue) => (issue?.labels ?? []).some((l) => (l?.name ?? l) === LABEL)

/**
 * Whether the event asks the slicer for work, and which.
 * @returns {{ run: true, issue: string, action: 'start' | 'answer' | 'accept' } | { run: false, reason: string }}
 */
export function gate({ eventName, payload = {}, issue, action }) {
  const number = String(payload.issue?.number ?? issue ?? '').trim()
  if (eventName === 'workflow_dispatch') return { run: true, issue: number, action: action || 'start' }
  if (eventName === 'issues') {
    return payload.action === 'labeled' && payload.label?.name === LABEL ? { run: true, issue: number, action: 'start' }
      : { run: false, reason: `issues.${payload.action} does not add the ${LABEL} label` }
  }
  if (eventName !== 'issue_comment') return { run: false, reason: `the ${eventName} event does not ask for a slicing` }
  if (payload.issue?.pull_request) return { run: false, reason: 'a comment on a pull request' }
  if (payload.issue?.state !== 'open' || !hasLabel(payload.issue)) return { run: false, reason: `the issue is not an open ${LABEL} issue` }
  if (!trusted(payload.comment)) return { run: false, reason: 'the comment is not from an owner, member or collaborator' }
  return { run: true, issue: number, action: ACCEPT.test(payload.comment?.body ?? '') ? 'accept' : 'answer' }
}

// ── answers ──────────────────────────────────────────────────────────────────────────────────

const LETTERS = 'ABCDEFGH'

/**
 * The answers a comment gives in the short form (`1B`, `2: A`, `Q3 c`, comma or line separated)
 * to the numbered questions, and the prose left once those are removed: it becomes context.
 * @param {string} text @param {{ id: string, options: string[] }[]} questions
 * @returns {{ answers: Record<string, string>, prose: string }}
 */
export function parseAnswers(text, questions) {
  const answers = {}
  const prose = String(text ?? '').replace(/(?:^|[\s,;])Q?(\d{1,2})\s*[:.)-]?\s*([A-Ha-h])(?=$|[\s,;.])/g, (whole, n, letter) => {
    const question = questions[Number(n) - 1]
    const option = question?.options[LETTERS.indexOf(letter.toUpperCase())]
    if (!option) return whole
    answers[question.id] = option
    return ' '
  }).replace(/(^|\s)[,;](?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim()
  return { answers, prose }
}

// ── the PRD ──────────────────────────────────────────────────────────────────────────────────

const PRD_NAME = /(^|[-_./])prd([-_.]|$)|product-requirements/i
const REQUIREMENT = /(^|\n)\s*(?:[-*]\s+|\|\s*|#{1,6}\s+|\*\*)?`?(?:FR|US|REQ)-\d+/

/** @param {string} text */
const prdIdOf = (text) => /^---[\s\S]*?^prd_id:\s*"?([^"\n]+)"?\s*$[\s\S]*?^---/m.exec(text)?.[1]?.trim() ?? null
const words = (text) => new Set(String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2))
const overlap = (a, b) => { const x = words(a); let n = 0; for (const w of words(b)) if (x.has(w)) n += 1; return n }

/**
 * The PRD an issue is about, as it is written: a file it names (a path, a link, a file name, a
 * `prd_id`), else the one PRD of the repository, else the closest by title (to confirm), else the
 * issue's own body when it carries requirements.
 * @param {{ title: string, body: string, comments: string[], files: { path: string, text: string }[] }} issue
 * @returns {{ path: string, confirm: string[] } | { body: string } | null}
 */
export function findPrd({ title, body, comments, files }) {
  const said = [body, ...comments].join('\n')
  const prds = files.filter((f) => prdIdOf(f.text) || PRD_NAME.test(basename(f.path)) || PRD_NAME.test(f.path))
  const named = files.find((f) => said.includes(f.path) || new RegExp(`(^|[\\s/(\`'"])${escape(basename(f.path))}($|[\\s)\`'".,])`).test(said)
    || (prdIdOf(f.text) && said.includes(prdIdOf(f.text))))
  if (named) return { path: named.path, confirm: [] }
  if (prds.length === 1) return { path: prds[0].path, confirm: [] }
  if (prds.length > 1) {
    const ranked = [...prds].sort((a, b) => overlap(title, b.path + b.text.slice(0, 400)) - overlap(title, a.path + a.text.slice(0, 400)))
    return { path: ranked[0].path, confirm: ranked.slice(0, 4).map((f) => f.path) }
  }
  return REQUIREMENT.test(body ?? '') ? { body } : null
}
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The repository files a PRD may be: markdown under docs/ or at the root. @param {string} cwd */
export function markdownFiles(cwd, dir = cwd, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory() && found.length < 2000) markdownFiles(cwd, path, found)
    else if (/\.md$/i.test(entry.name)) found.push({ path: relative(cwd, path).split('\\').join('/'), text: readFileSync(path, 'utf8').slice(0, 4000) })
  }
  return found
}

/** Repository files the issue and comments point at, to read beside the PRD. @param {string} cwd @param {string} said @param {string} prd */
export function contextOf(cwd, said, prd) {
  const paths = new Set()
  for (const match of said.matchAll(/(?:blob\/[^/\s]+\/)?((?:[\w.-]+\/)*[\w.-]+\.(?:md|txt|png|jpe?g|gif|webp|svg))\b/gi)) {
    const path = match[1]
    if (path !== prd && existsSync(join(cwd, path)) && statSync(join(cwd, path)).isFile()) paths.add(path)
  }
  return [...paths].slice(0, 10)
}

// ── comments ─────────────────────────────────────────────────────────────────────────────────

/**
 * One comment with every question, numbered, options lettered, the recommendation marked.
 * @param {{ id: string, question: string, why?: string, options: string[], recommended: number }[]} questions
 * @param {{ language: 'fr' | 'en' }} options
 */
export function renderQuestions(questions, { language }) {
  const fr = language === 'fr'
  const lines = [fr ? '### Questions avant le découpage' : '### Questions before the slicing', '',
    fr ? 'Répondez en **un seul commentaire**, par exemple `1B 2A 3C`, et ajoutez librement du contexte en prose. Sans réponse, la recommandation (★) est prise.'
      : 'Answer in **one comment**, for example `1B 2A 3C`, and add any context in prose. Without an answer, the recommendation (★) is taken.', '']
  questions.forEach((q, i) => {
    lines.push(`**${i + 1}. ${q.question}**`)
    if (q.why) lines.push(`> ${q.why}`)
    q.options.forEach((o, j) => lines.push(`- ${LETTERS[j]}) ${o}${j === q.recommended ? ' ★' : ''}`))
    lines.push('')
  })
  lines.push(markerOf('questions'))
  return lines.join('\n')
}

/**
 * The last comment before any issue exists: the epics, their stories, the milestones, what is
 * deferred and the decisions, and how to accept.
 * @param {any} map the story map @param {{ language: 'fr' | 'en', stories?: Record<string, string> }} options stories: titles by id
 */
export function renderProposal(map, { language, stories = {} }) {
  const fr = language === 'fr'
  const lines = [fr ? '### Proposition de backlog' : '### Proposed backlog', '']
  for (const epic of map.epics ?? []) {
    lines.push(`**${epic.id} — ${epic.title}**${epic.outcome ? ` : ${epic.outcome}` : ''}`)
    for (const s of epic.stories ?? []) lines.push(`- ${s.id} ${stories[s.id] ?? s.title}${s.effort ? ` (${s.effort})` : ''}${s.milestone ? ` · ${s.milestone}` : ''}${s.after?.length ? ` · ${fr ? 'après' : 'after'} ${s.after.join(', ')}` : ''}`)
    lines.push('')
  }
  if (map.milestones?.length) lines.push(`**${fr ? 'Jalons' : 'Milestones'}** : ${map.milestones.map((m) => m.title).join(', ')}`, '')
  if (map.deferred?.length) lines.push(`**${fr ? 'Différé' : 'Deferred'}**`, ...map.deferred.map((d) => `- ${d.id ?? d}${d.reason ? ` : ${d.reason}` : ''}`), '')
  if (map.decisions?.length) lines.push(`**${fr ? 'Décisions' : 'Decisions'}**`, ...map.decisions.map((d) => `- ${d}`), '')
  lines.push(fr ? 'Commentez `/skraft accept` pour créer les issues et fermer celle-ci, ou commentez ce qu’il faut changer : le découpage est refait.'
    : 'Comment `/skraft accept` to create the issues and close this one, or comment what to change: the slicing is redone.', '', markerOf('proposal'))
  return lines.join('\n')
}

/** The step the last comment of the slicer reached on the issue. @param {{ body: string }[]} comments */
export const stepOf = (comments) => [...comments].reverse().map((c) => MARKER.exec(c.body ?? '')?.[1]).find(Boolean) ?? null

// ── state and runs (impure) ──────────────────────────────────────────────────────────────────

const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 })
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const json = (path, fallback = null) => { try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return fallback } }
const output = (pairs) => {
  for (const [k, v] of Object.entries(pairs)) {
    console.log(`${k}=${v}`)
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`)
  }
}

/** The state folder of an issue from the state branch, when it exists, into the working copy. */
function restore(cwd, issue) {
  const dir = join(cwd, '.copilot-tracking', 'skraft-plans', slugOf(issue))
  try {
    git(cwd, ['fetch', '--depth=1', 'origin', `refs/heads/${STATE_BRANCH}`])
    const scratch = join(cwd, '.copilot-tracking', '.prd-slicer-restore')
    rmSync(scratch, { recursive: true, force: true })
    mkdirSync(scratch, { recursive: true })
    git(cwd, ['--work-tree', scratch, 'checkout', 'FETCH_HEAD', '--', String(issue)])
    git(cwd, ['reset', '-q'])
    rmSync(dir, { recursive: true, force: true })
    cpSync(join(scratch, String(issue)), dir, { recursive: true })
    rmSync(scratch, { recursive: true, force: true })
  } catch { mkdirSync(dir, { recursive: true }) }
  return dir
}

function prepare({ cwd, repo, issue, action }) {
  const data = JSON.parse(gh(['api', `repos/${repo}/issues/${issue}`]))
  const comments = JSON.parse(gh(['api', '--paginate', `repos/${repo}/issues/${issue}/comments?per_page=100`]))
  const dir = restore(cwd, issue)
  const work = join(dir, 'issue')
  mkdirSync(work, { recursive: true })
  const said = comments.filter(trusted)
  const state = json(join(work, 'slicer.json'), {})
  if (action === 'accept') return output({ step: stepOf(comments) === 'proposal' ? 'accept' : 'refused', reason: 'nothing proposed yet' })
  if (!state.prd) {
    const found = findPrd({ title: data.title, body: data.body ?? '', comments: said.map((c) => c.body), files: markdownFiles(cwd) })
    if (!found) return refuse(work, 'no PRD found: name its file in the issue, or write its requirements (FR-001…) in the issue body')
    if ('body' in found) { writeFileSync(join(work, 'prd.md'), `# ${data.title}\n\n${found.body}\n`); state.prd = relative(cwd, join(work, 'prd.md')).split('\\').join('/') }
    else { state.prd = found.path; state.candidates = found.confirm }
  }
  const last = [...comments].reverse().find((c) => MARKER.test(c.body ?? ''))
  const reply = said.filter((c) => !last || new Date(c.created_at) > new Date(last.created_at)).map((c) => c.body).join('\n\n')
  const framingPath = join(dir, 'backlog', 'framing.json')
  const framing = json(framingPath)
  let prose = reply
  if (action === 'answer' && stepOf(comments) === 'questions' && framing) {
    const questions = [...(state.candidates?.length > 1 ? [{ id: 'prd', options: state.candidates }] : []), ...framing.questions]
    const parsed = parseAnswers(reply, questions)
    if (parsed.answers.prd && parsed.answers.prd !== state.prd) { state.prd = parsed.answers.prd; rmSync(join(dir, 'backlog'), { recursive: true, force: true }) }
    else {
      for (const [id, text] of Object.entries(parsed.answers)) if (id !== 'prd') framing.answers[id] = { text, at: new Date().toISOString() }
      writeFileSync(framingPath, `${JSON.stringify(framing, null, 2)}\n`)
    }
    state.candidates = []
    prose = parsed.prose
  }
  if (action === 'answer' && stepOf(comments) === 'proposal') {
    for (const name of ['story-map.json', 'story-map.md', 'stories', 'slices', 'reviews', 'plans', 'plan.json']) rmSync(join(dir, 'backlog', name), { recursive: true, force: true })
  }
  state.notes = [state.notes, prose].filter(Boolean).join('\n\n').slice(-7000)
  writeFileSync(join(work, 'slicer.json'), `${JSON.stringify(state, null, 2)}\n`)
  const args = {
    prd: state.prd, slug: slugOf(issue), dryRun: true, approve: action !== 'start' || Boolean(framing),
    context: contextOf(cwd, [data.body ?? '', ...said.map((c) => c.body)].join('\n'), state.prd),
    ...(state.notes ? { notes: state.notes } : {}),
  }
  writeFileSync(join(work, 'args.json'), `${JSON.stringify(args)}\n`)
  return output({ step: 'run', args: join(work, 'args.json'), state: dir })
}

function refuse(work, reason) {
  writeFileSync(join(work, 'comment.md'), `${reason}\n\n${markerOf('refused')}\n`)
  return output({ step: 'refused', comment: join(work, 'comment.md') })
}

/**
 * Runs the dynamic workflow headless. A first run that stops on a pause other than the framing
 * (nothing to ask) runs again with approve, so the PO only ever sees questions or a proposal.
 */
function runWorkflow({ cwd, issue, args }) {
  const dir = join(cwd, '.copilot-tracking', 'skraft-plans', slugOf(issue))
  const result = join(dir, 'issue', 'result.json')
  const once = (file) => {
    try {
      execFileSync('copilot', ['--experimental', 'workflow', 'run', 'skraft-prd-backlog', '--args', `@${file}`, '--output-format', 'json',
        '--result-file', result, '--allow-all-tools'], { cwd, stdio: 'inherit', env: { ...process.env, GITHUB_COPILOT_PROMPT_MODE_EXTENSIONS: 'true' } })
    } catch { /* the step reads the files the run left */ }
  }
  once(args)
  const framing = json(join(dir, 'backlog', 'framing.json'))
  const asking = framing && framing.questions.some((q) => !framing.answers?.[q.id])
  if (!existsSync(join(dir, 'backlog', 'plan.json')) && !asking) {
    const again = join(dir, 'issue', 'args-approve.json')
    writeFileSync(again, `${JSON.stringify({ ...json(args, {}), approve: true })}\n`)
    once(again)
  }
  return output({ result })
}

/** The comment the run leads to, decided from the files it left: a proposal, questions, or why it stopped. */
function after({ cwd, issue, result }) {
  const dir = join(cwd, '.copilot-tracking', 'skraft-plans', slugOf(issue))
  const work = join(dir, 'issue')
  const state = json(join(work, 'slicer.json'), {})
  const run = json(result, {})
  const inventory = json(join(dir, 'backlog', 'inventory.json'), {})
  const language = inventory.language === 'fr' ? 'fr' : 'en'
  const framing = json(join(dir, 'backlog', 'framing.json'))
  const open = framing ? framing.questions.filter((q) => !framing.answers?.[q.id]) : []
  let body
  if (existsSync(join(dir, 'backlog', 'plan.json'))) body = renderProposal(json(join(dir, 'backlog', 'story-map.json'), {}), { language })
  else if (open.length) {
    const prd = state.candidates?.length > 1 ? [{ id: 'prd', question: language === 'fr' ? 'Quel PRD découper ?' : 'Which PRD to slice?', options: state.candidates, recommended: 0 }] : []
    body = renderQuestions([...prd, ...open], { language })
  } else {
    const reason = run.result?.reason ?? run.reason ?? run.status ?? 'unknown'
    body = `${language === 'fr' ? 'Le découpage s’est arrêté' : 'The slicing stopped'} : ${String(reason).slice(0, 500)}\n\n${markerOf('refused')}`
  }
  writeFileSync(join(work, 'comment.md'), `${body}\n`)
  return output({ step: 'comment', comment: join(work, 'comment.md') })
}

function save({ cwd, issue, from }) {
  const tree = join(cwd, '.prd-slicer-state')
  rmSync(tree, { recursive: true, force: true })
  try { git(cwd, ['fetch', '--depth=1', 'origin', `refs/heads/${STATE_BRANCH}`]); git(cwd, ['worktree', 'add', '-f', tree, 'FETCH_HEAD']) }
  catch { git(cwd, ['worktree', 'add', '--detach', tree]); git(tree, ['checkout', '--orphan', 'state']); git(tree, ['rm', '-rf', '-q', '.']) }
  rmSync(join(tree, String(issue)), { recursive: true, force: true })
  cpSync(from, join(tree, String(issue)), { recursive: true })
  git(tree, ['add', '-A'])
  git(tree, ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-q', '--allow-empty', '-m', `skraft-prd-slicer: state of #${issue}`])
  git(tree, ['push', '-q', 'origin', `HEAD:refs/heads/${STATE_BRANCH}`])
  return output({ saved: 'true' })
}

async function publishIssues({ cwd, repo, issue, plugin }) {
  const dir = join(cwd, '.copilot-tracking', 'skraft-plans', slugOf(issue))
  restore(cwd, issue)
  const raw = json(join(dir, 'backlog', 'plan.json'))
  if (!raw) throw new Error('no plan.json in the state of the issue')
  const { publish, createGitHub, ghCli, publishedItems } = await import(pathToFileURL(join(plugin, 'plugins/skraft-backlog/prd-backlog/publish.mjs')).href)
  const plan = { ...raw, notReady: new Map(Object.entries(raw.notReady ?? {})) }
  const report = await publish({ plan, repo, github: createGitHub(ghCli(cwd)), dryRun: false })
  const created = report.operations.filter((o) => o.status === 'created').length
  writeFileSync(join(dir, 'published.json'), `${JSON.stringify({ stories: publishedItems(plan, report) }, null, 2)}\n`)
  const ok = report.failed + report.skipped === 0
  gh(['api', `repos/${repo}/issues/${issue}/comments`, '-f', `body=${ok ? `${created} issues created.` : `${report.failed} failed, ${report.skipped} skipped: comment \`/skraft accept\` again to retry.`}\n\n${markerOf(ok ? 'published' : 'proposal')}`])
  if (ok) gh(['api', '-X', 'PATCH', `repos/${repo}/issues/${issue}`, '-f', 'state=closed', '-f', 'state_reason=completed'])
  return output({ created: String(created), ok: String(ok) })
}

const flag = (argv, name) => { const at = argv.indexOf(`--${name}`); return at < 0 ? undefined : argv[at + 1] }

async function main(argv) {
  const cwd = process.cwd()
  const issue = flag(argv, 'issue') ?? process.env.SLICER_ISSUE
  const repo = flag(argv, 'repo') ?? process.env.GITHUB_REPOSITORY
  switch (argv[0]) {
    case 'gate': {
      const payload = process.env.GITHUB_EVENT_PATH ? json(process.env.GITHUB_EVENT_PATH, {}) : {}
      const decided = gate({ eventName: process.env.GITHUB_EVENT_NAME, payload, issue, action: flag(argv, 'action') })
      return output(decided.run ? { todo: 'true', issue: decided.issue, action: decided.action } : { todo: 'false', reason: decided.reason })
    }
    case 'prepare': return prepare({ cwd, repo, issue, action: flag(argv, 'action') ?? 'start' })
    case 'run': return runWorkflow({ cwd, issue, args: resolve(flag(argv, 'args')) })
    case 'after': return after({ cwd, issue, result: flag(argv, 'result') })
    case 'save': return save({ cwd, issue, from: resolve(flag(argv, 'from')) })
    case 'publish': return publishIssues({ cwd, repo, issue, plugin: resolve(flag(argv, 'plugin')) })
    default: throw new Error('usage: gate | prepare | run | after | save | publish')
  }
}

const isMain = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false } })()
if (isMain) main(process.argv.slice(2)).catch((error) => { console.error(`skraft-prd-slicer: ${error.message}`); process.exit(1) })
