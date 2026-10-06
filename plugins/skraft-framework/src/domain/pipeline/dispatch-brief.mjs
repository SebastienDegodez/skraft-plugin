import { renderHandoff } from '../handoff-policy.mjs'

// Pure: the prompt a phase agent receives, whatever host dispatches it (a Claude Code
// mod's $.agent.spawn, a Copilot workflow's ctx.agent). What the orchestrator prose
// used to assemble by hand (skraft-orchestrator.md "Dispatch payload") is composed here
// once, so every host sends the same words and the handoff guard (G9) always passes.

// First line of every prompt RunPipeline dispatches. The settings hooks read it: G6 stays
// silent for these dispatches, because the code records the artefacts and the verdict itself.
export const CODE_DRIVEN_DISPATCH_MARKER = '<!-- skraft-dispatch: run-pipeline -->'
export const isCodeDrivenDispatch = (prompt) =>
  typeof prompt === 'string' && prompt.trimStart().startsWith(CODE_DRIVEN_DISPATCH_MARKER)

const MARKDOWN_CONVENTION = 'Markdown artefacts start with `<!-- markdownlint-disable-file -->`.'
const COMMIT_CONVENTION = 'Commits: `git commit -s`, subject `type(feature): subject`, body ending with `Refs: #N` (or `Closes #N`).'

// The review a reviewer writes this pass. `{N}` of the published descriptor
// (reviews/{date}/design-review-{N}.md) is the 1-based count of reviews the phase
// recorded, so a re-review never overwrites the review its findings came from.
export const reviewOutputPath = ({ phase, date, recordedReviews = 0 }) =>
  `reviews/${date}/${String(phase).toLowerCase()}-review-${recordedReviews + 1}.md`

const storyLine = (story) => {
  if (!story || (!story.issue && !story.title)) return 'none'
  return [story.issue ? `#${story.issue}` : null, story.title ?? null].filter(Boolean).join(' — ')
}

// addenda — extra sections appended verbatim, each { title, body }.
export const composeDispatchBrief = ({ handoff, slug, story, trackingPrefix, outputs = [], addenda = [] }) => {
  const lines = [
    CODE_DRIVEN_DISPATCH_MARKER,
    `## Skraft dispatch — ${handoff.agent} (${handoff.phase} ${handoff.role})`,
    `- Story: ${storyLine(story)}`,
    `- Feature scope: ${slug}`,
    ...(outputs.length > 0
      ? ['- Write your output exactly at:', ...outputs.map((path) => `  - \`${trackingPrefix}${path}\``)]
      : []),
    `- ${MARKDOWN_CONVENTION}`,
    ...(handoff.role === 'specialist' ? [`- ${COMMIT_CONVENTION}`] : []),
    '',
    renderHandoff(handoff, { trackingPrefix }),
  ]
  for (const { title, body } of addenda) {
    lines.push('', `## ${title}`, body)
  }
  return lines.join('\n')
}

// The addendum a specialist receives on a rework: the reviewer's findings, verbatim.
export const reworkAddendum = ({ attempt, maxAttempts, findings }) => ({
  title: `Reviewer findings (attempt ${attempt} of ${maxAttempts})`,
  body: `${findings}\n\nRevise your output in place at the same dated paths.`,
})

export const ENVIRONMENT_REGATE_ADDENDUM = Object.freeze({
  title: 'Environment re-gate',
  body: 'Re-run only the gates the previous review names inconclusive; change no code.',
})
