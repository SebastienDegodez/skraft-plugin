import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The live console blocks and the SVG transcripts (eng/docs/terminal-svg.mjs) share one palette.
const svgSource = readFileSync(new URL('../../../eng/docs/terminal-svg.mjs', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../../docs/website/src/components/Terminal/styles.module.css', import.meta.url), 'utf8')

const svgColours = () => {
  const block = /const COLOURS = Object\.freeze\(\{([^}]*)\}\)/.exec(svgSource)
  assert.ok(block, 'COLOURS not found in eng/docs/terminal-svg.mjs')
  return Object.fromEntries([...block[1].matchAll(/(\w+):\s*'(#[0-9a-fA-F]{6})'/g)].map(([, key, hex]) => [key, hex.toLowerCase()]))
}

const cssColours = () => {
  const start = css.indexOf('.terminal {')
  const block = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries([...block.matchAll(/--term-([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map(([, key, hex]) => [key, hex.toLowerCase()]))
}

test('every SVG transcript colour is a terminal card colour with the same value', () => {
  const svg = svgColours()
  assert.ok(Object.keys(svg).length >= 9, 'the SVG palette has fewer colours than expected')
  assert.deepEqual(cssColours(), svg)
})
