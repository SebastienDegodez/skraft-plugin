#!/usr/bin/env node
// Turns Stryker's JSON report into readable pages of the mutants the tests let live
// (Survived, NoCoverage), worst file first, each with the source line it mutated. The
// mutation job publishes the pages as check runs, so they can be read on the pull request
// (and through the REST API) without downloading the report artifact.
//
//   node scripts/ci-mutation-survivors.mjs <mutation.json> <out-dir>
//     writes <out-dir>/summary.md and <out-dir>/page-<n>.md (each under a check run's limit)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const PAGE_LIMIT = 60000
const LIVE = new Set(['Survived', 'NoCoverage'])
const DETECTED = new Set(['Killed', 'Timeout'])
const VALID = new Set(['Killed', 'Timeout', 'Survived', 'NoCoverage'])

const scoreOf = (mutants) => {
  const valid = mutants.filter((mutant) => VALID.has(mutant.status))
  const detected = valid.filter((mutant) => DETECTED.has(mutant.status))
  return valid.length === 0 ? 100 : (100 * detected.length) / valid.length
}

const oneLine = (text, max = 90) => {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

export const survivorPages = (report, { root = process.cwd() } = {}) => {
  const files = Object.entries(report.files ?? {}).map(([path, file]) => {
    const lines = String(file.source ?? '').split('\n')
    const live = (file.mutants ?? [])
      .filter((mutant) => LIVE.has(mutant.status))
      .sort((a, b) => a.location.start.line - b.location.start.line || a.location.start.column - b.location.start.column)
    return { path: relative(root, path).split('\\').join('/'), score: scoreOf(file.mutants ?? []), total: (file.mutants ?? []).length, live, lines }
  })
  const everyMutant = Object.values(report.files ?? {}).flatMap((file) => file.mutants ?? [])
  const overall = scoreOf(everyMutant)
  const ranked = files.filter((file) => file.live.length > 0).sort((a, b) => b.live.length - a.live.length || a.path.localeCompare(b.path))

  const summary = [
    `Mutation score ${overall.toFixed(2)} % (break ${report.thresholds?.break ?? '?'}), ${everyMutant.length} mutants, ${everyMutant.filter((m) => LIVE.has(m.status)).length} alive.`,
    '',
    '| File | Score | Alive | Mutants |',
    '|---|---:|---:|---:|',
    ...ranked.map((file) => `| ${file.path} | ${file.score.toFixed(1)} | ${file.live.length} | ${file.total} |`),
  ].join('\n')

  const blocks = ranked.map((file) => [
    `### ${file.path} — ${file.score.toFixed(1)} %, ${file.live.length} alive`,
    ...file.live.map((mutant) => {
      const { line, column } = mutant.location.start
      const status = mutant.status === 'NoCoverage' ? ' [no coverage]' : ''
      return `- L${line}:${column} ${mutant.mutatorName}${status} → \`${oneLine(mutant.replacement, 60)}\` in \`${oneLine(file.lines[line - 1])}\``
    }),
    '',
  ].join('\n'))

  const pages = []
  let page = ''
  for (const block of blocks) {
    const text = block.length > PAGE_LIMIT ? `${block.slice(0, PAGE_LIMIT - 20)}\n…\n` : block
    if (page.length + text.length > PAGE_LIMIT) {
      pages.push(page)
      page = ''
    }
    page += `${text}\n`
  }
  if (page) pages.push(page)
  return { overall, summary, pages }
}

const main = ([reportPath, outDir]) => {
  if (!reportPath || !outDir) {
    console.error('usage: ci-mutation-survivors.mjs <mutation.json> <out-dir>')
    return 2
  }
  const { overall, summary, pages } = survivorPages(JSON.parse(readFileSync(reportPath, 'utf8')))
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'summary.md'), `${summary}\n`)
  pages.forEach((page, index) => writeFileSync(join(outDir, `page-${index + 1}.md`), page))
  console.log(`mutation score ${overall.toFixed(2)} %, ${pages.length} page(s) of survivors`)
  return 0
}

if (process.argv[1]?.endsWith('ci-mutation-survivors.mjs')) process.exitCode = main(process.argv.slice(2))
