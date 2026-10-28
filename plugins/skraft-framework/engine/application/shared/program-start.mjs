import { lookedFor, programChoices } from '../../domain/gates/command-line.mjs'

/**
 * @typedef {import('../ports/command-runner.mjs').CommandResult} CommandResult
 * @typedef {CommandResult & { argv: string[] }} Started
 *   argv: the choice that started, or the program as written when none did.
 */

/**
 * The first of the command's program choices that starts, with the argv it started. When none
 * starts, the answer to the program as written, with every place it was looked for.
 * @param {(argv: string[]) => Promise<CommandResult>} run starts one argv
 * @param {string[]} argv
 * @returns {Promise<Started>}
 */
export const startFirst = async (run, argv) => {
  const choices = programChoices(argv)
  const answers = []
  for (const choice of choices) {
    const answer = await run(choice)
    if (answer.started) return { ...answer, argv: choice }
    answers.push(answer)
  }
  const written = answers[choices.findIndex(([program]) => program === argv[0])]
  return { ...written, argv, error: `${written.error}${lookedFor(choices)}` }
}
