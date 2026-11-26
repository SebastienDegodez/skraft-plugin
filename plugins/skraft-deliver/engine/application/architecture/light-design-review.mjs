import { deriveRun } from '../../domain/journal/run-state.mjs'
import { citedPaths, readBrief } from '../../domain/architecture/brief.mjs'
import { field } from '../../domain/decisions/adr.mjs'
import { issueOf } from '../../domain/pipeline/commits.mjs'
import { acceptOnMerge, newProposedAdrs } from '../decisions/adr-ratification.mjs'
import { bindDocuments } from './context.mjs'
import { lightDesignPlan } from './light-design.mjs'

/**
 * The two questions of a delivery's light design (#669): which architecture the story starts
 * from, which the engine settles itself, then what a person makes of the light design.
 */

/** The architecture a delivery starts from: the brief it accepted from the merged base, else none. */
export const ARCHITECTURE_MODE = Object.freeze({
  plan: async ({ journal }) => ({ answered: journal.events.some(({ type }) => type === 'architecture.accepted')
    ? { answer: 'BRIEF', reason: 'a brief merged for this story' }
    : { answer: 'ABSENT', reason: 'no brief merged for this story' } }),
  act: async () => ({ failures: [] }),
})

/**
 * The light design read by a person when it wrote an ADR, which they ratify, and settled by the
 * engine otherwise. APPROVED binds the brief as the story's architecture, its ADRs accepted on the
 * merge of the delivery's pull request; REVISE sends the light design back with the person's words;
 * STOP ends the delivery.
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
  if (adrs.length === 0) return { answered: { answer: 'APPROVED', reason: 'the light design wrote no ADR to ratify' } }
  return { text: await reviewText(deps, plan, adrs), subjects: [plan.brief, ...adrs] }
}

/** @param {any} deps @param {any} plan @param {string[]} adrs */
const reviewText = async (deps, plan, adrs) => {
  const decisions = []
  for (const path of adrs) decisions.push(`${path}: ${field(await deps.workspace.read(path) ?? '', 'decision') ?? 'no decision line'}`)
  return [`The light design of #${plan.issue} wrote ${plan.brief} and ${adrs.length === 1 ? 'one ADR' : `${adrs.length} ADRs`} that DISTILL and DELIVER will rely on: ${decisions.join('; ')}.`,
    'APPROVED ratifies them, accepted on the merge of the delivery pull request, and goes on to DISTILL; REVISE sends the light design back with your corrections; STOP ends the delivery.'].join(' ')
}

/** @param {any} context @param {{ answer: string | null, reason: string | null }} asked */
const reviewAct = async (context, { answer, reason }) => {
  if (answer === 'STOP') return { stop: 'A human stopped the delivery at its light design.' }
  if (answer === 'REVISE') return { failures: [`A human read the light design and asks for these corrections: ${reason}`] }
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
