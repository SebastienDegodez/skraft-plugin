import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { pageLanguage, pageText } from '../../docs/website/static/dashboard/page-text.mjs'

const html = readFileSync(new URL('../../docs/website/static/dashboard/index.html', import.meta.url), 'utf8')

/** Every key index.html asks for, through data-i18n, data-i18n-html and data-i18n-attr. */
const keysOfPage = () => [
  ...[...html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)].map((match) => match[1]),
  ...[...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((match) => match[1].split(';').map((pair) => pair.split(':')[1])),
]

test('the French dashboard translates every text the page marks as translatable', () => {
  const keys = keysOfPage()
  assert.ok(keys.length > 50, `only ${keys.length} keys found: the page markup changed`)
  assert.deepEqual(keys.filter((key) => pageText.fr[key] === undefined), [])
})

test('the French table holds no text the page no longer shows', () => {
  const keys = new Set(keysOfPage())
  assert.deepEqual(Object.keys(pageText.fr).filter((key) => !keys.has(key)), [])
})

test('the dashboard speaks French under /fr/dashboard/ only, whatever the base URL', () => {
  assert.equal(pageLanguage('/skraft-plugin/fr/dashboard/'), 'fr')
  assert.equal(pageLanguage('/skraft-plugin/v2-next/fr/dashboard/index.html'), 'fr')
  assert.equal(pageLanguage('/fr/dashboard/'), 'fr')
  assert.equal(pageLanguage('/skraft-plugin/fr/dashboard'), 'fr')
  assert.equal(pageLanguage('/skraft-plugin/dashboard/'), 'en')
  assert.equal(pageLanguage('/skraft-plugin/fr/dashboard/replay/'), 'en')
})
