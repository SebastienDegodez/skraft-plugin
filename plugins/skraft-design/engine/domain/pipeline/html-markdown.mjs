/**
 * The Markdown of a text Azure Boards keeps: a field written in HTML (a work item made by hand)
 * becomes Markdown; a field written in Markdown (`multilineFieldsFormat = Markdown`) stays as
 * written. A text holds HTML when it holds a tag.
 */

/** A tag, with or without attributes: what tells HTML from Markdown. */
const HTML_TAG = /<\/?[a-z][^<>]*>/i
/** The text split before and after each `<…>`, so that no pattern runs over the whole text. */
const TOKENS = /(<[^<>]*>)/
/** A tag as one token: whether it closes, its name and its attributes. */
const TAG = /^<(\/?)([a-z][a-z0-9]*)([^<>]*)>$/i
/** The target of an `href` attribute, quoted. */
const HREF = /href\s*=\s*["']([^"']*)["']/i

const ENTITIES = Object.freeze({ __proto__: null, amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })

/** @param {string} text @returns {string} */
export const markdownOf = (text) => {
  if (!HTML_TAG.test(text)) return text
  const state = { out: /** @type {string[]} */ ([]), lists: /** @type {string[]} */ ([]), links: /** @type {string[]} */ ([]), pre: false }
  for (const token of text.split(TOKENS)) take(state, token)
  return tidy(state.out.join(''))
}

/** @typedef {{ out: string[], lists: string[], links: string[], pre: boolean }} State */

/** @param {State} state @param {string} token */
const take = (state, token) => {
  const tag = TAG.exec(token)
  if (tag === null) return void state.out.push(textOf(state, token))
  const [, closing, name, attributes] = tag
  const rule = RULES[name.toLowerCase()]
  if (rule !== undefined) state.out.push(rule(state, closing === '/', attributes))
}

/** @param {State} state @param {string} token */
const textOf = (state, token) => {
  const text = decoded(token)
  return state.pre ? text : text.replace(/\s+/g, ' ')
}

/** @param {string} text */
const decoded = (text) => text.replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z]{2,6});/gi, (entity, name) => entityOf(name) ?? entity)

/** @param {string} name @returns {string | null} */
const entityOf = (name) => {
  if (!name.startsWith('#')) return ENTITIES[name.toLowerCase()] ?? null
  const code = name[1].toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1))
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : null
}

/** The text between two blocks, and a mark both sides of it. @param {string} mark */
const marked = (mark) => () => mark
/** A block: set apart by a blank line, with what opens it. @param {string} [opening] */
const block = (opening = '') => (/** @type {State} */ _state, /** @type {boolean} */ closing) => (closing ? '\n\n' : `\n\n${opening}`)

/** A heading of that level. @param {number} level */
const heading = (level) => block(`${'#'.repeat(level)} `)

/** A list, set apart from the text around it unless it is nested in an item. @param {'ul' | 'ol'} kind */
const list = (kind) => (/** @type {State} */ state, /** @type {boolean} */ closing) => {
  if (closing) state.lists.pop()
  else state.lists.push(kind)
  return state.lists.length > (closing ? 0 : 1) ? '' : '\n\n'
}

/** The deepest indentation of a list item, in levels: a deeper list is written no further in, so that the text stays linear in its input. */
const MAX_INDENT = 10

/** @param {State} state @param {boolean} closing */
const item = (state, closing) => {
  if (closing) return ''
  const marker = state.lists.at(-1) === 'ol' ? '1.' : '-'
  return `\n${'  '.repeat(Math.min(Math.max(state.lists.length - 1, 0), MAX_INDENT))}${marker} `
}

/** @param {State} state @param {boolean} closing @param {string} attributes */
const link = (state, closing, attributes) => {
  if (!closing) {
    state.links.push(decoded(HREF.exec(attributes)?.[1] ?? ''))
    return '['
  }
  const href = state.links.pop() ?? ''
  return href === '' ? ']' : `](${href})`
}

/** @param {State} state @param {boolean} closing */
const preformatted = (state, closing) => {
  state.pre = !closing
  return closing ? '\n```\n\n' : '\n\n```\n'
}

/** @param {State} state @param {boolean} closing */
const code = (state) => (state.pre ? '' : '`')

/** What each tag becomes, by name; any other tag is dropped, its text kept. */
const RULES = Object.freeze({
  __proto__: null,
  p: block(), div: block(), blockquote: block('> '), table: block(), tr: block(), br: marked('\n'),
  h1: heading(1), h2: heading(2), h3: heading(3), h4: heading(4), h5: heading(5), h6: heading(6),
  ul: list('ul'), ol: list('ol'), li: item,
  strong: marked('**'), b: marked('**'), em: marked('*'), i: marked('*'), code, pre: preformatted, a: link,
})

/** @param {string} markdown */
const tidy = (markdown) => markdown.split('\n').map((line) => line.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
