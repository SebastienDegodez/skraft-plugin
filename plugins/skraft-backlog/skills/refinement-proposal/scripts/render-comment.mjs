#!/usr/bin/env node
// Renders the refinement proposal comment from a proposal JSON, in the issue's language, ending
// with the marker that tells the next run the work is done.
//
//   node render-comment.mjs --proposal proposal.json --out comment.md [--issue-file issue.json]
//
// The proposal is checked first (check-proposal.mjs rules); an invalid one prints its problems
// and exits 2. --issue-file (the GitHub issue as JSON) supplies the title and body the marker
// hashes and the text the language is detected from; without it, proposal.issue is used.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { checkProposal } from './check-proposal.mjs'
import { GHERKIN, LABELS, detectLanguage } from './labels.mjs'
import { issueHash, renderMarker } from './refine-marker.mjs'
import { VERSION } from './version.mjs'

const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim()
const quote = (value) => String(value ?? '').trim().split(/\r?\n/).map((line) => `> ${line}`).join('\n')
const mark = (pass) => (pass ? '✅' : '❌')

/** @returns {string} the comment Markdown, ending with a newline */
export function renderComment(proposal, { issue = proposal.issue, version = VERSION } = {}) {
  const lang = proposal.language ?? detectLanguage(`${issue?.title ?? ''}\n${issue?.body ?? ''}`) ?? 'en'
  const t = LABELS[lang] ?? LABELS.en
  const [given, when, then] = GHERKIN[lang] ?? GHERKIN.en
  const { derived } = proposal
  const c = t.sep
  const lines = []
  const push = (...items) => lines.push(...items)

  push(`## ${derived.readiness === 'READY' ? '✅' : '🛠️'} ${t.title} — ${derived.readiness === 'READY' ? t.ready : t.notReady}`, '')

  const size = derived.mustSplit
    ? `**${t.size}**${c} ${t.points(proposal.size.points)} — ${t.split}`
    : `**${t.size}**${c} ${t.points(proposal.size.points)}, ${t.days(derived.capacityDays)}`
  const triage = `**${t.type}**${c} ${proposal.triage.type} · **${t.priority}**${c} ${proposal.triage.priority}${proposal.triage.justification ? ` — ${proposal.triage.justification.trim()}` : ''}`
  push(`${size}  `, `${triage}  `, `**${t.dor}**${c} ${derived.dorPassed}/8`, '')
  push(`_${proposal.size.justification.trim()}_`, '')

  const blocking = [
    ...proposal.dor.filter((item) => !item.pass).map((item) => `- ❌ ${t.dor} ${item.item} — ${t.dorItems[item.item - 1]}${c} ${item.note.trim()}`),
    ...(proposal.antipatterns ?? []).filter((a) => a.severity === 'CRITICAL').map((a) => `- ⛔ ${a.name}${a.detail ? `${c} ${a.detail.trim()}` : ''}`),
  ]
  if (blocking.length) push(`### ${t.blocking}`, '', ...blocking, '')

  const defects = proposal.acDefects ?? []
  const high = (proposal.antipatterns ?? []).filter((a) => a.severity === 'HIGH')
  if (defects.length || high.length) {
    push(`### ${t.acDefects}`, '')
    for (const defect of defects) push(`- **${cell(defect.ac)}** — ${t.defect[defect.kind] ?? defect.kind}${c} ${defect.detail.trim()}`)
    for (const antipattern of high) push(`- ⚠️ ${antipattern.name}${antipattern.detail ? `${c} ${antipattern.detail.trim()}` : ''}`)
    push('')
  }

  push(`### ${t.story}`, '', quote(proposal.story.statement), '')
  if (proposal.story.personaInferred) push(`_${t.inferred}_`, '')

  push(`### ${t.examples}`, '', ...proposal.examples.map((example, index) => `${index + 1}. ${example.trim()}`), '')

  push(`### ${t.criteria}`, '')
  proposal.acceptanceCriteria.forEach((ac, index) => {
    const id = ac.id ?? `AC${index + 1}`
    push(`**${id}**${ac.title ? ` — ${String(ac.title).trim()}` : ''}${ac.example ? ` _(${t.fromExample(ac.example)})_` : ''}`)
    push(`- **${given}** ${ac.given.trim()}`, `- **${when}** ${ac.when.trim()}`, `- **${then}** ${ac.then.trim()}`, '')
  })

  if (derived.mustSplit && proposal.size.split?.length) {
    push(`### ${t.splitTitle}`, '', ...proposal.size.split.map((part) => `- ${part.title.trim()} — ${t.points(part.points)}`), '')
  }

  push(`<details><summary>${t.dor} · ${t.invest}</summary>`, '')
  push(`| # | ${t.criterion} | ${t.state} | ${t.note} |`, '|---|---|---|---|')
  for (const item of proposal.dor) push(`| ${item.item} | ${t.dorItems[item.item - 1]} | ${mark(item.pass)} | ${cell(item.note)} |`)
  push('', `| ${t.criterion} | ${t.state} | ${t.note} |`, '|---|---|---|')
  for (const entry of proposal.invest) push(`| ${entry.criterion} | ${mark(entry.pass)} | ${cell(entry.note)} |`)
  push('', '</details>', '')

  const docs = proposal.docs
  push(`### ${t.docs}`, '')
  for (const doc of docs.used) push(`- ${t.used}${c} \`${doc.path}\` (${doc.kind})`)
  for (const doc of docs.candidates) push(`- ${t.toConfirm}${c} \`${doc.path}\` (${doc.kind})${doc.matched?.length ? ` — ${t.matched}${c} ${doc.matched.join(', ')}` : ''} → ${t.confirmHow}`)
  for (const path of docs.missing ?? []) push(`- ${t.missing}${c} \`${path}\``)
  if (!docs.used.length && !docs.candidates.length) push(`- ${t.none(docs.searched ?? 'docs')}`)
  if (docs.gaps?.length) push('', `**${t.gaps}**`, '', ...docs.gaps.map((gap) => `- ${gap.trim()}`))
  push('')

  if (proposal.related?.length) {
    push(`### ${t.related}`, '', ...proposal.related.map((issue) => `- #${issue.number}${issue.title ? ` ${issue.title.trim()}` : ''} (${issue.similarity})`), '')
  }

  push(`<details><summary>${t.review}</summary>`, '', t.reviewLine(proposal.review.verdict, proposal.review.attempts))
  if (proposal.review.unresolved?.length) push('', `**${t.unresolved}**`, '', ...proposal.review.unresolved.map((finding) => `- ${String(finding).trim()}`))
  push('', '</details>', '', '---', `<sub>${t.footer(version)}</sub>`, '', renderMarker({ version, hash: issueHash(issue?.title, issue?.body) }), '')
  return lines.join('\n')
}

export function main(argv, { read = (path) => readFileSync(path, 'utf8'), write = writeFileSync, log = console.log } = {}) {
  const args = Object.fromEntries(argv.flatMap((arg, index) => (arg.startsWith('--') ? [[arg.slice(2), argv[index + 1]]] : [])))
  if (!args.proposal || !args.out) { log('usage: render-comment.mjs --proposal <file> --out <file> [--issue-file <file>]'); return 1 }
  let input
  let issue
  try {
    input = JSON.parse(read(args.proposal))
    issue = args['issue-file'] ? JSON.parse(read(args['issue-file'])) : undefined
  } catch (error) { log(JSON.stringify({ error: 'unreadable', message: error.message })); return 1 }
  const result = checkProposal(input)
  if (result.problems.length) { log(JSON.stringify({ error: 'invalid_proposal', problems: result.problems }, null, 2)); return 2 }
  write(args.out, renderComment(result.proposal, issue ? { issue } : {}))
  log(JSON.stringify({ out: args.out, readiness: result.proposal.derived.readiness }))
  return 0
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exitCode = main(process.argv.slice(2))
