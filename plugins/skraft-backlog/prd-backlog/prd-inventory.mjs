// What a PRD asks for, read deterministically and never rewritten: the requirement ids it defines,
// the epic each one is written under, the ids it cites without defining them, its status, its MVP
// cut and the language the backlog is written in. The slicer and every check after it work from
// this inventory, never from a model's reading of the PRD.
//
// The PRD is read as it is written, whatever tool wrote it: an id is *defined* where it opens a
// heading, the first cell of a table row, a bold run, or a line or bullet followed by punctuation
// (`FR-001: …`, `` * `FR-001` : … ``, `**FR-1 Title.** …`, `| FR-001 | … |`). An id that opens a
// list (`FR-001, FR-002`) is a reference, and a table whose ids are mostly defined already is a
// reference table (a traceability matrix). Code blocks and HTML comments are skipped.
import { createHash } from 'node:crypto'

/** @param {string} text */
export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

/** The fingerprint of a story file's content, however it is indented on disk. @param {unknown} value */
export const fingerprintOf = (value) => sha256(JSON.stringify(value))

const FRENCH = /\b(le|la|les|des|une|est|doit|pour|avec|dans|qui|sur)\b/gi
const ENGLISH = /\b(the|and|must|shall|with|for|that|which|when|from|into)\b/gi

/** @param {string} text @returns {'fr' | 'en'} */
export const languageOf = (text) => {
  const sample = text.slice(0, 20000)
  return (sample.match(FRENCH)?.length ?? 0) > (sample.match(ENGLISH)?.length ?? 0) ? 'fr' : 'en'
}

/** The formats `args.format` may name; without it the PRD is read generically. */
export const FORMATS = Object.freeze(['hve'])

/**
 * The family of each prefix: `FR` must be covered, the others are placed or read as context.
 * A PRD's own frontmatter (`requirement_id_prefixes`) adds its prefixes to these.
 */
const DEFAULT_FAMILIES = Object.freeze({
  FR: 'FR', US: 'FR', NFR: 'NFR', CON: 'CON', RULE: 'CON', AC: 'AC',
  GOAL: 'GOAL', G: 'GOAL', PG: 'GOAL', BG: 'GOAL', DD: 'DD',
})
const FRONTMATTER_FAMILIES = Object.freeze({ fr: 'FR', nfr: 'NFR', con: 'CON', ac: 'AC', goal: 'GOAL' })
const EPIC_PREFIXES = Object.freeze(['EP', 'FEAT'])

