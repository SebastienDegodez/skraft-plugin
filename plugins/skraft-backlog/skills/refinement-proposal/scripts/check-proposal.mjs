#!/usr/bin/env node
// Validates a refinement proposal for one issue and derives the figures the agent must not
// compute itself: readiness, the DoR tally, the capacity days of a Fibonacci size.
//
//   node check-proposal.mjs --proposal proposal.json [--out checked.json]
//
// Exit codes: 0 valid (the checked proposal is printed or written), 2 invalid (a JSON list of
// problems is printed: fix them and re-run), 1 unreadable input.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const FIBONACCI = Object.freeze([1, 2, 3, 5, 8, 13, 21])
// Capacity arithmetic from issue-triage, not a forecast. Past 8 a story is split, not sized.
export const CAPACITY_DAYS = Object.freeze({ 1: 0.25, 2: 0.5, 3: 0.75, 5: 1.5, 8: 3 })
export const DOR_ITEMS = Object.freeze([
  'problem-statement', 'specific-persona', 'domain-examples', 'uat-scenarios',
  'ac-from-uat', 'right-sized', 'technical-notes', 'dependencies',
])
export const INVEST = Object.freeze(['Independent', 'Negotiable', 'Valuable', 'Estimable', 'Small', 'Testable'])
export const AC_DEFECTS = Object.freeze(['vague', 'untestable', 'duplicate', 'technical', 'antipattern', 'invest', 'missing'])
const TYPES = ['feature', 'bug', 'tech-debt', 'docs', 'question']
const PRIORITIES = ['P0', 'P1', 'P2', 'P3']
const VERDICTS = ['APPROVED', 'NEEDS_REWORK', 'REJECTED']
const SIMILARITY = ['EXACT', 'NEAR', 'RELATED']
const GENERIC_PERSONA = /^(?:(?:a|an|the|un|une|le|la|les|des|any|some)\s+|l['’]\s*)?(?:users?|utilisat(?:eur|rice)s?|someone|somebody|quelqu'un|customers?|clients?|persons?|people|personnes?|developers?|développeu(?:r|se)s?|devs?)$/i

const text = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * @returns {{ problems: string[], proposal?: object }} the proposal with derived fields when valid
 */
export function checkProposal(input) {
  const problems = []
  const need = (condition, message) => { if (!condition) problems.push(message) }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { problems: ['the proposal must be a JSON object'] }
  const p = input

  need(p.issue && text(p.issue.repo) && /^[\w.-]+\/[\w.-]+$/.test(p.issue.repo), 'issue.repo must be owner/repo')
  need(p.issue && Number.isInteger(p.issue.number) && p.issue.number > 0, 'issue.number must be a positive integer')
  need(p.issue && text(p.issue.title), 'issue.title is empty')
  if (p.language !== undefined) need(/^[a-z]{2}$/.test(String(p.language)), 'language must be a two-letter code such as fr or en')

  // Definition of Ready of the issue as written.
  const dor = Array.isArray(p.dor) ? p.dor : []
  need(dor.length === 8, 'dor must list the 8 Definition of Ready items, once each')
  dor.forEach((item, index) => {
    need(Number.isInteger(item?.item) && item.item >= 1 && item.item <= 8, `dor[${index}].item must be 1 to 8`)
    need(typeof item?.pass === 'boolean', `dor[${index}].pass must be true or false`)
    need(item?.pass === true || text(item?.note), `dor[${index}] fails without a note saying what is missing`)
  })
  need(new Set(dor.map((item) => item?.item)).size === dor.length, 'dor lists an item twice')

  // Proposed story.
  need(p.story && text(p.story.persona), 'story.persona is empty')
  need(!(p.story && GENERIC_PERSONA.test(String(p.story.persona).trim())), `story.persona "${p.story?.persona}" is generic: name the role`)
  need(p.story && text(p.story.statement), 'story.statement is empty')
  need(p.story?.personaInferred === undefined || typeof p.story.personaInferred === 'boolean', 'story.personaInferred must be true or false')

  const examples = Array.isArray(p.examples) ? p.examples : []
  need(examples.length >= 3, 'examples needs at least 3 domain examples with real values')
  examples.forEach((example, index) => need(text(example), `examples[${index}] is empty`))

  const criteria = Array.isArray(p.acceptanceCriteria) ? p.acceptanceCriteria : []
  need(criteria.length >= 3, 'acceptanceCriteria needs at least 3 criteria')
  criteria.forEach((ac, index) => {
    for (const part of ['given', 'when', 'then']) need(text(ac?.[part]), `acceptanceCriteria[${index}].${part} is empty`)
    if (ac?.example !== undefined) need(Number.isInteger(ac.example) && ac.example >= 1 && ac.example <= examples.length, `acceptanceCriteria[${index}].example must point at one of the ${examples.length} examples`)
  })

  for (const [index, defect] of (Array.isArray(p.acDefects) ? p.acDefects : []).entries()) {
    need(text(defect?.ac), `acDefects[${index}].ac must quote or name the criterion`)
    need(AC_DEFECTS.includes(defect?.kind), `acDefects[${index}].kind must be one of ${AC_DEFECTS.join(', ')}`)
    need(text(defect?.detail), `acDefects[${index}].detail is empty`)
  }
  need(p.acDefects === undefined || Array.isArray(p.acDefects), 'acDefects must be a list')

  const invest = Array.isArray(p.invest) ? p.invest : []
  need(invest.length === 6 && INVEST.every((criterion) => invest.some((entry) => entry?.criterion === criterion)), `invest must judge each of ${INVEST.join(', ')} once`)
  invest.forEach((entry, index) => {
    need(typeof entry?.pass === 'boolean', `invest[${index}].pass must be true or false`)
    need(entry?.pass === true || text(entry?.note), `invest[${index}] fails without a note`)
  })

  for (const [index, antipattern] of (Array.isArray(p.antipatterns) ? p.antipatterns : []).entries()) {
    need(text(antipattern?.name), `antipatterns[${index}].name is empty`)
    need(['CRITICAL', 'HIGH'].includes(antipattern?.severity), `antipatterns[${index}].severity must be CRITICAL or HIGH`)
  }

  // Size.
  const points = p.size?.points
  need(FIBONACCI.includes(points), `size.points must be one of ${FIBONACCI.join(', ')}`)
  need(text(p.size?.justification), 'size.justification is empty')
  const split = Array.isArray(p.size?.split) ? p.size.split : []
  if (points > 8) {
    need(split.length >= 2, 'a size above 8 needs a split into at least 2 stories')
    const rightSized = dor.find((item) => item?.item === 6)
    need(!rightSized?.pass, 'dor item 6 (right-sized) cannot pass for a size above 8')
  }
  split.forEach((part, index) => {
    need(text(part?.title), `size.split[${index}].title is empty`)
    need(FIBONACCI.includes(part?.points) && part.points <= 8, `size.split[${index}].points must be a Fibonacci size of 8 or less`)
  })

  // Triage, related issues, documents, review.
  need(TYPES.includes(p.triage?.type), `triage.type must be one of ${TYPES.join(', ')}`)
  need(PRIORITIES.includes(p.triage?.priority), `triage.priority must be one of ${PRIORITIES.join(', ')}`)
  need(p.triage?.priority !== 'P0' || text(p.triage?.justification), 'a P0 needs triage.justification')
  for (const [index, issue] of (Array.isArray(p.related) ? p.related : []).entries()) {
    need(Number.isInteger(issue?.number), `related[${index}].number must be an issue number`)
    need(SIMILARITY.includes(issue?.similarity), `related[${index}].similarity must be one of ${SIMILARITY.join(', ')}`)
  }
  need(p.docs && Array.isArray(p.docs.used) && Array.isArray(p.docs.candidates), 'docs must carry the used and candidates lists printed by resolve-docs.mjs')
  for (const [index, gap] of (Array.isArray(p.docs?.gaps) ? p.docs.gaps : []).entries()) need(text(gap), `docs.gaps[${index}] is empty`)
  need(!(p.docs?.gaps?.length) || p.docs.used.length > 0, 'docs.gaps needs a used document: a candidate to confirm is never reviewed against')
  need(VERDICTS.includes(p.review?.verdict), `review.verdict must be one of ${VERDICTS.join(', ')}, as printed by review-verdict.mjs`)
  need(Number.isInteger(p.review?.attempts) && p.review.attempts >= 1, 'review.attempts must be a positive integer')

  if (problems.length) return { problems }

  const dorPassed = dor.filter((item) => item.pass).length
  const critical = (p.antipatterns ?? []).some((antipattern) => antipattern.severity === 'CRITICAL')
  const ready = dorPassed === 8 && points <= 8 && !critical
  return {
    problems,
    proposal: {
      ...p,
      dor: [...dor].sort((left, right) => left.item - right.item).map((item) => ({ ...item, id: DOR_ITEMS[item.item - 1] })),
      derived: {
        readiness: ready ? 'READY' : 'NEEDS_REFINEMENT',
        dorPassed,
        capacityDays: CAPACITY_DAYS[points] ?? null,
        mustSplit: points > 8,
      },
    },
  }
}

export function main(argv, { read = (path) => readFileSync(path, 'utf8'), write = writeFileSync, log = console.log } = {}) {
  const args = Object.fromEntries(argv.flatMap((arg, index) => (arg.startsWith('--') ? [[arg.slice(2), argv[index + 1]]] : [])))
  if (!args.proposal) { log(JSON.stringify({ error: 'usage', message: 'check-proposal.mjs --proposal <file> [--out <file>]' })); return 1 }
  let input
  try { input = JSON.parse(read(args.proposal)) } catch (error) { log(JSON.stringify({ error: 'unreadable', message: error.message })); return 1 }
  const result = checkProposal(input)
  if (result.problems.length) { log(JSON.stringify({ error: 'invalid_proposal', problems: result.problems }, null, 2)); return 2 }
  const output = JSON.stringify(result.proposal, null, 2) + '\n'
  if (args.out) write(args.out, output)
  else log(output)
  return 0
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exitCode = main(process.argv.slice(2))
