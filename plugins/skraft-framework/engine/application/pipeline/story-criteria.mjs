import { criteriaOf } from '../../domain/pipeline/scenario-criteria.mjs'

/**
 * The acceptance criteria of a story, as DISCUSS leaves them in the tracking folder.
 * @typedef {import('../ports/tracking-files.mjs').TrackingFiles} TrackingFiles
 */
export const CRITERIA = /(^|\/)plans\/[^/]+\/ac-draft-[^/]+\.md$/

/**
 * The numbers of the criteria the story's `ac-draft` documents head `## AC-<n>`.
 * @param {TrackingFiles} files @param {string} slug @returns {Promise<number[]>}
 */
export const storyCriteria = async (files, slug) => {
  const paths = (await files.list(slug, '')).filter((path) => CRITERIA.test(path))
  return criteriaOf(await Promise.all(paths.map(async (path) => (await files.read(slug, path)) ?? '')))
}