const ID = String.raw`(?<![A-Za-z0-9-])[A-Z][A-Z0-9]{0,5}-\d+(?![A-Za-z0-9])`
const ID_AT_START = new RegExp(`^${ID}`)
const ID_ANYWHERE = new RegExp(ID, 'g')
const LIST_CONTINUES = new RegExp(String.raw`^(?:\*\*)?\s*(?:,|/|&|and\b|or\b|to\b|through\b|[–—]|\.\.)\s*(?:\*\*)?${ID}`)
const DEFINING_PUNCTUATION = /^\s*(?:[:.()/–—]|-\s)/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+/
const FENCE = /^\s{0,3}(```|~~~)/
const STATUS_LINE = /\bstatus\b\s*\**\s*[:|]?\s*\**\s*`?"?([a-z][a-z-]*)/i
const MVP_HEADING = /\b(mvp|release framing|scope|périmètre|first release|premi[eè]re (?:version|livraison))\b/i
const DEFERRED_LINE = /\b(defer|deferred|later|out of scope|post-mvp|not in (?:the )?(?:first|initial) release|non-goals?|différ|hors (?:périmètre|mvp)|plus tard)\b/i
const FEATURES_SECTION = /\b(features?(?: and requirements)?|fonctionnalités?)\b/i

/**
 * @typedef {'FR' | 'NFR' | 'AC' | 'CON' | 'GOAL' | 'DD'} Kind
 * @typedef {{ id: string, kind: Kind, statement: string, epic: string | null, line: number, links: string[] }} Requirement
 *   links: the ids its definition names (an AC's FRs, an FR's ACs and goals)
 * @typedef {{ id: string, title: string, line: number }} Epic
 * @typedef {{ id: string, lines: number[] }} Cited
 * @typedef {{ section: string, line: number, inScope: string[], deferred: string[] }} Mvp
 * @typedef {{ sha256: string, language: 'fr' | 'en', format: 'hve' | 'generic', formatSource: 'argument' | 'detected',
 *   status: string | null, epicSource: 'ep' | 'feat' | 'features' | 'none', epics: Epic[], requirements: Requirement[],
 *   cited: Cited[], mvp: Mvp | null }} Inventory
 */

/**
 * The inventory of a PRD, read as it is written.
 * @param {string} text
 * @param {{ format?: 'hve' }} [options] the format the human named; detected otherwise
 * @returns {Inventory}
 */
export const inventoryOf = (text, options = {}) => {
  const front = frontmatterOf(text)
  const families = familiesOf(front)
  const definitions = definitionsOf(text, families)
  const { epics, epicSource } = epicsOf(definitions, text, families)
  const requirements = definitions.filter((d) => d.kind !== null).map((d) => requirementOf(d, epics))
  return {
    sha256: sha256(text), language: languageOf(text),
    format: options.format ?? (isHveFrontmatter(front) ? 'hve' : 'generic'),
    formatSource: options.format ? 'argument' : 'detected',
    status: statusOf(front, text), epicSource, epics, requirements,
    cited: citedOf(text, new Set(definitions.map((d) => d.id)), families),
    mvp: mvpOf(text, families),
  }
}

/** @param {Inventory} inventory @param {Kind} kind */
export const idsOf = (inventory, kind) => inventory.requirements.filter((r) => r.kind === kind).map((r) => r.id)

/**
 * The acceptance criteria the PRD writes for what a story covers: the ACs it covers, and the ACs
 * linked to its FRs either way (an AC naming the FR, or the FR naming the AC).
 * @param {Inventory} inventory @param {string[]} covers @returns {Requirement[]}
 */
export const criteriaFor = (inventory, covers) => {
  const wanted = new Set(covers)
  const frs = inventory.requirements.filter((r) => r.kind === 'FR' && wanted.has(r.id))
  const linked = new Set(frs.flatMap((r) => r.links))
  return inventory.requirements.filter((r) => r.kind === 'AC'
    && (wanted.has(r.id) || linked.has(r.id) || r.links.some((id) => frs.some((fr) => fr.id === id))))
}

/** True when the PRD's status says it is still a draft. @param {Inventory} inventory */
export const isDraft = (inventory) => inventory.status !== null && /^(draft|proposed|in-progress|wip|brouillon)$/.test(inventory.status)

// ── frontmatter ────────────────────────────────────────────────────────────────────────────────

/**
 * The scalar keys of a leading YAML frontmatter and the one map skraft reads
 * (`requirement_id_prefixes`). Nothing else of YAML is needed, so nothing else is parsed.
 * @param {string} text @returns {{ keys: Record<string, string>, prefixes: Record<string, string> }}
 */
const frontmatterOf = (text) => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(text)
  const keys = {}
  const prefixes = {}
  let inPrefixes = false
  for (const line of match ? match[1].split(/\r?\n/) : []) {
    const top = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    const nested = /^\s+([A-Za-z_][\w-]*):\s*"?([A-Za-z][A-Za-z0-9_]*)"?\s*$/.exec(line)
    if (top) { keys[top[1]] = unquote(top[2]); inPrefixes = top[1] === 'requirement_id_prefixes' }
    else if (inPrefixes && nested) prefixes[nested[1]] = nested[2]
  }
  return { keys, prefixes }
}

