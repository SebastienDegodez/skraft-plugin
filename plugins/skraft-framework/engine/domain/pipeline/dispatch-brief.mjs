/**
 * The prompt a dispatched agent receives, the same on every host.
 *
 * @param {{
 *   agent: string, phase: string, slug: string,
 *   story: { issue?: number | null, title?: string | null } | null,
 *   outputs: string[], missing: string[], attempt: number, maxAttempts: number,
 * }} brief outputs and missing are absolute paths
 */
export const composeBrief = ({ agent, phase, slug, story, outputs, missing, attempt, maxAttempts }) => [
  `## Skraft dispatch: ${agent} (${phase})`,
  `- Story: ${storyLine(story)}`,
  `- Feature scope: ${slug}`,
  `- Attempt: ${attempt} of ${maxAttempts}`,
  '- Fill each output in place. The engine pre-created it from its template; keep the path, create no other copy:',
  ...outputs.map((path) => `- ${path}`),
  ...(missing.length > 0 ? ['', `Missing outputs from attempt ${attempt - 1} of ${maxAttempts}:`, ...missing.map((path) => `- ${path}`)] : []),
].join('\n')

/** @param {{ issue?: number | null, title?: string | null } | null} story */
const storyLine = (story) => {
  const parts = [story?.issue ? `#${story.issue}` : null, story?.title || null].filter(Boolean)
  return parts.length > 0 ? parts.join(' — ') : 'none'
}

/**
 * Stable across a resume: a host that memoises dispatches by label finds it again.
 * @param {{ slug: string, step: string, attempt: number }} dispatch
 */
export const dispatchLabel = ({ slug, step, attempt }) => `skraft ${slug} · ${step} · attempt ${attempt}`
