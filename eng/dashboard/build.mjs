#!/usr/bin/env node
// Assemble the data the published SKRAFT dashboard reads.
//
// Two halves, deliberately decoupled:
//   • the catalogue (what the plugin ships) is derived from the source tree at
//     site build time, so it is never stale and never committed;
//   • the evidence (what the evaluations proved, what they cost, which agent
//     sessions were recorded) lives on the `dashboard-data` branch and is
//     fetched by the browser, so publishing a run needs no site rebuild.
//
// This script writes the catalogue and tells the page where the evidence lives.
//
//   node eng/dashboard/build.mjs [--report artifacts/catalog/report.json]
//                                [--out docs/site/dashboard/data/dashboard.json]
//                                [--history dashboard-data/history.json]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    report: { type: 'string', default: 'artifacts/catalog/report.json' },
    history: { type: 'string', default: 'dashboard-data/history.json' },
    out: { type: 'string', default: 'docs/site/dashboard/data/dashboard.json' },
    repository: { type: 'string', default: 'SebastienDegodez/skraft-plugin' },
    'data-branch': { type: 'string', default: 'dashboard-data' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

if (values.help) {
  console.log('Usage: node eng/dashboard/build.mjs [--report file] [--history file] [--out file] [--repository owner/name] [--data-branch name]')
  process.exit(0)
}

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))
const readJson = (path, fallback) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

const reportPath = resolve(repoRoot, values.report)
const report = readJson(reportPath, null)
if (!report || report.schemaVersion !== 1 || !Array.isArray(report.skills)) {
  throw new Error(`Catalogue report is missing or unsupported: ${reportPath} — run eng/catalog/scan.mjs first`)
}

// A locally generated history is inlined so the dashboard is usable offline.
// In production the file is absent here and the browser fetches the data branch.
const history = readJson(resolve(repoRoot, values.history), { schemaVersion: 1, skills: {} })

const rawUrl = (file) => `https://raw.githubusercontent.com/${values.repository}/${values['data-branch']}/data/${file}`
const dashboard = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  catalogueGeneratedAt: report.generatedAt,
  repository: values.repository,
  plugin: report.plugin,
  summary: report.summary,
  skills: report.skills,
  agents: report.agents,
  findings: report.findings ?? [],
  history: history.skills ?? {},
  agentHistory: history.agents ?? {},
  sources: {
    history: rawUrl('history.json'),
    replayManifest: rawUrl('manifest.json'),
    replay: 'replay/index.html',
  },
}

const outputPath = resolve(repoRoot, values.out)
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(dashboard, null, 2)}\n`)

const inlined = Object.keys(dashboard.history).length
console.log(
  `Dashboard data: ${dashboard.summary.skills} skills, ${dashboard.summary.agents + dashboard.summary.workers + dashboard.summary.lenses} agents, ` +
    `${inlined} skill(s) with inlined history → ${relative(repoRoot, outputPath).split('\\').join('/')}`,
)