/** @param {string} value */
const unquote = (value) => value.trim().replace(/^["']|["']$/g, '')

/** @param {{ keys: Record<string, string>, prefixes: Record<string, string> }} front */
const isHveFrontmatter = (front) => 'prd_id' in front.keys || 'requirement_id_prefixes' in front.keys

/** @param {{ prefixes: Record<string, string> }} front @returns {Map<string, Kind>} */
const familiesOf = (front) => {
  const families = new Map(Object.entries(DEFAULT_FAMILIES))
  for (const [key, prefix] of Object.entries(front.prefixes)) {
    const kind = FRONTMATTER_FAMILIES[/** @type {keyof typeof FRONTMATTER_FAMILIES} */ (key)]
    if (kind) families.set(prefix, kind)
  }
  return /** @type {Map<string, Kind>} */ (families)
}

/** @param {{ keys: Record<string, string> }} front @param {string} text */
const statusOf = (front, text) => {
  if (front.keys.status) return front.keys.status.toLowerCase()
  const head = text.split(/\r?\n/).slice(0, 40).find((line) => STATUS_LINE.test(line) && !/^\s*#/.test(line))
  return head ? /** @type {RegExpExecArray} */ (STATUS_LINE.exec(head))[1].toLowerCase() : null
}

// ── definitions ────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ id: string, prefix: string, kind: Kind | null, statement: string, line: number, heading: number | null,
 *   section: string | null, body: string, under: { id: string | null, title: string, level: number }[] }} Definition
 */

/**
 * Every id the PRD defines, in reading order, the first definition winning.
 * @param {string} text @param {Map<string, Kind>} families @returns {Definition[]}
 */
const definitionsOf = (text, families) => {
  const state = { defs: /** @type {Map<string, Definition>} */ (new Map()), table: /** @type {Definition[]} */ ([]),
    fence: false, comment: false, headings: /** @type {Definition['under']} */ ([]), last: /** @type {Definition | null} */ (null) }
  stripComments(text).split(/\r?\n/).forEach((line, index) => readLine(state, line, index + 1, families))
  closeTable(state)
  return [...state.defs.values()].sort((a, b) => a.line - b.line)
}

/** HTML comments become blank lines, so that line numbers stay true. @param {string} text */
const stripComments = (text) => text.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ''))

/** @param {any} state @param {string} line @param {number} number @param {Map<string, Kind>} families */
const readLine = (state, line, number, families) => {
  if (FENCE.test(line)) { state.fence = !state.fence; return }
  if (state.fence) return
  const isRow = line.trim().startsWith('|')
  if (!isRow && state.table.length) closeTable(state)
  if (isRow) return readRow(state, line, number, families)
  const heading = HEADING.exec(line)
  if (heading) return readHeading(state, heading, number, families)
  const bullet = BULLET.exec(line)
  const found = opening(bullet ? line.slice(bullet[0].length) : line.trimStart(), { needsPunctuation: true })
  if (found && !state.defs.has(found.id)) return define(state, found, number, null, families)
  if (state.last && line.trim()) state.last.body += ` ${line.trim()}`
}

/** @param {any} state @param {RegExpExecArray} heading @param {number} number @param {Map<string, Kind>} families */
const readHeading = (state, heading, number, families) => {
  const level = heading[1].length
  const found = opening(heading[2], { needsPunctuation: false })
  state.headings = state.headings.filter((h) => h.level < level)
  state.headings.push({ id: found?.id ?? null, title: found ? found.rest : heading[2].trim(), level })
  state.last = null
  if (found && !state.defs.has(found.id)) define(state, found, number, level, families)
}

/** @param {any} state @param {string} line @param {number} number @param {Map<string, Kind>} families */
const readRow = (state, line, number, families) => {
  const cells = line.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((cell) => cell.trim())
  const index = cells.findIndex((cell, at) => opening(cell, { needsPunctuation: false, boldOnly: at > 0 }) !== null)
  if (index < 0) return
  const found = /** @type {{ id: string, rest: string }} */ (opening(cells[index], { needsPunctuation: false, boldOnly: index > 0 }))
  const others = cells.filter((cell, at) => at !== index && cell !== '')
  const prose = others.filter((cell) => !isIdList(cell))
  const longest = prose.reduce((best, cell) => (cell.length > best.length ? cell : best), '')
  const statement = [found.rest || prose[0], longest].filter((part, at, all) => part && all.indexOf(part) === at).join(' — ')
  state.table.push(definitionOf({ id: found.id, rest: statement }, number, null, state.headings, families, others.join(' ')))
}

