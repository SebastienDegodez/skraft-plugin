// Render a terminal transcript as a self-contained SVG for the handbook: monospaced, a dark
// terminal card that reads the same on the light and the dark theme, long lines wrapped, the
// status words of the skraft command line coloured (ok, WARN, FAIL, pass, fail). No font file,
// no script: the image is text the browser draws, so it stays sharp and searchable.

const COLUMNS = 104
const CHAR_WIDTH = 8.4
const LINE_HEIGHT = 20
const PADDING = 18
const BAR = 30

const COLOURS = Object.freeze({
  background: '#16181d',
  border: '#2c313a',
  bar: '#20242b',
  text: '#d7dae0',
  muted: '#8b929c',
  prompt: '#7cc4ff',
  ok: '#4fc27a',
  warn: '#e3b341',
  fail: '#f47067',
})

const STATUS = [
  [/^(ok)(\s)/, 'ok'],
  [/^(pass)(\s)/, 'ok'],
  [/^(WARN)(\s)/, 'warn'],
  [/^(FAIL)(\s)/, 'fail'],
  [/^(fail)(\s)/, 'fail'],
]

/** @param {string} text */
export const escapeXml = (text) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])

/**
 * A line cut into rows of at most `columns` characters, the rows after the first indented by
 * two spaces more than the line, so that a wrapped line reads as one.
 * @param {string} line @param {number} [columns]
 * @returns {string[]}
 */
export const wrap = (line, columns = COLUMNS) => {
  if (line.length <= columns) return [line]
  const indent = ' '.repeat(Math.min((line.match(/^ */)?.[0].length ?? 0) + 6, 24))
  const rows = []
  let rest = line
  let width = columns
  while (rest.length > width) {
    const cut = rest.lastIndexOf(' ', width)
    const at = cut > width / 2 ? cut : width
    rows.push(rest.slice(0, at).trimEnd())
    rest = `${indent}${rest.slice(at).trimStart()}`
    width = columns
  }
  rows.push(rest)
  return rows
}

/** One row as SVG tspans: the prompt, a coloured status word, or plain text. @param {string} row */
const spans = (row) => {
  if (row.startsWith('$ ')) return `<tspan fill="${COLOURS.prompt}">$</tspan> <tspan fill="${COLOURS.text}" font-weight="600">${escapeXml(row.slice(2))}</tspan>`
  if (row.trim() === '…') return `<tspan fill="${COLOURS.muted}">${escapeXml(row)}</tspan>`
  for (const [pattern, kind] of STATUS) {
    const match = row.match(pattern)
    if (match) return `<tspan fill="${COLOURS[kind]}" font-weight="600">${escapeXml(match[1])}</tspan>${escapeXml(row.slice(match[1].length))}`
  }
  return escapeXml(row)
}

/**
 * The SVG of a transcript: `$ ` lines are the commands typed, the others what they printed.
 * @param {string[]} lines @param {{ title: string, label: string, columns?: number }} meta
 *   title: the window title; label: the accessible name of the image; columns: where lines wrap
 * @returns {string}
 */
export const terminalSvg = (lines, { title, label, columns = COLUMNS }) => {
  const rows = lines.flatMap((line) => wrap(line.replace(/\t/g, '  ').replace(/\s+$/, ''), columns))
  const longest = Math.max(40, ...rows.map((row) => row.length))
  const width = Math.ceil(PADDING * 2 + longest * CHAR_WIDTH)
  const height = BAR + PADDING + rows.length * LINE_HEIGHT + PADDING / 2
  const text = rows.map((row, index) => `<text x="${PADDING}" y="${BAR + PADDING + (index + 0.75) * LINE_HEIGHT}" xml:space="preserve">${spans(row)}</text>`).join('\n  ')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">
  <title>${escapeXml(label)}</title>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" fill="${COLOURS.background}" stroke="${COLOURS.border}"/>
  <path d="M0.5 ${BAR} V8.5 a8 8 0 0 1 8 -8 H${width - 8.5} a8 8 0 0 1 8 8 V${BAR} Z" fill="${COLOURS.bar}"/>
  <circle cx="18" cy="15" r="5" fill="#ff5f57"/><circle cx="34" cy="15" r="5" fill="#febc2e"/><circle cx="50" cy="15" r="5" fill="#28c840"/>
  <text x="${width / 2}" y="19" text-anchor="middle" fill="${COLOURS.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" font-size="12">${escapeXml(title)}</text>
  <g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" font-size="14" fill="${COLOURS.text}">
  ${text}
  </g>
</svg>
`
}
