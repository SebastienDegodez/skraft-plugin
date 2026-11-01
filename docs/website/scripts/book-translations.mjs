// Writes the French sidebar labels, generated-index titles and descriptions
// (i18n/fr/docusaurus-plugin-content-docs/current.json) from book.yml.
//
//   node docs/website/scripts/book-translations.mjs [--book <book.yml>] [--out <current.json>] [--check]
//
// --check writes nothing and exits 1 when the file differs from what book.yml gives.
// Exit 1 too when a key has no French source in book.yml (title_fr, intro_fr, label_fr).

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { loadBook } from '../../../scripts/lib/book.mjs'
import { translationsFromBook } from '../src/book/translations-from-book.mjs'

const at = (path) => fileURLToPath(new URL(path, import.meta.url))

const { values } = parseArgs({
  options: {
    book: { type: 'string', default: at('../book.yml') },
    out: { type: 'string', default: at('../i18n/fr/docusaurus-plugin-content-docs/current.json') },
    check: { type: 'boolean', default: false },
  },
})

const out = resolve(values.out)
const current = existsSync(out) ? readFileSync(out, 'utf8') : '{}\n'
const { translations, errors } = translationsFromBook(loadBook(resolve(values.book)), JSON.parse(current))
for (const error of errors) console.error(error)
if (errors.length > 0) process.exit(1)

const text = `${JSON.stringify(translations, null, 2)}\n`
if (values.check) {
  if (text !== current) console.error(`${values.out} differs from book.yml: run node docs/website/scripts/book-translations.mjs`)
  process.exit(text === current ? 0 : 1)
}
writeFileSync(out, text)
console.log(`Wrote ${Object.keys(translations).length} French sidebar translation(s) to ${values.out}`)
