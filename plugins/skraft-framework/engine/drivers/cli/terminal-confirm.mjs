import { createInterface } from 'node:readline/promises'

/**
 * The person's yes to a question asked at the terminal: `y` or `yes`, in any case; null when the
 * input is no interactive terminal, so that a program or an agent piping into it cannot answer.
 * A best-effort guard: whoever types in that terminal answers.
 * @param {{ input: NodeJS.ReadableStream & { isTTY?: boolean }, output: NodeJS.WritableStream }} terminal
 * @returns {(question: string) => Promise<boolean | null>}
 */
export const terminalConfirm = ({ input, output }) => async (question) => {
  if (input.isTTY !== true) return null
  const reading = createInterface({ input, output })
  try {
    return /^y(es)?$/i.test((await reading.question(question)).trim())
  } finally {
    reading.close()
  }
}
