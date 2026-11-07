/**
 * What an ADR must not cite to read on its own: a code file (code moves), an acceptance criterion
 * or a ticket (the story stays in decisions-index.md). An `ADR-NNN` reference stays allowed.
 */

const URL = String.raw`\b[A-Za-z][\w+.-]*:\/\/\S+`
const LINE = String.raw`:\d+(?:-\d+)?(?![\w/])`
const PATH = String.raw`(?<![\w/\\:.-])[\\/]?(?:[\w.-]+[\\/])+[\w-]+(?:\.[\w-]+)*\.[a-z][a-z\d]*(?:${LINE})?`
const NAME_AT_LINE = String.raw`(?<![\w/:.-])[\w-]+(?:\.[\w-]+)*\.[a-z][a-z\d]*${LINE}`
// A URL is matched first and kept whole, so that its path is never read as a file.
const URL_OR_CODE_FILE = new RegExp([URL, String.raw`#file:\S*\w`, PATH, NAME_AT_LINE].join('|'), 'g')
const IS_URL = new RegExp(`^${URL}`)
const CRITERION = /\bAC[- ]?\d+\b|\bacceptance criteri(?:on|a)\b|\bcritères? d['’]acceptation\b/gi
const TICKET = /\bAB#\d+\b|(?<![\w&])#\d+\b|(?:https?:\/\/[^\s)]*)?\/(?:issues|pulls?|_workitems\/edit)\/\d+/g
const UNREAD_LINES = /^(?:# |\*\*Supersedes:\*\*).*$/gm
const ADR_LINK = /\[(ADR-\d+)\]\([^)]*\)/g

/** The code files a text cites, as written. @param {string} text */
const codeFiles = (text) => (text.match(URL_OR_CODE_FILE) ?? []).filter((token) => !IS_URL.test(token))

/** The text with each code file it cites blanked out, its URLs kept. @param {string} text */
// Stryker disable next-line StringLiteral: no pin straddles a blanked file, which no word character precedes and no digit follows
export const withoutCodeFiles = (text) => text.replace(URL_OR_CODE_FILE, (token) => (IS_URL.test(token) ? token : ' '))

/** The text a citation is looked for in: no title line, no Supersedes line, ADR links as their name. @param {string} text */
const readable = (text) => text.replace(UNREAD_LINES, '').replace(ADR_LINK, '$1')

/**
 * Each citation an ADR's body and decision hold, once per token, one line each.
 * @param {string} path @param {string} prose the body and the decision
 * @returns {string[]}
 */
export const citationProblems = (path, prose) => {
  const text = readable(prose)
  const once = (/** @type {string[]} */ tokens) => [...new Set(tokens)]
  return [
    ...once(codeFiles(text)).map((token) => `${path} cites a code file (${token}): an ADR names the component, never the file; code moves`),
    ...once(text.match(CRITERION) ?? []).map((token) => `${path} cites an acceptance criterion (${token}): an ADR states the decision, the story stays in decisions-index.md`),
    ...once(text.match(TICKET) ?? []).map((token) => `${path} cites a ticket (${token}): an ADR reads on its own, the story and its tickets stay in decisions-index.md`),
  ]
}
