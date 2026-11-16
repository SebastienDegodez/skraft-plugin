import { createStartMutation } from '../../application/mutation/start-mutation-usecase.mjs'
import { createAgentLoop } from './agent-loop.mjs'

/**
 * `skraft mutation` on the command line, through the agent loop: the run of the branch HEAD is
 * on follows the mutation workflow in its own folder, until it needs agents or a person; `record`
 * hands the agents' replies back, `decide` a person's answer. Everything else is the loop's.
 *
 * @typedef {import('./agent-loop.mjs').LoopAdapters & { mutationRun: MutationRun }} MutationAdapters
 * @typedef {Pick<import('./agent-loop.mjs').LoopAdapters, 'journal' | 'activePipeline' | 'files' | 'runLock' | 'workflowSource'>} MutationRun
 *   what replaces the pipeline's adapters for a mutation run
 * @typedef {{ adapters: MutationAdapters, command: string, log: (line: string) => void }} MutationLoopDeps
 *   command: how the conducting agent starts this script
 */

/**
 * The adapters of the mutation run: the pipeline's, its tracking folder and workflow replaced.
 * @param {MutationAdapters} adapters
 */
export const mutationAdapters = (adapters) => ({ ...adapters, ...adapters.mutationRun })

/**
 * `next`: starts or resumes the branch's run, then runs it on; `record`: hands the saved replies to it.
 * @param {MutationLoopDeps} deps @param {'next' | 'record'} step
 * @returns {Promise<import('./agent-loop.mjs').LoopStep>}
 */
export const mutationThroughLoop = async ({ adapters, command, log }, step) => {
  const run = mutationAdapters(adapters)
  const loop = createAgentLoop({ adapters: run, then: mutationThen(command), log })
  if (step === 'record') return loop.record()
  const started = await createStartMutation(run).start()
  if (!started.ok) return { status: 'refused', slug: started.slug, phase: null, code: started.code, reason: started.reason, dispatches: [], then: null }
  return loop.next()
}

/**
 * What the conducting agent runs once a step of the mutation run is done; a mutation run
 * reviews no pull request, so its review goes on as a record would.
 * @param {string} command @returns {import('./agent-loop.mjs').LoopThen}
 */
const mutationThen = (command) => ({
  next: `${command} mutation`,
  record: `${command} mutation record`,
  decide: `${command} mutation decide`,
  review: () => `${command} mutation record`,
})
