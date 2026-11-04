import { languageOf } from '../../domain/reporting/language.mjs'

/**
 * The story's language, French or English, from its title and the issue the run kept in the
 * tracking folder (title and body as the forge gave them); English when it has neither. Every
 * text the run puts on the forge, and the prose the pr-writer writes, is in it.
 * @param {{ files: import('../ports/tracking-files.mjs').TrackingFiles }} deps @param {string} slug
 * @param {import('../../domain/journal/run-state.mjs').RunState} run
 * @returns {Promise<import('../../domain/reporting/language.mjs').Language>}
 */
export const storyLanguage = async ({ files }, slug, run) => {
  const kept = run.artifacts.find((path) => /(?:^|\/)issue-\d+\.md$/.test(path))
  const text = kept === undefined ? null : await files.read(slug, kept)
  return languageOf(`${run.story?.title ?? ''}\n${text ?? ''}`)
}
