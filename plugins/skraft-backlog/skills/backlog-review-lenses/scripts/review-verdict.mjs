#!/usr/bin/env node
// Computes the verdict of a backlog review from the lens results, and writes the review file.
// The producer dispatches the lenses; this script, not the producer, decides the verdict, so a
// producer never approves its own work.
//
//   node review-verdict.mjs --phase discover|discuss|refine --lens a.json --lens b.json \
//     [--attempt N] [--reviewed path] [--out reviews/2026-10-09/discuss-review-1.md]
//
// A lens result is JSON: { "lens": "planning-dor", "verdict": "pass|fail|inconclusive",
//   "defects": [{ "gate": "G7", "severity": "blocker|high|medium|low", "story": "S-1",
//   "location": "…", "description": "…", "suggestion": "…" }] }
//
// Exit codes: 0 APPROVED, 3 NEEDS_REWORK, 4 REJECTED, 1 usage or unreadable input.
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const WEIGHTS = Object.freeze({ completeness: 0.3, 'business-fit': 0.3, quality: 0.15, risk: 0.25 })

// Which lens runs in each phase, and which question each gate answers.
export const PHASES = Object.freeze({
  discover: {
    lenses: ['discovery-completeness', 'discovery-prioritization', 'discovery-duplicate'],
    gates: { G1: 'completeness', G2: 'completeness', G3: 'business-fit', G4: 'risk', G5: 'quality', G6: 'quality' },
    answeredBy: {
      completeness: ['discovery-completeness'],
      'business-fit': ['discovery-prioritization'],
      quality: ['discovery-duplicate'],
      risk: ['discovery-prioritization'],
    },
  },
  discuss: {
    lenses: ['planning-invest', 'planning-ac-quality', 'planning-coherence', 'planning-dor'],
    gates: { G1: 'quality', G2: 'quality', G3: 'business-fit', G4: 'business-fit', G5: 'risk', G6: 'risk', G7: 'completeness', G8: 'business-fit' },
    answeredBy: {
      completeness: ['planning-dor'],
      'business-fit': ['planning-ac-quality', 'planning-dor'],
      quality: ['planning-invest'],
      risk: ['planning-coherence'],
    },
  },
  // One issue, no sprint: the coherence lens has nothing to check, INVEST carries the risk.
  refine: {
    lenses: ['planning-invest', 'planning-ac-quality', 'planning-dor'],
    gates: { G1: 'quality', G2: 'risk', G3: 'business-fit', G4: 'business-fit', G7: 'completeness', G8: 'business-fit' },
    answeredBy: {
      completeness: ['planning-dor'],
      'business-fit': ['planning-ac-quality', 'planning-dor'],
      quality: ['planning-invest'],
      risk: ['planning-invest'],
    },
  },
})

const SEVERITIES = ['low', 'medium', 'high', 'blocker']
const LENS_VERDICTS = ['pass', 'fail', 'inconclusive']
const rank = (severity) => SEVERITIES.indexOf(severity)

const normalizeLensName = (name) => String(name ?? '').trim().replace(/-lens$/, '')

/** Validates one lens result. Returns { lens, problems } — an empty problems list means usable. */
export function validateLensResult(result) {
  const problems = []
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return { lens: null, problems: ['not a JSON object'] }
  const lens = normalizeLensName(result.lens)
  if (!lens) problems.push('missing "lens"')
  if (!LENS_VERDICTS.includes(result.verdict)) problems.push(`"verdict" must be one of ${LENS_VERDICTS.join(', ')}`)
  if (!Array.isArray(result.defects)) problems.push('"defects" must be an array (use [] when none)')
  else {
    result.defects.forEach((defect, index) => {
      if (!defect || typeof defect !== 'object') return problems.push(`defects[${index}] is not an object`)
      if (typeof defect.gate !== 'string' || !/^G\d+$/.test(defect.gate)) problems.push(`defects[${index}].gate must look like G1`)
      if (!SEVERITIES.includes(String(defect.severity).toLowerCase())) problems.push(`defects[${index}].severity must be one of ${SEVERITIES.join(', ')}`)
      if (typeof defect.description !== 'string' || !defect.description.trim()) problems.push(`defects[${index}].description is empty`)
    })
    if (result.verdict === 'pass' && result.defects.some((d) => rank(String(d?.severity).toLowerCase()) >= rank('medium'))) {
      problems.push('"verdict" is pass but a medium or higher defect is listed')
    }
  }
  return { lens, problems }
}

