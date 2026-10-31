import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { siteVersions, writeWorkflowCopies } from '../../../../eng/docs/workflow-copies.mjs'

// The workflow viewer reads the engine's domain through the @skraft/engine-domain alias
// (plugins/aliases). This plugin gives it its fallback: the DOT files of every version, copied
// into static/workflows/<version>/ before the static files are bundled, on `start` and `build`.
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const viewer = fileURLToPath(new URL('../../src/components/WorkflowViewer/Viewer.js', import.meta.url))

export default function engineDomainPlugin(context) {
  return {
    name: 'skraft-engine-domain',
    async loadContent() {
      writeWorkflowCopies({
        repoRoot,
        staticDir: join(context.siteDir, 'static'),
        versions: siteVersions(context.siteDir),
        refs: context.siteConfig.customFields.workflowRefs,
      })
    },
    // React Flow and dagre stay out of the server bundle: the viewer is client-only (BrowserOnly).
    configureWebpack(config, isServer) {
      return { resolve: { alias: { '@skraft/workflow-viewer-client': isServer ? false : viewer } } }
    },
    getPathsToWatch() {
      return [join(repoRoot, 'plugins', 'skraft-framework', 'workflows', '*.skraft.dot')]
    },
  }
}
