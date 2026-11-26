import { deriveRun } from '../../domain/journal/run-state.mjs'
import { engineMessage, issueOf } from '../../domain/pipeline/commits.mjs'
import { newProposedAdrs } from '../decisions/adr-ratification.mjs'
import { acceptBrief } from './context.mjs'
import { lightDesignPlan } from './light-design.mjs'
import { DESIGN_PLUGIN } from '../../domain/architecture/light-design.mjs'
import { createArchitectureReader } from './read-architecture.mjs'

/**
 * A delivery waiting for a design (#669): asked for by a person at its light design, or because the
 * brief it found on the merged base could not be delivered on. Each visit reads the merged base
 * again: a brief merged for the story since is bound without a question, and the light design it
 * replaces leaves the branch; otherwise a person runs a design and answers RESUME, delivers on
 * a light design (CONTINUE) or stops the delivery. Nothing blocks for good.
 */
export const ARCHITECTURE_WAIT = Object.freeze({
  plan: (context) => waitPlan(context),
  act: (context, asked) => waitAct(context, asked),
})

/** What a person may answer: BRIEF is the engine's, once the merged base holds a brief. */
const ASKED = Object.freeze(['RESUME', 'CONTINUE', 'STOP'])

/** @param {any} context */
const waitPlan = async (context) => {
  const read = await mergedBrief(context)
  if ('environment' in read) return read
  if (read.found?.status === 'current') return { answered: { answer: 'BRIEF', reason: `${read.found.path} merged for this story` } }
  return { text: waitText(context, read), subjects: [], options: [...ASKED] }
}

/**
 * The story and what the merged base holds for it now.
 * @param {any} context
 * @returns {Promise<{ environment: string } | { plan: any, found: any }>}
 */
const mergedBrief = async ({ deps, slug }) => {
  const plan = await lightDesignPlan(deps, slug)
  if (plan === null) return { environment: 'the run holds no light design plan; start the delivery again' }
  const read = await deps.architectureForge.read(plan.issue)
  if (!read.ok) return { environment: 'the forge cannot read the story issue' }
  const found = await createArchitectureReader(deps).find(read.issue)
  if (found?.status === 'unreadable') return { environment: found.reason }
  return { plan, found }
}

/** @param {any} context @param {{ plan: any, found: any }} read */
const waitText = ({ slug, journal }, { plan, found }) => {
  const why = journal.events.findLast(({ type }) => type === 'architecture.bound')?.wait?.reason ?? 'a person asked for one at its light design.'
  return [`Delivery of #${plan.issue} waits for a design: ${why}`,
    ...(found === null || found.reason === why ? [] : [`The merged base now reads: ${found.reason}`]),
    nextSteps(slug, plan)].join(' ')
}

/** What a person does next, whichever made the delivery wait. @param {string} slug @param {any} plan */
const nextSteps = (slug, plan) =>
  `Run ${DESIGN_PLUGIN} on #${plan.issue} and merge its pull request, check out deliver/${slug} again, then answer RESUME: the delivery reads the merged base again. CONTINUE delivers on a light design instead; STOP ends the delivery.`

/** @param {any} context @param {{ answer: string | null }} asked */
const waitAct = async (context, { answer }) => {
  if (answer === 'STOP') return { stop: 'A human stopped the delivery while it waited for a design.' }
  if (answer !== 'BRIEF') return { failures: [] }
  const read = await mergedBrief(context)
  if ('environment' in read) return read
  await acceptBrief(context.deps, context, read.found)
  return dropLightDesign(context, read.plan)
}

/**
 * The light brief and the ADRs no person ratified, removed from the branch in one engine commit:
 * the merged brief replaces them. A branch that holds neither is left as it is.
 * @param {any} context @param {any} plan
 */
const dropLightDesign = async ({ deps, slug, journal }, plan) => {
  const run = deriveRun(journal.events)
  const adrs = await newProposedAdrs(deps, run.base)
  const paths = [...((await deps.workspace.read(plan.brief)) === null ? [] : [plan.brief]), ...(typeof adrs === 'string' ? [] : adrs)]
  if (paths.length === 0) return { failures: [] }
  const dropped = await deps.sourceControl.retireFiles('.', paths, engineMessage(`docs(${slug}): drop the light design the merged brief replaces`, issueOf(run.story)))
  return dropped.ok ? { failures: [] } : { environment: dropped.error }
}
