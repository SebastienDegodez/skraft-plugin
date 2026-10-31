import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `skraft upgrade` and the update notice of a session.
 *
 * - The command: npm installs the latest @skraft/cli of its channel (latest, or alpha when the
 *   installed version is an alpha), then each host that has the plugin updates it with its own
 *   command. Nothing else is touched.
 * - The notice: once a day, a session asks the registry for the channel's version and says when a
 *   newer one exists. It never installs anything by itself.
 */

const PACKAGE = '@skraft/cli'
const DAY = 24 * 60 * 60 * 1000

/** @param {string} version @returns {'alpha' | 'latest'} */
export const channelOf = (version) => (version.includes('-alpha') ? 'alpha' : 'latest')

/** @param {string} version @returns {number[]} major, minor, patch, then the pre-release number (Infinity when none) */
const partsOf = (version) => {
  const [core, pre] = version.split('-')
  const numbers = core.split('.').map(Number)
  const preNumber = pre === undefined ? Infinity : Number(/(\d+)$/.exec(pre)?.[1] ?? 0)
  return [...numbers, preNumber]
}

/** @param {string} candidate @param {string} current @returns {boolean} */
export const isNewer = (candidate, current) => {
  const [left, right] = [partsOf(candidate), partsOf(current)]
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index]
  }
  return false
}

/**
 * A program of the person's PATH, run without a shell outside Windows. On Windows, npm, copilot
 * and claude are `.cmd` files, which Node only starts through the shell; the arguments are then
 * fixed words of this file or a marketplace name checked against MARKETPLACE.
 * @param {string} program @param {string[]} args @param {Record<string, string | undefined>} env
 * @returns {Promise<number | 'missing'>}
 */
const runProgram = (program, args, env) =>
  new Promise((resolve) => {
    const child = spawn(program, args, { stdio: 'inherit', env, shell: process.platform === 'win32' })
    child.on('error', () => resolve('missing'))
    child.on('exit', (code) => resolve(code ?? 1))
  })

const MARKETPLACE = /^[A-Za-z0-9._-]+$/

/** @param {any} listed installed_plugins.json @returns {string[]} the marketplaces of the skraft entries */
const claudeMarketplaces = (listed) =>
  Object.keys(listed?.plugins ?? {})
    .filter((name) => name.startsWith('skraft@'))
    .map((name) => name.slice('skraft@'.length))
    .filter((marketplace) => MARKETPLACE.test(marketplace))

/** @param {string} file @returns {any} */
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

/** @param {number | 'missing'} code @param {string} what @param {(line: string) => void} say */
const report = (code, what, say) => {
  if (code === 0) say(`skraft upgrade: ${what} updated`)
  else if (code === 'missing') say(`skraft upgrade: ${what} skipped, its command is not on the PATH`)
  else say(`skraft upgrade: ${what} failed (code ${code})`)
  return code === 0 || code === 'missing'
}

/**
 * @param {{ version: string, home: string, env: Record<string, string | undefined>, hosts: { copilot: boolean, claudeCode: boolean }, say: (line: string) => void }} machine
 * @returns {Promise<number>} exit code
 */
export const upgrade = async ({ version, home, env, hosts, say }) => {
  const channel = channelOf(version)
  say(`skraft upgrade: ${PACKAGE}@${channel} (installed: ${version})`)
  let ok = report(await runProgram('npm', ['install', '--global', `${PACKAGE}@${channel}`], env), `the skraft command (${PACKAGE}@${channel})`, say)
  if (hosts.copilot) {
    ok = report(await runProgram('copilot', ['plugin', 'update', 'skraft'], env), 'the plugin in GitHub Copilot CLI', say) && ok
  }
  if (hosts.claudeCode) {
    const listed = readJson(join(env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'plugins', 'installed_plugins.json'))
    for (const marketplace of claudeMarketplaces(listed)) {
      const code = await runProgram('claude', ['plugin', 'update', `skraft@${marketplace}`], env)
      ok = report(code, `the plugin in Claude Code (skraft@${marketplace}; open a new session to load it)`, say) && ok
    }
  }
  return ok ? 0 : 1
}

/**
 * Says, at most once a day, that a newer @skraft/cli exists on the channel. Silent on any failure:
 * no network, a proxy, a slow registry (1.5 s) or an unreadable cache never delay the session.
 * @param {{ version: string, home: string, env: Record<string, string | undefined>, now: number, say: (line: string) => void }} machine
 * @returns {Promise<void>}
 */
export const noticeUpdate = async ({ version, home, env, now, say }) => {
  if (env.SKRAFT_UPDATE_CHECK === '0' || env.CI) return
  const cacheFile = join(home, '.skraft', 'cli-update.json')
  const channel = channelOf(version)
  const cached = readJson(cacheFile)
  let latest = cached?.channel === channel && now - Number(cached?.checkedAt) < DAY ? cached.latest : undefined
  if (latest === undefined) {
    try {
      const registry = (env.SKRAFT_REGISTRY || 'https://registry.npmjs.org').replace(/\/$/, '')
      const response = await fetch(`${registry}/-/package/${encodeURIComponent(PACKAGE)}/dist-tags`, { signal: AbortSignal.timeout(1500) })
      if (!response.ok) return
      latest = (await response.json())?.[channel]
      if (typeof latest !== 'string') return
      mkdirSync(join(home, '.skraft'), { recursive: true })
      writeFileSync(cacheFile, `${JSON.stringify({ channel, latest, checkedAt: now })}\n`)
    } catch {
      return
    }
  }
  if (isNewer(latest, version)) say(`skraft ${latest} is available (installed: ${version}); type upgrade`)
}
