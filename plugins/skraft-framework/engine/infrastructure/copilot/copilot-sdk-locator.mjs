import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * CopilotSdk on the Copilot CLI's own packages: `<home>/.copilot/pkg/<platform>/<version>/`
 * holds `copilot-sdk/index.js` and the CLI entry `index.js`, the layout the host probe drives
 * (Copilot CLI 1.0.101-0, darwin; `eng/host-probe/copilot-probe.mjs`). A version without both is
 * passed over: without the CLI entry the SDK cannot launch the plugin's extension.
 * @param {{ home: string }} options home: the folder that holds `.copilot/`
 * @returns {import('../../application/ports/copilot-sdk.mjs').CopilotSdk}
 */
export const createCopilotSdkLocator = ({ home }) => Object.freeze({
  locate: async () => locate(join(home, '.copilot', 'pkg')),
})

/** @param {string} looked @returns {import('../../application/ports/copilot-sdk.mjs').CopilotSdkLocation} */
const locate = (looked) => {
  const [newest] = shipped(looked).sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
  return newest === undefined ? { found: false, looked } : { found: true, ...newest }
}

/** Every version of every platform folder that ships the SDK and the CLI entry. @param {string} pkg */
const shipped = (pkg) => foldersOf(pkg)
  .flatMap((platform) => foldersOf(join(pkg, platform)).map((version) => ({ version, sdk: join(pkg, platform, version, 'copilot-sdk'), cli: join(pkg, platform, version, 'index.js') })))
  .filter(({ sdk, cli }) => existsSync(join(sdk, 'index.js')) && existsSync(cli))

/** The folders in a folder; none when it is absent. @param {string} dir */
const foldersOf = (dir) => {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map(({ name }) => name)
}