/** A table whose ids are mostly defined already is a traceability matrix: it defines nothing. @param {any} state */
const closeTable = (state) => {
  const known = state.table.filter((d) => state.defs.has(d.id)).length
  if (2 * known <= state.table.length) for (const d of state.table) if (!state.defs.has(d.id)) state.defs.set(d.id, d)
  state.table = []
  state.last = null
}

/** @param {any} state @param {{ id: string, rest: string }} found @param {number} number @param {number | null} heading @param {Map<string, Kind>} families */
const define = (state, found, number, heading, families) => {
  const definition = definitionOf(found, number, heading, state.headings, families, found.rest)
  state.defs.set(found.id, definition)
  state.last = heading === null ? definition : null
}

/**
 * @param {{ id: string, rest: string }} found @param {number} line @param {number | null} heading
 * @param {Definition['under']} headings @param {Map<string, Kind>} families @param {string} body
 * @returns {Definition}
 */
const definitionOf = (found, line, heading, headings, families, body) => {
  const prefix = found.id.slice(0, found.id.lastIndexOf('-'))
  const under = headings.filter((h) => h.id !== found.id)
  return { id: found.id, prefix, kind: families.get(prefix) ?? null, statement: found.rest, line, heading,
    section: under.at(-1)?.title ?? null, body, under: under.map((h) => ({ ...h })) }
}

/**
 * The id a text opens with, and what follows it, when the opening defines the id.
 * @param {string} raw @param {{ needsPunctuation: boolean, boldOnly?: boolean }} rule
 * @returns {{ id: string, rest: string } | null}
 */
const opening = (raw, { needsPunctuation, boldOnly = false }) => {
  const text = raw.replace(/^`/, '')
  const bold = text.startsWith('**')
  if (boldOnly && !bold) return null
  const match = ID_AT_START.exec(text.slice(bold ? 2 : 0))
  if (!match) return null
  const rest = text.slice((bold ? 2 : 0) + match[0].length).replace(/^`/, '').replace(/^\*\*/, '')
  if (LIST_CONTINUES.test(rest)) return null
  if (needsPunctuation && !bold && !DEFINING_PUNCTUATION.test(rest)) return null
  return { id: match[0], rest: cleanStatement(rest) }
}

