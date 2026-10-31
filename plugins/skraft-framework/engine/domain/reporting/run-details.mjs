/**
 * The run details a pull request keeps in comments when its body would not hold them: the
 * folded sections packed whole into parts a comment takes, each part opening on a marker line
 * that finds it again and a heading in the story's language, « k/n » after it when one part is
 * not enough; a part no longer used is emptied, never deleted.
 *
 * @typedef {import('./language.mjs').Language} Language
 */

/** What a heading, the pointer in the body and an emptied part say, per language. */
const WORDS = Object.freeze({
  en: {
    title: 'skraft · run details',
    pointer: 'The run\'s other details (tests, consistency matrix, RED evidence, quality gates, review, screenshots, run summary, AI disclosure) are in this pull request\'s comments titled skraft · run details.',
    unused: 'This part of the run details is no longer used.',
  },
  fr: {
    title: 'skraft · détails du run',
    pointer: 'Les autres détails du run (tests, matrice de cohérence, preuves RED, portes de qualité, revue, captures d\'écran, résumé du run, mention de l\'IA) sont dans les commentaires de cette pull request intitulés skraft · détails du run.',
    unused: 'Cette partie des détails du run n\'est plus utilisée.',
  },
})

/** What a comment's marker and heading take, which a part leaves out of the room its blocks have. */
export const HEADER_RESERVE = 200

/** The line of the body that sends to the comments. @param {Language} language */
export const pointerOf = (language) => WORDS[language].pointer

/** The line that opens a part's comment and finds it again. @param {string} slug @param {number} part */
export const markerOf = (slug, part) => `<!-- skraft:run-details slug=${slug} part=${part} -->`

/** @param {{ slug: string, language: Language }} run @param {number} part @param {number} parts */
const headerOf = ({ slug, language }, part, parts) => `${markerOf(slug, part)}\n# ${WORDS[language].title}${parts > 1 ? ` ${part}/${parts}` : ''}\n\n`

/**
 * The comments of the run details: the blocks packed in order, whole, into as many parts as take
 * them within the comment limit.
 * @param {{ slug: string, language: Language, commentLimit: number }} run @param {string[]} blocks each at most the limit less HEADER_RESERVE
 * @returns {string[]}
 */
export const detailParts = (run, blocks) => {
  const groups = packed(blocks, run.commentLimit - HEADER_RESERVE)
  return groups.map((group, index) => `${headerOf(run, index + 1, groups.length)}${group.join('\n')}`)
}

/** @param {string[]} blocks @param {number} room @returns {string[][]} */
const packed = (blocks, room) => blocks.reduce((groups, block) => (
  [...groups.slice(0, -1), ...placed(groups.at(-1) ?? [], block, room)]
), /** @type {string[][]} */ ([[]]))

/** The block after the group's, in it while they fit together, else in a group of its own. @param {string[]} group @param {string} block @param {number} room */
const placed = (group, block, room) => ([...group, block].join('\n').length <= room ? [[...group, block]] : [group, [block]])

/** The comment of a part no longer used. @param {{ slug: string, language: Language }} run @param {number} part */
export const emptiedPart = (run, part) => `${headerOf(run, part, 1)}${WORDS[run.language].unused}\n`
