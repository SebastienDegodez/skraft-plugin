/**
 * The HumanInteraction that posts the question on its issue as a GitHub comment with a marker
 * (so the next pass updates the comment, not duplicate it) and adds the `needs-clarification`
 * label. Always returns null: the engine journals `question.asked`, the run ends `waiting`, the
 * human answers by replying on the issue, and `skraft forge answer` feeds the reply to Decide.
 */

/** @typedef {import('../../application/ports/human-interaction.mjs').HumanInteraction} HumanInteraction */
/** @typedef {import('../../domain/decisions/questions.mjs').Question} Question */

/** @returns {HumanInteraction} */
export const createForgeHuman = ({ codeHost, files, slug, issueNumber }) => Object.freeze({
  by: 'forge-comment',
  ask: async (question) => askOnIssue({ codeHost, files, slug, issueNumber }, question),
})

/** @param {{ codeHost: object, files: object, slug: string, issueNumber: number }} deps @param {Question} question */
const askOnIssue = async ({ codeHost, files, slug, issueNumber }, question) => {
  const marker = `<sub>skraft-ask key=${question.key} run=${slug} step=${question.step}</sub>`
  const rel = `.tmp/forge/asks/${question.key}.body.md`
  await files.write(slug, rel, bodyFor(marker, question))
  const kept = await codeHost.keepIssueComment({ number: issueNumber, marker, url: null, bodyFile: files.location(slug, rel) })
  if (kept.ok) await files.write(slug, `forge/asks/${question.key}.json`, JSON.stringify({ url: kept.url }))
  await codeHost.addLabel(issueNumber, 'needs-clarification')
  return null
}

/** @param {string} marker @param {Question} question */
const bodyFor = (marker, question) => [marker, '', question.text, '', 'Reply with:', `/skraft-answer ${question.key} <OPTION>`].join('\n')