const placeOf = (defect) => [defect.story, defect.location].filter((part) => part != null && String(part).trim()).map((part) => String(part).trim().toLowerCase()).join(' / ')
const keyOf = (defect) => `${defect.gate}|${placeOf(defect)}`

/**
 * Pure verdict computation.
 * @param {'discover'|'discuss'|'refine'} phase
 * @param {object[]} results lens results (already parsed)
 */
export function computeVerdict(phase, results) {
  const config = PHASES[phase]
  if (!config) throw new Error(`unknown phase: ${phase}`)
  const reasons = []
  const lenses = {}
  for (const result of results) {
    const { lens, problems } = validateLensResult(result)
    const name = lens ?? 'unknown'
    if (problems.length) {
      reasons.push(`${name}: unusable result (${problems.join('; ')})`)
      lenses[name] = { status: 'inconclusive', findings: [] }
      continue
    }
    if (!config.lenses.includes(lens)) {
      reasons.push(`${lens}: not a lens of the ${phase} review`)
      continue
    }
    const findings = result.defects.map((defect) => ({ ...defect, severity: defect.severity.toLowerCase(), lens }))
    lenses[lens] = { status: result.verdict, findings }
  }
  for (const lens of config.lenses) {
    if (!lenses[lens]) {
      reasons.push(`${lens}: no result`)
      lenses[lens] = { status: 'inconclusive', findings: [] }
    }
  }

  // The strictest severity wins when two lenses report the same gate at the same place.
  const merged = new Map()
  const dissent = []
  for (const [lens, { findings }] of Object.entries(lenses)) {
    for (const finding of findings) {
      const key = keyOf(finding)
      const previous = merged.get(key)
      if (!previous) { merged.set(key, finding); continue }
      if (previous.severity !== finding.severity) {
        const strict = rank(finding.severity) > rank(previous.severity) ? finding : previous
        dissent.push(`${previous.lens} rated ${finding.gate} at "${key.split('|')[1] || 'the artefact'}" ${previous.severity}; ${lens} rated it ${finding.severity}. ${strict.severity} applied.`)
        merged.set(key, strict)
      }
    }
  }
  const findings = [...merged.values()]

  const questions = {}
  for (const [question, weight] of Object.entries(WEIGHTS)) {
    const answeredBy = config.answeredBy[question] ?? []
    if (answeredBy.length === 0) {
      reasons.push(`${question}: no lens answers this question`)
      questions[question] = { answered_by: [], weight, contribution: 0 }
      continue
    }
    const inconclusive = answeredBy.some((lens) => lenses[lens].status === 'inconclusive')
    const own = findings.filter((f) => config.gates[f.gate] === question)
    const rating = inconclusive || own.some((f) => f.severity === 'blocker') ? 0 : own.some((f) => rank(f.severity) >= rank('medium')) ? 0.5 : 1
    questions[question] = { answered_by: answeredBy, weight, contribution: Math.round(rating * weight * 100) / 100 }
  }

  for (const finding of findings) {
    if (!(finding.gate in config.gates)) reasons.push(`${finding.lens}: gate ${finding.gate} is not part of the ${phase} review`)
  }

  const blocking = findings.filter((f) => f.severity === 'blocker')
  // A story missing two or more Definition of Ready items is unrefined, whatever each item weighs.
  const dorByStory = new Map()
  for (const f of findings.filter((f) => f.gate === 'G7' && phase !== 'discover')) {
    const story = String(f.story ?? f.location ?? '').trim() || 'the story'
    dorByStory.set(story, (dorByStory.get(story) ?? 0) + 1)
  }
  const unrefined = [...dorByStory].filter(([, count]) => count >= 2).map(([story]) => story)

  let verdict = 'APPROVED'
  if (blocking.length || unrefined.length) verdict = 'REJECTED'
  else if (reasons.length || findings.some((f) => rank(f.severity) >= rank('medium'))
    // A lens that fails without naming a medium or higher defect is not a pass either.
    || Object.values(lenses).some((l) => l.status === 'inconclusive' || l.status === 'fail')) verdict = 'NEEDS_REWORK'

  const strip = ({ lens, ...rest }) => rest
  return {
    verdict,
    phase,
    lenses: Object.fromEntries(Object.entries(lenses).map(([name, l]) => [name, {
      status: l.status,
      findings: findings.filter((f) => f.lens === name).map(strip),
    }])),
    synthesis: {
      questions,
      blocking_findings: [
        ...blocking.map((f) => `${f.gate}${f.story ? ` ${f.story}` : ''}: ${f.description}`),
        ...unrefined.map((story) => `G7 ${story}: two or more Definition of Ready items fail`),
      ],
      recommendations: findings.filter((f) => f.suggestion).map((f) => `${f.gate}${f.story ? ` ${f.story}` : ''}: ${f.suggestion}`),
      dissent: dissent.length ? dissent.join(' ') : 'none',
      problems: reasons,
    },
  }
}