/** @param {string} rest */
const cleanStatement = (rest) => rest.replace(/^\s*[:.\-–—]\s*/, '').replace(/\*\*/g, '').replace(/`/g, '').trim()

/** @param {string} cell */
const isIdList = (cell) => cell.replace(ID_ANYWHERE, '').replace(/[\s,;/&.]|and|or/g, '') === ''

// ── epics and requirements ─────────────────────────────────────────────────────────────────────

/**
 * Where the PRD's epics come from, in order: `EP-###` headings, `FEAT-###` definitions, the
 * feature headings under a features section. Without any, the slicer proposes them.
 * @param {Definition[]} definitions @param {string} text @param {Map<string, Kind>} families
 * @returns {{ epics: Epic[], epicSource: Inventory['epicSource'] }}
 */
const epicsOf = (definitions, text, families) => {
  for (const [prefix, source] of /** @type {const} */ ([['EP', 'ep'], ['FEAT', 'feat']])) {
    const epics = definitions.filter((d) => d.prefix === prefix && (prefix !== 'EP' || d.heading !== null))
      .map((d) => ({ id: d.id, title: titleOf(d.statement), line: d.line }))
    if (epics.length) return { epics, epicSource: source }
  }
  const features = featureHeadings(definitions)
  return features.length ? { epics: features, epicSource: 'features' } : { epics: [], epicSource: 'none' }
}

/** @param {string} statement */
const titleOf = (statement) => statement.split(' — ')[0].replace(/[.:]\s*$/, '').trim()

/**
 * The headings an FR sits under inside a features section, numbered `EP-001`… in reading order.
 * @param {Definition[]} definitions @returns {Epic[]}
 */
const featureHeadings = (definitions) => {
  const titles = []
  for (const d of definitions.filter((x) => x.kind === 'FR')) {
    const section = d.under.findIndex((h) => FEATURES_SECTION.test(h.title))
    const feature = section >= 0 ? d.under[section + 1] : undefined
    if (feature && feature.id === null && !titles.some((t) => t.title === feature.title)) titles.push({ title: feature.title, line: d.line })
  }
  return titles.map((t, index) => ({ id: `EP-${String(index + 1).padStart(3, '0')}`, title: t.title, line: t.line }))
}

/** @param {Definition} d @param {Epic[]} epics @returns {Requirement} */
const requirementOf = (d, epics) => ({
  id: d.id, kind: /** @type {Kind} */ (d.kind), statement: d.statement, epic: d.kind === 'FR' ? epicOf(d, epics) : null,
  line: d.line, links: [...new Set((d.body.match(ID_ANYWHERE) ?? []).filter((id) => id !== d.id))],
})

/** The epic an FR is written under: the nearest epic heading, else an epic id its definition names. @param {Definition} d @param {Epic[]} epics */
const epicOf = (d, epics) => {
  const ids = new Set(epics.map((e) => e.id))
  const heading = [...d.under].reverse().find((h) => (h.id && ids.has(h.id)) || epics.some((e) => e.title === h.title && !h.id))
  if (heading) return heading.id ?? /** @type {Epic} */ (epics.find((e) => e.title === heading.title)).id
  return (d.body.match(ID_ANYWHERE) ?? []).find((id) => ids.has(id)) ?? null
}

// ── cited, MVP ─────────────────────────────────────────────────────────────────────────────────

/**
 * The ids of a known family the PRD names but never defines, with the lines that name them.
 * @param {string} text @param {Set<string>} defined @param {Map<string, Kind>} families @returns {Cited[]}
 */
const citedOf = (text, defined, families) => {
  const cited = new Map()
  stripComments(text).split(/\r?\n/).forEach((line, index) => {
    for (const id of line.match(ID_ANYWHERE) ?? []) {
      const prefix = id.slice(0, id.lastIndexOf('-'))
      if (defined.has(id) || !(families.has(prefix) || EPIC_PREFIXES.includes(prefix))) continue
      cited.set(id, [...(cited.get(id) ?? []), index + 1])
    }
  })
  return [...cited].map(([id, lines]) => ({ id, lines: [...new Set(lines)] }))
}

/**
 * The MVP cut a PRD writes in a section of its own: the FR ids it puts in the first release and
 * the ones it defers. Only a recommendation for the framing; the human decides.
 * @param {string} text @param {Map<string, Kind>} families @returns {Mvp | null}
 */
const mvpOf = (text, families) => {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => { const h = HEADING.exec(line); return h !== null && MVP_HEADING.test(h[2]) })
  if (start < 0) return null
  const level = /** @type {RegExpExecArray} */ (HEADING.exec(lines[start]))[1].length
  const end = lines.findIndex((line, at) => { const h = HEADING.exec(line); return at > start && h !== null && h[1].length <= level })
  const isFr = (id) => families.get(id.slice(0, id.lastIndexOf('-'))) === 'FR'
  const inScope = new Set()
  const deferred = new Set()
  for (const line of lines.slice(start + 1, end < 0 ? undefined : end)) {
    for (const id of (line.match(ID_ANYWHERE) ?? []).filter(isFr)) (DEFERRED_LINE.test(line) ? deferred : inScope).add(id)
  }
  if (!inScope.size && !deferred.size) return null
  return { section: /** @type {RegExpExecArray} */ (HEADING.exec(lines[start]))[2], line: start + 1, inScope: [...inScope].filter((id) => !deferred.has(id)), deferred: [...deferred] }
}
