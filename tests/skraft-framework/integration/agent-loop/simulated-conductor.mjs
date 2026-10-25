// The agent that conducts the loop in a chat that can start agents but not for the engine (VS
// Code without the Copilot SDK): it runs `skraft next`, starts each agent the step lists with the
// prompt it gives, saves the agent's final reply to the reply file, runs `skraft record`, and
// stops on anything else. The agents are the scripted LLM of the pipeline repository.
import { readFileSync, writeFileSync } from 'node:fs'
import { skraft } from '../support/workspace.mjs'

/** One loop command in this process, its step as `--json` prints it. @param {string} cwd @param {string[]} args */
export const loop = async (cwd, args) => {
  const run = await skraft(cwd, [...args, '--json'])
  return { exit: run.status, step: JSON.parse(run.stdout), progress: run.stderr }
}

/** The line a brief asks its reply to end with. @param {string} brief */
export const tokenLineOf = (brief) => /^End your reply with this line, as it is: (skraft-reply: \S+)$/m.exec(brief)?.[1]

/**
 * Each agent of a dispatch step, one after the other: the scripted LLM reads the brief the prompt
 * names; its final message (a phase agent ends with `done`), ended with the brief's token line,
 * goes to the reply file, unless `saves` says the conductor forgot it; `signs: false` leaves
 * the token line out.
 * @param {{ dispatches: Array<{ agent: string, prompt: string, brief: string, reply: string }> }} step
 * @param {{ act: (prompt: string) => string | undefined }} llm
 * @param {(dispatch: { agent: string }) => boolean} saves
 * @param {(dispatch: { agent: string }) => boolean} signs
 */
export const startAgents = (step, llm, saves = () => true, signs = () => true) => {
  for (const dispatch of step.dispatches) {
    if (!dispatch.prompt.includes(dispatch.brief)) throw new Error(`the prompt does not name the brief: ${dispatch.prompt}`)
    const brief = readFileSync(dispatch.brief, 'utf8')
    const reply = llm.act(brief) ?? 'done'
    if (saves(dispatch)) writeFileSync(dispatch.reply, signs(dispatch) ? `${reply}\n${tokenLineOf(brief)}\n` : reply)
  }
}

/**
 * Conducts the loop from `skraft next` until a step that is neither a dispatch nor a question;
 * each question is answered by the human with `skraft decide` (the first option by default),
 * then the loop goes on with `next`.
 * @param {string} cwd @param {{ act: (prompt: string) => string | undefined }} llm
 * @param {{ answer?: (question: { key: string, options: string[] }) => string[] }} [options]
 * @returns {Promise<{ step: any, steps: any[] }>} the last step, and every step in order
 */
export const conduct = async (cwd, llm, { answer = (question) => [question.options[0]] } = {}) => {
  const steps = []
  let { step } = await loop(cwd, ['next'])
  while (steps.length < 200) {
    steps.push(step)
    if (step.status === 'dispatch') {
      startAgents(step, llm)
      ;({ step } = await loop(cwd, ['record']))
    } else if (step.status === 'waiting') {
      const { question } = JSON.parse((await skraft(cwd, ['status', '--json'])).stdout)
      await skraft(cwd, ['decide', question.key, ...answer(question)])
      ;({ step } = await loop(cwd, ['next']))
    } else {
      return { step, steps }
    }
  }
  throw new Error('the loop did not end within 200 steps')
}
