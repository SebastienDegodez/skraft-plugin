import { createNodeFiles } from './files/node-files.mjs'
import { createTrackingStore } from './tracking/tracking-store.mjs'
import { createPluginTemplates } from './templates/plugin-templates.mjs'
import { createSystemClock } from './clock/system-clock.mjs'
import { createWebCryptoHasher } from './crypto/web-crypto-hasher.mjs'

/**
 * Every adapter a Node host needs, except the host's own AgentRunner and progress.
 * @param {{ cwd: string, pluginRoot: string }} host
 */
export const createNodeAdapters = ({ cwd, pluginRoot }) => {
  const files = createNodeFiles()
  const tracking = createTrackingStore({ files, root: cwd })
  return Object.freeze({
    journal: tracking.journal,
    activePipeline: tracking.activePipeline,
    files: tracking.files,
    templates: createPluginTemplates({ files, pluginRoot }),
    clock: createSystemClock(),
    hasher: createWebCryptoHasher(),
  })
}
