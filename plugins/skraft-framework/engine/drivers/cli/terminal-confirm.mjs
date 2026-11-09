import { createInterface } from 'node:readline/promises'

/**
 * The variables a host sets in the shell it gives an AI agent, whatever terminal that shell has:
 * measured under the Copilot app (AI_AGENT, COPILOT_AGENT_SESSION_ID), documented by Claude Code
 * (CLAUDECODE); see docs/v2/host-verification.md.
 */
const AGENT_SHELL = Object.freeze(['AI_AGENT', 'COPILOT_AGENT_SESSION_ID', 'CLAUDECODE'])

/**
 * The person's yes to a question asked at the terminal: `y` or `yes`, in any case; null when the
 * input is no interactive terminal, so that a program or an agent piping into it cannot answer,
 * and when its environment marks an AI agent's shell, so that an agent given a terminal cannot
 * either. A best-effort guard: whoever types in a person's terminal answers.
 * @param {{ input: NodeJS.ReadableStream & { isTTY?: boolean }, output: NodeJS.WritableStream, env?: Record<string, string | undefined> }} terminal
 * @returns {(question: string) => Promise<boolean | null>}
 */
export const terminalConfirm = ({ input, output, env = {} }) => async (question) => {
  if (input.isTTY !== true || AGENT_SHELL.some((name) => (env[name] ?? '') !== '')) return null
  const reading = createInterface({ input, output })
  try {
    return /^y(es)?$/i.test((await reading.question(question)).trim())
  } finally {
    reading.close()
  }
}
