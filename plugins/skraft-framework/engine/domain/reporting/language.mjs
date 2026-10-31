/**
 * The language of a story, French or English, from the title and body the engine kept for the
 * run: the words each language writes most often are counted, and French wins only on more
 * French words than English ones, so that a text with neither, or an equal count, is English.
 *
 * @typedef {'en' | 'fr'} Language
 */

const FRENCH = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'est', 'sont', 'en', 'pour', 'que', 'qui', 'dans', 'avec', 'sur', 'au', 'aux', 'ce', 'cette', 'ces', 'je', 'il', 'elle', 'nous', 'vous', 'ne', 'pas', 'par', 'plus', 'ou', 'mais', 'afin', 'peut', 'doit', 'être', 'sans'])
const ENGLISH = new Set(['the', 'an', 'of', 'and', 'is', 'are', 'to', 'for', 'that', 'with', 'on', 'in', 'as', 'it', 'be', 'this', 'by', 'not', 'or', 'can', 'should', 'when', 'so', 'from', 'without'])

/** @param {string} text @param {Set<string>} words */
const hitsOf = (text, words) => text.toLowerCase().split(/[^\p{L}]+/u).filter((word) => words.has(word)).length

/** @param {string} text @returns {Language} */
export const languageOf = (text) => (hitsOf(text, FRENCH) > hitsOf(text, ENGLISH) ? 'fr' : 'en')
