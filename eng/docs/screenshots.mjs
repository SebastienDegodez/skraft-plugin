#!/usr/bin/env node
// Reproducible captures for the handbook, from the repository's own fixtures:
//
//   - terminal: a real run of the skraft command line on the tutorial's small repository
//     (init, doctor, a pipeline waiting on its first question, its gates), rendered as SVG;
//   - pipeline: the Copilot `skraft-pipeline` canvas over that repository waiting on its first
//     question, then over the integration tests' scripted repository (its agents scripted, the
//     engine, the driver and the gates real) waiting on its ADR and done, its Journal tab, with `skraft status`,
//     `skraft report` and the end of the workflow log of that finished run;
//   - backlog: the skraft-backlog canvas over its browser-test workspace, in French and English;
//   - dashboard: the static dashboard of docs/website/static/dashboard/, served as it is, with its
//     data built from the plugin sources (eng/catalog/scan.mjs, eng/dashboard/build.mjs) and its
//     evidence and replay manifest read from tests/docs/replay; one capture per --theme, since the
//     page follows prefers-color-scheme (<name>-light.png, <name>-dark.png);
//   - replay: AGENTVIZ (npm package agentviz@1.2.0, the only download besides the tutorial's
//     StrykerJS) opened from the dashboard's replay link on one recorded baseline/skilled pair.
//
//   node eng/docs/screenshots.mjs [--out docs/website/static/img/screenshots]
//                                 [--only terminal,pipeline,backlog,dashboard,replay] [--theme light,dark]
//
// It writes PNG and SVG files under <out>/{fr,en,shared}/ and fails when one cannot be produced,
// is empty, or is larger than 250 KB. The other captures stay dark: their UIs have no light theme. Nothing it starts outlives it; its temp folders are removed.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import UPNG from 'upng-js'

import { terminalSvg } from './terminal-svg.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const STATIC = join(REPO, 'docs', 'website', 'static')
const PLUGIN_ROOT = join(REPO, 'plugins', 'skraft-framework')
const REPLAY_FIXTURE = join(REPO, 'tests', 'docs', 'replay')
const AGENTVIZ = 'agentviz@1.2.0'
const MAX_BYTES = 250 * 1024
const VIEWPORT = Object.freeze({ width: 1280, height: 800 })
// Relative dates ("2d ago") and the dashboard's freshness read the clock: fix it.
const CLOCK = new Date('2026-09-30T09:00:00Z')
const GROUPS = ['terminal', 'pipeline', 'backlog', 'dashboard', 'replay']
const THEMES = ['light', 'dark']

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: 'docs/website/static/img/screenshots' },
    only: { type: 'string', default: GROUPS.join(',') },
    theme: { type: 'string', default: THEMES.join(',') },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})
if (values.help) {
  console.log(`Usage: node eng/docs/screenshots.mjs [--out dir] [--only ${GROUPS.join(',')}] [--theme ${THEMES.join(',')}]`)
  process.exit(0)
}
const OUT = resolve(REPO, values.out)
const ONLY = new Set(values.only.split(',').map((group) => group.trim()).filter(Boolean))
for (const group of ONLY) if (!GROUPS.includes(group)) throw new Error(`unknown group ${group}; known: ${GROUPS.join(', ')}`)
const THEME = values.theme.split(',').map((theme) => theme.trim()).filter(Boolean)
for (const theme of THEME) if (!THEMES.includes(theme)) throw new Error(`unknown theme ${theme}; known: ${THEMES.join(', ')}`)
if (THEME.length === 0) throw new Error(`--theme names no theme; known: ${THEMES.join(', ')}`)

const cleanups = []
const scratch = (prefix) => {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}
/** The cleanup hooks the integration-test helpers expect from node:test. */
const testContext = { after: (fn) => cleanups.push(fn), signal: new AbortController().signal }

const written = []
/** @param {'fr' | 'en' | 'shared'} lang @param {string} name */
const target = (lang, name) => {
  const path = join(OUT, lang, name)
  mkdirSync(dirname(path), { recursive: true })
  written.push(path)
  return path
}
const log = (message) => process.stdout.write(`${message}\n`)
const shown = (path) => (path.startsWith(REPO + sep) ? path.slice(REPO.length + 1) : path)

// ---------------------------------------------------------------- static server

const TYPES = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jsonl': 'application/x-ndjson; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
}

