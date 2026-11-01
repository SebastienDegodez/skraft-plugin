import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { codeThemeDark, codeThemeLight } from '../../../docs/website/src/css/code-themes.mjs'

// The handbook theme reads at WCAG AA (>= 4.5:1) in both colour modes, and its primary shades are
// those of the official Docusaurus generator.
const css = readFileSync(new URL('../../../docs/website/src/css/custom.css', import.meta.url), 'utf8')
const terminalCss = readFileSync(new URL('../../../docs/website/src/components/Terminal/styles.module.css', import.meta.url), 'utf8')

const AA = 4.5

const blockOf = (source, selector) => {
  const start = source.indexOf(`${selector} {`)
  assert.ok(start >= 0, `${selector} block missing`)
  return source.slice(start, source.indexOf('}', start))
}

const variablesOf = (block) =>
  Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map(([, name, hex]) => [name, hex.toLowerCase()]))

const light = variablesOf(blockOf(css, ':root'))
const modes = { light, dark: { ...light, ...variablesOf(blockOf(css, "[data-theme='dark']")) } }

const rgbOf = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))
const channel = (value) => {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = (hex) => {
  const [r, g, b] = rgbOf(hex).map(channel)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

const PAIRS = [
  ['--ifm-font-color-base', '--ifm-background-color'],
  ['--ifm-font-color-base', '--ifm-background-surface-color'],
  ['--ifm-color-emphasis-700', '--ifm-background-color'],
  ['--ifm-color-emphasis-700', '--ifm-background-surface-color'],
  ['--ifm-color-primary', '--ifm-background-color'],
  ['--ifm-color-primary', '--ifm-background-surface-color'],
  ['--skraft-on-primary', '--ifm-color-primary'],
  ['--ifm-footer-link-color', '--ifm-footer-background-color'],
  ...['secondary', 'success', 'info', 'warning', 'danger'].map((kind) => [
    `--ifm-color-${kind}-contrast-foreground`,
    `--ifm-color-${kind}-contrast-background`,
  ]),
]

for (const [mode, tokens] of Object.entries(modes)) {
  for (const [text, background] of PAIRS) {
    test(`${mode}: ${text} on ${background} reads at AA`, () => {
      assert.ok(tokens[text] && tokens[background], `${text} or ${background} is not a hex colour in ${mode}`)
      const ratio = contrast(tokens[text], tokens[background])
      assert.ok(ratio >= AA, `${tokens[text]} on ${tokens[background]} is ${ratio.toFixed(2)}:1`)
    })
  }
}

// The official generator: Color(primary).darken(adjustment).hex() from the `color` package, whose
// conversions (color-convert) are reproduced step by step so the rounding is the same.
const hslOf = (hex) => {
  const [r, g, b] = rgbOf(hex).map((v) => v / 255)
  const min = Math.min(r, g, b)
  const max = Math.max(r, g, b)
  const delta = max - min
  const hue = max === min ? 0 : r === max ? (g - b) / delta : g === max ? 2 + (b - r) / delta : 4 + (r - g) / delta
  const h = Math.min(hue * 60, 360)
  const l = (min + max) / 2
  const s = max === min ? 0 : l <= 0.5 ? delta / (max + min) : delta / (2 - max - min)
  return [h < 0 ? h + 360 : h, s * 100, l * 100]
}
const channelOf = (t, t1, t2) => {
  const t3 = t < 0 ? t + 1 : t > 1 ? t - 1 : t
  if (6 * t3 < 1) return t1 + (t2 - t1) * 6 * t3
  if (2 * t3 < 1) return t2
  if (3 * t3 < 2) return t1 + (t2 - t1) * (2 / 3 - t3) * 6
  return t1
}
const hexOf = ([hue, saturation, lightness]) => {
  const [h, s, l] = [hue / 360, saturation / 100, lightness / 100]
  const t2 = l < 0.5 ? l * (1 + s) : l + s - l * s
  const t1 = 2 * l - t2
  const rgb = [0, 1, 2].map((i) => (s === 0 ? l : channelOf(h + (1 / 3) * -(i - 1), t1, t2)) * 255)
  return `#${rgb.map((v) => Number(v.toFixed(0)).toString(16).padStart(2, '0')).join('')}`
}
const shade = (hex, adjustment) => {
  const [h, s, l] = hslOf(hex)
  return hexOf([h, s, l - l * adjustment])
}
const SHADES = { dark: 0.1, darker: 0.15, darkest: 0.3, light: -0.1, lighter: -0.15, lightest: -0.3 }

test('the generator reproduces the Docusaurus default shades', () => {
  assert.equal(shade('#2e8555', SHADES.dark), '#29784c')
  assert.equal(shade('#2e8555', SHADES.lightest), '#3cad6e')
  assert.equal(shade('#25c2a0', SHADES.darkest), '#1a8870')
})

for (const [mode, tokens] of Object.entries(modes)) {
  test(`${mode}: the six primary shades come from the generator`, () => {
    for (const [name, adjustment] of Object.entries(SHADES)) {
      assert.equal(tokens[`--ifm-color-primary-${name}`], shade(tokens['--ifm-color-primary'], adjustment), `--ifm-color-primary-${name}`)
    }
  })
}

const terminal = variablesOf(blockOf(terminalCss, '.terminal'))
for (const text of ['text', 'muted', 'prompt', 'ok', 'warn', 'fail']) {
  test(`terminal: ${text} on the card reads at AA`, () => {
    const ratio = contrast(terminal[`--term-${text}`], terminal['--term-background'])
    assert.ok(ratio >= AA, `--term-${text} is ${ratio.toFixed(2)}:1`)
  })
}

test('terminal: the title reads at AA on the title bar', () => {
  const ratio = contrast(terminal['--term-muted'], terminal['--term-bar'])
  assert.ok(ratio >= AA, `--term-muted on --term-bar is ${ratio.toFixed(2)}:1`)
})

for (const [mode, theme] of Object.entries({ light: codeThemeLight, dark: codeThemeDark })) {
  test(`${mode}: every code token reads at AA on the code block background`, () => {
    const background = theme.plain.backgroundColor.toLowerCase()
    const colours = [theme.plain.color, ...theme.styles.map((entry) => entry.style.color).filter(Boolean)]
    for (const colour of colours) {
      const ratio = contrast(colour.toLowerCase(), background)
      assert.ok(ratio >= AA, `${colour} on ${background} is ${ratio.toFixed(2)}:1`)
    }
  })
}
