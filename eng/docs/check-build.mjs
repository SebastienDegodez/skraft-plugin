#!/usr/bin/env node
// Asserts the layout of a built handbook before it is uploaded: a page that a deploy forgot is
// caught here, not by a reader.
//
//   node eng/docs/check-build.mjs <build dir> [--versions docs/website/versions.json] [--llms]
//                                 [--dashboard] [--archive v1.15.3,v1.15.2,…] [--archive-only]
//
//   always       index.html, 404.html, fr/index.html (not with --archive-only: the v1 archive alone)
//   --versions   once the file lists a released version, `next` moves under next/ and fr/next/
//   --llms       llms.txt for each locale and version
//   --dashboard  dashboard/index.html
//   --archive    v1/index.html and <tag>/index.html for each archived v1 tag
//
// It prints every path it examined and exits 1 when one is missing.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const LOCALE_PREFIXES = ['', 'fr/']

/** The URL prefix of each version: `current` at the root, or under next/ once a version is released. */
export const versionPrefixes = (released) => (released.length === 0 ? [''] : ['', 'next/'])

/** Every file a build must hold, as paths relative to the build folder, with `/` separators. */
export const expectedFiles = ({ released = [], llms = false, dashboard = false, archive = [], site = true } = {}) => {
  const archived = archive.length > 0 ? ['v1/index.html', ...archive.map((tag) => `${tag}/index.html`)] : []
  if (!site) return archived
  const pages = LOCALE_PREFIXES.flatMap((locale) => versionPrefixes(released).map((version) => `${locale}${version}index.html`))
  const llmsFiles = llms ? LOCALE_PREFIXES.flatMap((locale) => versionPrefixes(released).map((version) => `${locale}${version}llms.txt`)) : []
  return ['404.html', ...pages, ...llmsFiles, ...(dashboard ? ['dashboard/index.html'] : []), ...archived]
}

/** The expected files absent from `root`. */
export const missingFiles = (root, expected) => expected.filter((file) => !existsSync(join(root, ...file.split('/'))))

const readReleased = (file) => (file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [])

const main = (argv) => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      versions: { type: 'string' },
      llms: { type: 'boolean', default: false },
      dashboard: { type: 'boolean', default: false },
      archive: { type: 'string', default: '' },
      'archive-only': { type: 'boolean', default: false },
    },
  })
  if (positionals.length !== 1) {
    process.stderr.write('Usage: node eng/docs/check-build.mjs <build dir> [--versions file] [--llms] [--dashboard] [--archive tags] [--archive-only]\n')
    return 2
  }
  const archive = values.archive.split(',').map((tag) => tag.trim()).filter(Boolean)
  const site = !values['archive-only']
  const expected = expectedFiles({ released: readReleased(values.versions), llms: values.llms, dashboard: values.dashboard, archive, site })
  const missing = new Set(missingFiles(positionals[0], expected))
  for (const file of expected) process.stdout.write(`${missing.has(file) ? 'missing' : 'ok     '} ${file}\n`)
  process.stdout.write(`check-build: examined ${expected.length} paths under ${positionals[0]}, ${missing.size} missing\n`)
  return missing.size === 0 ? 0 : 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = main(process.argv.slice(2))
