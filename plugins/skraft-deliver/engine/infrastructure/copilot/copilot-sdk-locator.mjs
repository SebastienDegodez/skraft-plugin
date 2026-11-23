import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * CopilotSdk on the Copilot CLI's own packages: `<home>/.copilot/pkg/<platform>-<arch>/<version>/`
 * holds `copilot-sdk/index.js` and the CLI entry `index.js`, the layout the host probe drives
 * (Copilot CLI 1.0.101-0, darwin-arm64; `eng/host-probe/copilot-probe.mjs`). Only this machine's
 * platform folder counts. A version without both is passed over: without the CLI entry the SDK
 * cannot launch the plugin's extension. A folder that cannot be read holds nothing.
 * @param {{ home: string, platform?: string }} options home: the folder that holds `.copilot/`;
 *   platform: `<platform>-<arch>` as Node names them, this machine's by default
 * @returns {import('../../application/ports/copilot-sdk.mjs').CopilotSdk}
 */
export const createCopilotSdkLocator = ({ home, platform = `${process.platform}-${process.arch}` }) => Object.freeze({
  locate: async () => locate(join(home, '.copilot', 'pkg'), platform),
})

/** @param {string} looked @param {string} platform @returns {import('../../application/ports/copilot-sdk.mjs').CopilotSdkLocation} */
const locate = (looked, platform) => {
  const newest = shipped(join(looked, platform)).sort((a, b) => compareVersions(a.version, b.version)).at(-1)
  return newest === undefined ? { found: false, looked } : { found: true, ...newest }
}

/** Every version of the platform folder that ships the SDK and the CLI entry. @param {string} dir */
const shipped = (dir) => foldersOf(dir)
  .map((version) => ({ version, sdk: join(dir, version, 'copilot-sdk'), cli: join(dir, version, 'index.js') }))
  .filter(({ sdk, cli }) => existsSync(join(sdk, 'index.js')) && existsSync(cli))

/** The folders in a folder; none when it is absent or cannot be read. @param {string} dir */
const foldersOf = (dir) => {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map(({ name }) => name)
  } catch {
    return []
  }
}

/**
 * Semantic version order: major, minor, patch by number, then a prerelease below its release,
 * prereleases by their identifiers (numbers by value, below words).
 * @param {string} a @param {string} b @returns {number}
 */
const compareVersions = (a, b) => {
  const [left, right] = [partsOf(a), partsOf(b)]
  return compareLists(left.release, right.release) || comparePrerelease(left.prerelease, right.prerelease)
}

/** @param {string} version */
const partsOf = (version) => {
  const [release, ...rest] = version.split('-')
  return { release: release.split('.').map(Number), prerelease: rest.length === 0 ? null : rest.join('-').split('.') }
}

/** @param {string[] | null} a @param {string[] | null} b */
const comparePrerelease = (a, b) => {
  if (a === null || b === null) return (a === null ? 1 : 0) - (b === null ? 1 : 0)
  return compareLists(a, b)
}

/**
 * Item by item, a missing item first.
 * @param {Array<number | string>} a @param {Array<number | string>} b
 */
const compareLists = (a, b) => {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const order = compareItems(a[index], b[index])
    if (order !== 0) return order
  }
  return 0
}

/** @param {number | string | undefined} a @param {number | string | undefined} b */
const compareItems = (a, b) => {
  if (a === undefined || b === undefined) return missing(a) - missing(b)
  const [x, y] = [Number(a), Number(b)]
  if (!Number.isNaN(x) && !Number.isNaN(y)) return Math.sign(x - y)
  if (Number.isNaN(x) !== Number.isNaN(y)) return Number.isNaN(x) ? 1 : -1
  return String(a).localeCompare(String(b))
}

/** A missing item sorts first. @param {unknown} item */
const missing = (item) => (item === undefined ? -1 : 0)