/**
 * A loopback server: `mounts` maps a URL prefix to a folder (the first match wins). HEAD is
 * answered like GET without a body.
 * @param {{ mounts: Array<[string, string]> }} routes
 */
const serve = async ({ mounts }) => {
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const send = (status, type, body) => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
      res.end(req.method === 'HEAD' ? undefined : body)
    }
    for (const [prefix, folder] of mounts) {
      if (!pathname.startsWith(prefix)) continue
      const candidate = resolve(folder, `.${normalize(`/${pathname.slice(prefix.length)}`)}`)
      if (candidate !== folder && !candidate.startsWith(folder + sep)) return send(403, 'text/plain', 'forbidden')
      const file = existsSync(candidate) && statSync(candidate).isDirectory() ? join(candidate, 'index.html') : candidate
      if (existsSync(file)) return send(200, TYPES[extname(file)] ?? 'application/octet-stream', readFileSync(file))
    }
    return send(404, 'text/plain', 'not found')
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  cleanups.push(() => new Promise((done) => server.close(done)))
  return `http://127.0.0.1:${server.address().port}`
}

// ---------------------------------------------------------------- browser

const { chromium } = await import('@playwright/test')
const browser = await chromium.launch()
cleanups.push(() => browser.close())

/** A page that fails the capture on a script error, with the web fonts and CDNs of the pages blocked. */
const newPage = async ({ colorScheme = 'dark', viewport = VIEWPORT, clock = false } = {}) => {
  const context = await browser.newContext({ viewport, colorScheme, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC' })
  const page = await context.newPage()
  if (clock) await page.clock.setFixedTime(CLOCK)
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort())
  page.errors = []
  page.on('pageerror', (error) => page.errors.push(error.message))
  return page
}

/** A screenshot reduced to 256 colours: a UI capture keeps its look at a third of the size. @param {Buffer} png */
const quantized = (png) => {
  const image = UPNG.decode(png.buffer.slice(png.byteOffset, png.byteOffset + png.length))
  return Buffer.from(UPNG.encode(UPNG.toRGBA8(image), image.width, image.height, 256))
}

/** @param {import('@playwright/test').Page} page @param {string} path @param {object} [options] */
const shoot = async (page, path, options = {}) => {
  if (page.errors.length > 0) throw new Error(`${path}: the page threw: ${page.errors.join('; ')}`)
  writeFileSync(path, quantized(await page.screenshot({ animations: 'disabled', ...options })))
  log(`  ${shown(path)}`)
}

// ---------------------------------------------------------------- the CLI, in process

const { runCli } = await import('../../plugins/skraft-framework/engine/drivers/cli/run-cli.mjs')
const { createNodeAdapters } = await import('../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs')
const { readPluginVersion } = await import('../../plugins/skraft-framework/engine/infrastructure/plugin-manifest.mjs')

/**
 * Runs `skraft <args>` as skraft.mjs does, in `cwd`, with `home` as the home folder; `confirm`
 * stands for the person typing `y` at the terminal. Returns what it printed.
 * @param {string} cwd @param {string} home @param {string[]} args
 */
const skraft = async (cwd, home, args) => {
  const lines = []
  const code = await runCli(args, {
    pluginVersion: () => readPluginVersion(new URL(`file://${join(PLUGIN_ROOT, 'plugin.json')}`)),
    workingCopyName: () => cwd.split(sep).at(-1),
    adapters: (agentHost) => createNodeAdapters({ cwd, pluginRoot: PLUGIN_ROOT, home, agentHost }),
    command: () => 'skraft',
    confirm: async () => true,
  }, { out: (line) => lines.push(line), err: (line) => lines.push(line) })
  return { code, lines }
}

/** Temp paths shown as a reader's own. @param {string[]} lines @param {Record<string, string>} paths */
const masked = (lines, paths) => lines.map((line) => Object.entries(paths).reduce((text, [from, to]) => text.split(from).join(to), line))

const writeSvg = (name, transcript, title, label, columns) => writeFileSync(target('shared', name), terminalSvg(transcript, { title, label, columns }))

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`)
  return result.stdout
}

/**
 * npm without a shell: on Windows `npm` is a `.cmd` that Node refuses to spawn without one, and a shell does not quote an
 * argv array. npm's own CLI script runs under this node instead, so every argument reaches it as one.
 */
const npm = (args, cwd) => {
  const bundled = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  const script = [process.env.npm_execpath, bundled].find((path) => path && /npm-cli\.c?js$/.test(path) && existsSync(path))
  return script ? run(process.execPath, [script, ...args], cwd) : run('npm', args, cwd)
}

// ---------------------------------------------------------------- the tutorial's shop

const SHOP_FILES = {
  'web/package.json': `${JSON.stringify({ name: 'web', private: true, type: 'module', scripts: { test: 'node --test' } }, null, 2)}\n`,
  'web/src/cart.js': 'export const total = (prices) => prices.reduce((sum, price) => sum + price, 0)\n',
  'web/test/cart.test.js': [
    "import { test } from 'node:test'",
    "import assert from 'node:assert/strict'",
    "import { total } from '../src/cart.js'",
    '',
    "test('the total of a cart adds its prices', () => {",
    '  assert.equal(total([2, 3]), 5)',
    '})',
    '',
  ].join('\n'),
  'web/stryker.config.json': `${JSON.stringify({ testRunner: 'tap', mutate: ['src/**/*.js'], tap: { testFiles: ['test/**/*.test.js'], nodeArgs: ['--test-reporter=tap'] } }, null, 2)}\n`,
  '.gitignore': 'node_modules/\nreports/\n',
}

/** The repository of the tutorial, built as its first step says, on branch pay-by-card. */
const shop = () => {
  const root = scratch('skraft-shot-')
  const cwd = join(root, 'shop')
  const home = join(root, 'home')
  mkdirSync(home)
  for (const [path, text] of Object.entries(SHOP_FILES)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true })
    writeFileSync(join(cwd, path), text)
  }
  const git = (...args) => run('git', ['-c', 'user.name=Shop', '-c', 'user.email=shop@example.invalid', '-c', 'commit.gpgsign=false', ...args], cwd)
  git('init', '-q', '-b', 'main')
  npm(['install', '--save-dev', '--no-audit', '--no-fund', '--prefix', 'web', '@stryker-mutator/core@9.6.1', '@stryker-mutator/tap-runner@9.6.1'], cwd)
  git('add', '.')
  git('commit', '-q', '-m', 'Start the shop')
  git('switch', '-q', '-c', 'pay-by-card')
  return { cwd, home, git, paths: { [cwd]: '~/shop', [home]: '~' } }
}

/** `skraft doctor`, its model tables cut to their first rows: the checks are what a reader reads. */
const doctorShown = (lines) => {
  const shown = []
  let table = null
  for (const line of lines) {
    if (/^models on /.test(line)) {
      table = line
      if (line === 'models on claude-code:') shown.push(line)
      continue
    }
    if (table === null || /^skraft doctor:/.test(line)) {
      shown.push(line)
      table = null
      continue
    }
    if (table === 'models on claude-code:' && shown.filter((l) => l.startsWith('  ')).length < 4) shown.push(line)
    else if (table === 'models on claude-code:' && shown.at(-1) !== '  …') shown.push('  …')
  }
  return shown
}

// ---------------------------------------------------------------- the Copilot pipeline canvas

let canvasInstances = 0
/** The skraft-pipeline canvas of a working copy, as Copilot CLI opens it, captured. */
const canvasShot = async (cwd, home, name, { fullPage = true, tab = null } = {}) => {
  const { createPipelineCanvas } = await import('../../plugins/skraft-framework/engine/drivers/copilot-workflow/pipeline-canvas.mjs')
  const canvas = createPipelineCanvas({ createCanvas: (options) => options, CanvasError: class CanvasError extends Error {}, directory: () => cwd, pluginRoot: PLUGIN_ROOT, home, pollMs: 100, journalRows: 200 })
  const instanceId = `capture-${++canvasInstances}`
  const { url } = await canvas.open({ instanceId, input: {} })
  try {
    const page = await newPage({ viewport: { width: 1100, height: 820 } })
    await page.goto(url)
    await page.locator('.app[data-state="ready"] .slug').filter({ hasText: 'checkout' }).waitFor()
    if (tab) await page.locator(`#tab-${tab}`).click()
    await page.waitForTimeout(300)
    await shoot(page, target('shared', name), { fullPage })
    await page.context().close()
  } finally {
    await canvas.onClose({ instanceId })
  }
}

