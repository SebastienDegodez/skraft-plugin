// The handbook's terminal captures: a transcript becomes an SVG whose text is the transcript,
// escaped, its long lines wrapped and its status words coloured.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { terminalSvg, wrap } from '../../../eng/docs/terminal-svg.mjs'

const texts = (svg) => [...svg.matchAll(/<text x="18"[^>]*>(.*?)<\/text>/g)].map(([, inner]) => inner.replace(/<[^>]+>/g, ''))

test('a line longer than the columns wraps at a space, its rows after the first indented under it', () => {
  assert.deepEqual(wrap('WARN  web: skills found nowhere, in the plugin', 24), ['WARN  web: skills found', '      nowhere, in the', '      plugin'])
  assert.deepEqual(wrap('short line', 24), ['short line'])
})

test('the svg holds every row of the transcript, escaped, the prompt and the status words coloured, and is named for screen readers', () => {
  const svg = terminalSvg(['$ skraft gate --all', 'pass  web/test', 'FAIL  web/mutation', 'answer: skraft decide adr-1 RATIFIED|REJECTED <reason>'], { title: '~/shop', label: 'skraft gate --all: 1 gate failed' })

  assert.deepEqual(texts(svg), ['$ skraft gate --all', 'pass  web/test', 'FAIL  web/mutation', 'answer: skraft decide adr-1 RATIFIED|REJECTED &lt;reason&gt;'])
  assert.match(svg, /role="img" aria-label="skraft gate --all: 1 gate failed"/)
  assert.match(svg, /<tspan fill="#7cc4ff">\$<\/tspan>/)
  assert.match(svg, /<tspan fill="#4fc27a" font-weight="600">pass<\/tspan>/)
  assert.match(svg, /<tspan fill="#f47067" font-weight="600">FAIL<\/tspan>/)
})