export function renderReview(review, { attempt, reviewed = [], date = new Date().toISOString() } = {}) {
  const payload = { ...review, attempt: attempt ?? 1, reviewed_at: date, artefacts_reviewed: reviewed }
  return [
    '<!-- markdownlint-disable-file -->',
    `# ${review.phase.toUpperCase()} review — attempt ${payload.attempt}`,
    '',
    `verdict: ${review.verdict}`,
    '',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
    '',
  ].join('\n')
}

export const EXIT = Object.freeze({ APPROVED: 0, NEEDS_REWORK: 3, REJECTED: 4 })

export function parseArgs(argv) {
  const options = { lens: [], reviewed: [] }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    const value = () => {
      const next = argv[++index]
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} needs a value`)
      return next
    }
    if (arg === '--phase') options.phase = value()
    else if (arg === '--lens') options.lens.push(value())
    else if (arg === '--reviewed') options.reviewed.push(value())
    else if (arg === '--attempt') options.attempt = Number.parseInt(value(), 10)
    else if (arg === '--out') options.out = value()
    else throw new Error(`unknown argument: ${arg}`)
  }
  if (!PHASES[options.phase]) throw new Error(`--phase must be one of ${Object.keys(PHASES).join(', ')}`)
  if (options.lens.length === 0) throw new Error('give each lens result with --lens <file.json>')
  if (options.attempt !== undefined && !(options.attempt >= 1)) throw new Error('--attempt must be a positive integer')
  return options
}

export function main(argv, { read = (path) => readFileSync(path, 'utf8'), write = writeFile, log = console.log, error = console.error } = {}) {
  let options
  try { options = parseArgs(argv) } catch (err) { error(`review-verdict: ${err.message}`); return 1 }
  const results = []
  for (const path of options.lens) {
    try { results.push(JSON.parse(read(path))) } catch (err) {
      // An unreadable lens is a lens that did not answer; the verdict says so.
      results.push({ lens: path, verdict: 'unparseable', defects: [], error: err.message })
    }
  }
  const review = computeVerdict(options.phase, results)
  if (options.out) write(options.out, renderReview(review, options))
  log(JSON.stringify({ verdict: review.verdict, out: options.out ?? null, blocking: review.synthesis.blocking_findings, problems: review.synthesis.problems }))
  return EXIT[review.verdict]
}

function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exitCode = main(process.argv.slice(2))