/**
 * The tutorial's repository through the command line: init, doctor, the start of its pipeline,
 * waiting on its first question (the canvas then, when the pipeline group is wanted), its gates.
 */
const shopCaptures = async () => {
  log('terminal: the tutorial repository, through the skraft command line')
  const { cwd, home, git, paths } = shop()
  const say = async (args) => {
    const { code, lines } = await skraft(cwd, home, args)
    return { code, lines: masked(lines, paths) }
  }
  const init = await say(['init'])
  if (init.code !== 0) throw new Error(`skraft init: ${init.lines.join('\n')}`)
  writeSvg('terminal-init.svg', ['$ skraft init', ...init.lines], '~/shop', 'skraft init: skraft-config.json: web (javascript, web)')
  git('add', 'skraft-config.json', '.gitignore')
  git('commit', '-q', '-m', 'chore: describe the shop for skraft')

  const doctor = await say(['doctor'])
  if (doctor.code !== 0) throw new Error(`skraft doctor: ${doctor.lines.join('\n')}`)
  writeSvg('terminal-doctor.svg', ['$ skraft doctor', ...doctorShown(doctor.lines)], '~/shop', `skraft doctor: ${doctor.lines.at(-1)}`, 132)

  const start = await say(['init', 'checkout', '--issue', '42', '--title', 'Pay by card'])
  const next = await say(['next'])
  const status = await say(['status'])
  if (start.code !== 0) throw new Error(`skraft init checkout: ${start.lines.join('\n')}`)
  writeSvg('terminal-status-waiting.svg', ['$ skraft status', ...status.lines], '~/shop', 'skraft status: checkout waiting in RESEARCH on publish-consent')
  if (!next.lines.some((line) => line.includes('waiting (publish-consent)'))) throw new Error(`skraft next did not stop on publish-consent: ${next.lines.join('\n')}`)
  if (ONLY.has('pipeline')) await canvasShot(cwd, home, 'pipeline-canvas-question.png')

  const gates = await say(['gate', '--all'])
  if (gates.code !== 0) throw new Error(`skraft gate --all: ${gates.lines.join('\n')}`)
  writeSvg('terminal-gates.svg', ['$ skraft gate --all', ...gates.lines], '~/shop', `skraft gate --all: ${gates.lines.at(-1)}`)
}

