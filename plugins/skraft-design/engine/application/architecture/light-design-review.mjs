import { deriveRun } from '../../domain/journal/run-state.mjs'
import { citedPaths, readBrief } from '../../domain/architecture/brief.mjs'
import { DESIGN_PLUGIN, assumptionsOf, decisionLine, lightDesignReasons } from '../../domain/architecture/light-design.mjs'
import { issueOf } from '../../domain/pipeline/commits.mjs'
import { acceptOnMerge, newProposedAdrs } from '../decisions/adr-ratification.mjs'
import { bindDocuments } from './context.mjs'
import { lightDesignPlan, recordRatified } from './light-design.mjs'

/**
 * The two questions of a delivery's light design (#669): which architecture the story starts
 * from, which the engine settles itself, then what a person makes of the light design.
 */

/** The architecture a delivery starts from: the brief it accepted from the merged base, a design to wait for, else none. */
export const ARCHITECTURE_MODE = Object.freeze({
  plan: async ({ journal }) => ({ answered: modeOf(journal.events) }),
  act: async () => ({ failures: [] }),
})

/** BRIEF when the delivery accepted a merged brief, WAIT when it found one it cannot deliver on, else ABSENT. @param {any[]} events */
const modeOf = (events) => {
  if (events.some(({ type }) => type === 'architecture.accepted')) return { answer: 'BRIEF', reason: 'a brief merged for this story' }
  const wait = events.findLast(({ type }) => type === 'architecture.bound')?.wait
  return wait ? { answer: 'WAIT', reason: wait.reason } : { answer: 'ABSENT', reason: 'no brief merged for this story' }
}

/**
 * The light design read by a person when it wrote an ADR, which they ratify, or went beyond a light
 * design (lightDesignReasons), and settled by the
 * engine when it wrote none and stays a light design. APPROVED binds the brief as the story's
 * architecture, its ADRs accepted on the merge of the delivery's pull request; REVISE sends the
 * light design back with the person's words; DESIGN pauses the delivery for a design run; STOP
 * ends the delivery.
 */
export const LIGHT_DESIGN_REVIEW = Object.freeze({
  plan: (context) => reviewPlan(context),
  act: (context, asked) => reviewAct(context, asked),
})

/** @param {any} context */
const reviewPlan = async ({ deps, slug, journal }) => {
  const plan = await lightDesignPlan(deps, slug)
  if (plan === null) return { environment: 'the run holds no light design plan; start the delivery again' }
  const adrs = await newProposedAdrs(deps, deriveRun(journal.events).base)
  if (typeof adrs === 'string') return { environment: adrs }
  const design = await designOf(deps, plan, adrs)
  const reasons = lightDesignReasons(design)
  const assumed = assumptionsOf(design.text)
  if (adrs.length === 0 && reasons.length === 0 && assumed === null) return { answered: { answer: 'APPROVED', reason: 'the light design wrote no ADR to ratify, assumed nothing and stays a light design' } }
  return { text: reviewText(plan, design, { reasons, assumed }), subjects: [plan.brief, ...adrs] }
}

/** The brief and the ADRs the light design wrote, as the working branch holds them. @param {any} deps @param {any} plan @param {string[]} paths */
const designOf = async (deps, plan, paths) => {
  const text = /** @type {string} */ (await deps.workspace.read(plan.brief))
  const adrs = []
  for (const path of paths) adrs.push({ path, text: (await deps.workspace.read(path)) ?? '' })
  return { brief: /** @type {any} */ (readBrief(text)), text, adrs }
}

/**
 * @param {any} plan @param {{ adrs: Array<{ path: string, text: string }> }} design
 * @param {{ reasons: string[], assumed: string | null }} doubts
 */
const reviewText = (plan, { adrs }, { reasons, assumed }) => [
  `The light design of #${plan.issue} wrote ${plan.brief}${adrsWritten(adrs)}.`,
  ...(assumed === null ? [] : [`Where the story leaves a choice open, it assumed: ${assumed} REVISE with your answer when one is wrong.`]),
  ...(reasons.length === 0 ? [] : [`It goes beyond a light design: ${reasons.join('; ')}; DESIGN is advised.`]),
  `APPROVED ${adrs.length === 0 ? 'goes on' : 'ratifies them, accepted on the merge of the delivery pull request, and goes on'} to DISTILL; REVISE sends the light design back with your corrections; DESIGN pauses the delivery until ${DESIGN_PLUGIN} merges a brief for the story; STOP ends the delivery.`,
].join(' ')

/** The ADRs the light design wrote, each with its decision; nothing when it wrote none. @param {Array<{ path: string, text: string }>} adrs */
const adrsWritten = (adrs) => {
  if (adrs.length === 0) return ''
  const count = adrs.length === 1 ? 'one ADR' : `${adrs.length} ADRs`
  return ` and ${count} that DISTILL and DELIVER will rely on: ${adrs.map(({ path, text }) => `${path}: ${decisionLine(text)}`).join('; ')}`
}

/** @param {any} context @param {{ answer: string | null, reason: string | null }} asked */
const reviewAct = async (context, { answer, reason }) => {
  if (answer === 'STOP') return { stop: 'A human stopped the delivery at its light design.' }
  if (answer === 'REVISE') return { failures: [`A human read the light design and asks for these corrections: ${reason}`] }
  if (answer === 'DESIGN') return { failures: [] }
  return approve(context)
}

/** @param {any} context */
const approve = async ({ deps, slug, journal }) => {
  const run = deriveRun(journal.events)
  const adrs = await newProposedAdrs(deps, run.base)
  if (typeof adrs === 'string') return { environment: adrs }
  if (adrs.length > 0) {
    const accepted = await acceptOnMerge(deps, { adrs, issue: issueOf(run.story) })
    if (!accepted.ok) return { environment: accepted.error }
    await recordRatified(deps, slug, adrs)
  }
  await bindLightBrief({ deps, slug, journal })
  return { failures: [] }
}

/**
 * The light brief and what it cites, as the working branch holds them now, bound as the story's
 * architecture: the run's agents and lenses read them through architecture/context.json, and the
 * brief leaves the branch before the pull request as a merged one does.
 * @param {{ deps: any, slug: string, journal: any }} run
 */
const bindLightBrief = async ({ deps, slug, journal }) => {
  const plan = await lightDesignPlan(deps, slug)
  const documents = [{ path: plan.brief, text: await deps.workspace.read(plan.brief) }]
  for (const path of citedPaths(readBrief(documents[0].text))) documents.push({ path, text: await deps.workspace.read(path) })
  await bindDocuments(deps, { slug, journal }, { documents, sha: null, path: plan.brief, mode: 'light' })
  await journal.append('architecture.accepted', { path: plan.brief, sha: null, status: 'light' })
}
