import { decideUsage } from '../decisions/questions.mjs'
import { cell, inert } from './markdown-safety.mjs'

/**
 * What run-report.md tells of a run that stops or waits: each commit it checked and its verdict,
 * the failures sent back to an agent by step, the incidents asked of a human, and the
 * question it waits on.
 *
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {{ step: string, sha: string, subject: string, kind: string, verdict: string }} CommitRow
 * @typedef {{ step: string, owner: string, times: number, failure: string }} RefusalRow
 * @typedef {{ key: string | null, step: string, category: string, owner: string, signature: string | null, attempts: number | null, log: string | null, answer: string | null }} IncidentRow
 * @typedef {{ key: string, kind: import('../decisions/questions.mjs').QuestionKind, step: string, text: string, options: string[] }} Waiting
 */

/** Each commit the run checked, with the verdict of its last check, in the order first checked. @param {RunEvent[]} events @returns {CommitRow[]} */
export const commitRows = (events) => {
  /** @type {Map<string, CommitRow>} */
  const rows = new Map()
  for (const { step, commits } of events.filter(({ type }) => type === 'commits.checked')) {
    for (const { sha, subject, kind, verdict } of commits) rows.set(sha, { step, sha: sha.slice(0, 7), subject, kind, verdict })
  }
  return [...rows.values()]
}

/** @param {CommitRow[]} rows */
export const commitsTable = (rows) => [
  '| Step | Commit | Subject | Kind | Verdict |',
  '| --- | --- | --- | --- | --- |',
  ...rows.map(({ step, sha, subject, kind, verdict }) => `| ${step} | ${sha} | ${cell(inert(subject))} | ${kind} | ${verdict} |`),
]

/**
 * The failures sent back to an agent, one row per node: how often an attempt or a gate step of
 * it failed, and what the first one said.
 * @param {RunEvent[]} events @returns {RefusalRow[]}
 */
export const refusalRows = (events) => {
  /** @type {Map<string, RefusalRow>} */
  const rows = new Map()
  for (const event of events.filter(({ type, outcome }) => type === 'step.recorded' && FAILED.includes(outcome))) countRefusal(rows, event)
  return [...rows.values()]
}

/** The outcomes of a refused attempt and of a failed gate step. */
const FAILED = Object.freeze(['failed', 'fail'])

/** @param {Map<string, RefusalRow>} rows @param {RunEvent} event */
const countRefusal = (rows, event) => ownersOf(event).forEach((owner) => countOwnerRefusal(rows, event, owner))

/** @param {RunEvent} event */
const ownersOf = ({ incidents = [] }) => {
  const owners = [...new Set(incidents.map((incident) => incident.owner))]
  return owners.length === 0 ? ['agent'] : owners
}

/** @param {Map<string, RefusalRow>} rows @param {RunEvent} event @param {string} owner */
const countOwnerRefusal = (rows, { step, missing = [], failures }, owner) => {
  const key = `${step}:${owner}`
  const row = rows.get(key) ?? { step, owner, times: 0, failure: [...missing.map((/** @type {string} */ path) => `missing ${path}`), ...failures][0] }
  rows.set(key, { ...row, times: row.times + 1 })
}

/** @param {RefusalRow[]} rows */
export const refusalsTable = (rows) => [
  '| Step | Owner | Times | First failure |',
  '| --- | --- | --- | --- |',
  ...rows.map(({ step, owner, times, failure }) => `| ${step} | ${owner} | ${times} | ${cell(inert(failure))} |`),
]

/** The failures recorded and incidents asked of a human, with their latest occurrence and answer. @param {RunEvent[]} events @returns {IncidentRow[]} */
export const incidentRows = (events) => {
  const rows = new Map()
  for (const event of events.filter(({ type }) => type === 'step.recorded' || type === 'question.asked')) addFailureIncidents(rows, event)
  const answers = new Map(events.filter(({ type }) => type === 'question.answered').map(({ key, answer }) => [key, answer]))
  for (const question of events.filter(({ type, incident }) => type === 'question.asked' && incident !== undefined)) attachQuestion(rows, question, answers)
  return [...rows.values()]
}

/** @param {Map<string, IncidentRow>} rows @param {RunEvent} event */
const addFailureIncidents = (rows, { step, incidents = [] }) => incidents.forEach((incident) => {
  rows.set(incident.signature, { key: null, step, category: incident.category, owner: incident.owner, signature: incident.signature, attempts: incident.attempts, log: incident.log, answer: null })
})

/** @param {Map<string, IncidentRow>} rows @param {RunEvent} question @param {Map<string, string>} answers */
const attachQuestion = (rows, { key, step, incident }, answers) => {
  const existing = [...rows.values()].findLast((row) => row.step === step && row.owner === incident.owner && row.log === incident.log)
  if (existing) Object.assign(existing, { key, answer: answers.get(key) ?? null })
  else rows.set(`question:${key}`, { key, step, category: incident.owner, owner: incident.owner, signature: null, attempts: null, log: incident.log, answer: answers.get(key) ?? null })
}

/** @param {IncidentRow[]} rows */
export const incidentsTable = (rows) => [
  '| Step | Cause | Owner | Signature | Occurrences | Output | Answer |',
  '| --- | --- | --- | --- | ---: | --- | --- |',
  ...rows.map(({ step, category, owner, signature, attempts, log, answer }) => `| ${cell(inert(step))} | ${cell(inert(category))} | ${owner} | ${signature ?? '-'} | ${attempts ?? '-'} | ${cell(inert(log ?? '-'))} | ${cell(inert(answer ?? 'waiting'))} |`),
]

/** The question the run waits on: the last one asked with no answer; null when none waits. @param {RunEvent[]} events @returns {Waiting | null} */
export const waitingOn = (events) => {
  const answered = new Set(events.filter(({ type }) => type === 'question.answered').map(({ key }) => key))
  const open = events.findLast(({ type, key }) => type === 'question.asked' && !answered.has(key))
  return open === undefined ? null : { key: open.key, kind: open.kind, step: open.step, text: open.text, options: open.options }
}

/** The question quoted, then how to answer it. @param {Waiting} waiting */
export const waitingLines = ({ key, kind, step, text, options }) => [
  `Question ${key}, on ${step}:`,
  '',
  ...text.split('\n').map((line) => `> ${inert(line)}`),
  '',
  `Answer with \`skraft decide ${key} ${decideUsage({ kind, options })}\`.`,
]