/** The integration tests' scripted repository, run by the Copilot workflow driver: paused on its ADR, then done. */
const pipelineCaptures = async () => {
  log('pipeline: the skraft-pipeline canvas of Copilot CLI over a scripted run')
  const { runSkraftPipelineWorkflow } = await import('../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs')
  const host = await import('../../tests/skraft-framework/integration/copilot-workflow/simulated-host.mjs')
  const repository = await import('../../tests/skraft-framework/integration/support/pipeline-repository.mjs')

  const { cwd } = repository.pipelineRepository(testContext)
  cleanups.push(() => rmSync(`${cwd}-home`, { recursive: true, force: true }))
  const person = host.answeringSession({ answers: [null, 'RATIFIED'] })
  const { ctx, logs } = host.simulatedContext({ args: { slug: repository.SLUG, issue: 42, title: 'Pay by card' }, otherwise: host.actsAs(repository.scriptedLlm({ cwd })) })
  const paused = await runSkraftPipelineWorkflow(ctx, host.copilotHost(cwd, PLUGIN_ROOT, person)).then(() => null, (error) => error.message)
  if (paused !== 'paused at adr-1') throw new Error(`the scripted run did not pause at its ADR: ${paused}`)
  await canvasShot(cwd, `${cwd}-home`, 'pipeline-canvas-adr.png')
  const outcome = await runSkraftPipelineWorkflow(ctx, host.copilotHost(cwd, PLUGIN_ROOT, person))
  if (outcome.status !== 'done') throw new Error(`the scripted run did not finish: ${JSON.stringify(outcome)}`)
  await canvasShot(cwd, `${cwd}-home`, 'pipeline-canvas-done.png', { fullPage: false })
  await canvasShot(cwd, `${cwd}-home`, 'pipeline-canvas-journal.png', { fullPage: false, tab: 'journal' })

  const paths = { [cwd]: '~/payment', [`${cwd}-home`]: '~' }
  const status = await skraft(cwd, `${cwd}-home`, ['status'])
  const report = await skraft(cwd, `${cwd}-home`, ['report'])
  writeSvg('terminal-status-done.svg', ['$ skraft status', ...masked(status.lines, paths)], '~/payment', 'skraft status of a finished run: every phase closed')
  writeSvg('terminal-report-done.svg', ['$ skraft report', ...masked(report.lines, paths)], '~/payment', 'skraft report of a finished run: each step, its visits, attempts, time and outcome, and the question answered')
  writeSvg('terminal-workflow-log.svg', masked(logs, paths).slice(logs.lastIndexOf('phase PUBLISH')), 'skraft-pipeline — /workflows', 'The end of the skraft-pipeline workflow log: PUBLISH closed, the run done')
}

// ---------------------------------------------------------------- the backlog canvas

const backlogCaptures = async () => {
  log('backlog: the skraft-backlog canvas')
  const { createController } = await import('../../plugins/skraft-backlog/prd-backlog/canvas/controller.mjs')
  const { startServer } = await import('../../plugins/skraft-backlog/prd-backlog/canvas/server.mjs')
  const { fakeGitHub } = await import('../../tests/skraft-backlog/prd-backlog/fake-github.mjs')
  const { REPO: FIXTURE_REPO, SLUG, makeWorkspace } = await import('../../tests/skraft-backlog/canvas/workspace.mjs')
  for (const [lang, review, progress] of [['fr', 'Revue', 'Suivi'], ['en', 'Review', 'Progress']]) {
    const cwd = scratch('skraft-backlog-shot-')
    await makeWorkspace(cwd)
    // The canvas speaks the language of the PRD: the English capture reads the same workspace
    // with an English inventory.
    const inventory = join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'backlog', 'inventory.json')
    writeFileSync(inventory, `${JSON.stringify({ ...JSON.parse(readFileSync(inventory, 'utf8')), language: lang }, null, 2)}\n`)
    const controller = createController({ cwd, gh: fakeGitHub({ repo: FIXTURE_REPO }).run, pollMs: 300 })
    await controller.reload()
    const server = await startServer({ controller, port: 0, onError: (error) => process.stderr.write(`${error.stack}\n`) })
    cleanups.push(async () => { controller.stop(); await server.close() })
    const page = await newPage({ viewport: { width: 1280, height: 860 } })
    await page.goto(server.url)
    await page.locator('.figure').first().waitFor()
    await page.getByRole('tab', { name: progress }).waitFor()
    await shoot(page, target(lang, 'backlog-canvas-progress.png'))
    await page.getByRole('tab', { name: review }).click()
    await page.locator('.story-head').waitFor()
    await shoot(page, target(lang, 'backlog-canvas-review.png'))
    await page.context().close()
  }
}

// ---------------------------------------------------------------- dashboard and replay

let agentvizDist = null
const agentviz = () => {
  if (agentvizDist) return agentvizDist
  const dir = scratch('skraft-agentviz-')
  const tarball = npm(['pack', AGENTVIZ, '--silent', '--pack-destination', dir], dir).trim().split('\n').at(-1)
  run('tar', ['-xzf', tarball], dir)
  agentvizDist = join(dir, 'package', 'dist')
  if (!existsSync(join(agentvizDist, 'index.html'))) throw new Error(`${AGENTVIZ} ships no dist/index.html`)
  return agentvizDist
}

/** Scrolls so that `selector` sits at the top of the viewport, with a small margin. */
const scrollTo = (page, selector) => page.evaluate((target) => {
  const element = document.querySelector(target)
  window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 16)
}, selector)

const dashboardAndReplayCaptures = async () => {
  const wantDashboard = ONLY.has('dashboard')
  const wantReplay = ONLY.has('replay')
  log('dashboard: the catalogue, built from the plugin sources')
  const data = scratch('skraft-dashboard-')
  run(process.execPath, ['eng/catalog/scan.mjs', '--out', join(data, 'report.json')], REPO)
  run(process.execPath, ['eng/dashboard/build.mjs', '--report', join(data, 'report.json'), '--history', join(data, 'no-history.json'), '--out', join(data, 'dashboard.json')], REPO)
  // The handbook build copies static/ into each locale: /dashboard/ and /fr/dashboard/ are the same files.
  const base = '/skraft-plugin'
  const locales = [`${base}/fr`, base]
  const origin = await serve({
    mounts: [
      ...locales.flatMap((root) => [[`${root}/dashboard/data/`, data], [`${root}/dashboard/replay/`, agentviz()]]),
      [`${base}/replay-data/`, REPLAY_FIXTURE],
      ...locales.map((root) => [`${root}/`, STATIC]),
    ],
  })
  // The evidence and the sessions come from the fixture, not from the data branch.
  const dashboard = JSON.parse(readFileSync(join(data, 'dashboard.json'), 'utf8'))
  dashboard.sources = { ...dashboard.sources, history: `${origin}${base}/replay-data/history.json`, replayManifest: `${origin}${base}/replay-data/manifest.json` }
  writeFileSync(join(data, 'dashboard.json'), JSON.stringify(dashboard))

  let replayUrl = null
  for (const lang of ['fr', 'en']) {
    for (const theme of wantDashboard ? THEME : ['dark']) {
      const page = await newPage({ clock: true, colorScheme: theme })
      await page.goto(`${origin}${base}${lang === 'fr' ? '/fr/dashboard/' : '/dashboard/'}`)
      await page.locator('#replay-callout').waitFor({ state: 'visible' })
      await page.locator('#catalog .catalog-group, #catalog table, #catalog article').first().waitFor()
      replayUrl = await page.locator('#replay-link').getAttribute('href')
      if (wantDashboard) {
        await scrollTo(page, '#summary')
        await page.waitForTimeout(300)
        await shoot(page, target(lang, `dashboard-catalogue-${theme}.png`))
        await page.locator('#tab-quality').click()
        await page.locator('#search').fill('outside-in-tdd')
        await page.locator('#panel-quality .evidence-card').first().waitFor()
        await scrollTo(page, '#panel-quality .evidence-cohort')
        await page.waitForTimeout(300)
        await shoot(page, target(lang, `dashboard-quality-${theme}.png`))
      }
      await page.context().close()
    }
  }
  if (!wantReplay) return

  log('replay: AGENTVIZ, opened from the dashboard replay link')
  const page = await newPage({ clock: true })
  await page.goto(replayUrl)
  await page.getByText('2 discovered').waitFor()
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await page.getByText('(baseline, run 1)').waitFor()
  await shoot(page, target('shared', 'replay-sessions.png'))

  // Each run in its evidence stream, opened on its last event: the report the agent ended on.
  const stream = async (role, name) => {
    await page.getByRole('button', { name: 'Find' }).first().click()
    await page.getByRole('button', { name: 'List', exact: true }).click()
    const titles = await page.getByText(/\((baseline|skilled), run 1\)$/).allInnerTexts()
    await page.getByRole('button', { name: 'Open', exact: true }).nth(titles.findIndex((title) => title.includes(`(${role}, run 1)`))).click()
    await page.getByText(`(${role}, run 1)`).first().waitFor()
    await page.getByRole('button', { name: /Investigate/ }).first().click()
    await page.getByText('Evidence stream').first().waitFor()
    await page.waitForTimeout(500)
    await shoot(page, target('shared', name))
    await page.getByRole('button', { name: 'Close session' }).click()
  }
  await stream('baseline', 'replay-baseline.png')
  await stream('skilled', 'replay-skilled.png')
  await page.context().close()
}

// ---------------------------------------------------------------- main

const checkWritten = () => {
  const problems = []
  for (const path of written) {
    if (!existsSync(path)) problems.push(`${path}: not written`)
    else if (statSync(path).size === 0) problems.push(`${path}: empty`)
    else if (statSync(path).size > MAX_BYTES) problems.push(`${path}: ${Math.round(statSync(path).size / 1024)} KB, over ${MAX_BYTES / 1024} KB`)
  }
  if (problems.length > 0) throw new Error(`captures refused:\n${problems.join('\n')}`)
  log(`${written.length} captures under ${shown(OUT)}`)
}

try {
  if (ONLY.has('terminal') || ONLY.has('pipeline')) await shopCaptures()
  if (ONLY.has('pipeline')) await pipelineCaptures()
  if (ONLY.has('backlog')) await backlogCaptures()
  if (ONLY.has('dashboard') || ONLY.has('replay')) await dashboardAndReplayCaptures()
  checkWritten()
} catch (error) {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
} finally {
  for (const cleanup of cleanups.reverse()) {
    try {
      await cleanup()
    } catch {
      // A temp folder already gone or a server already closed changes nothing.
    }
  }
}
// The backlog canvas controller and the integration helpers may keep timers: end once cleaned up.
process.exit(process.exitCode ?? 0)
