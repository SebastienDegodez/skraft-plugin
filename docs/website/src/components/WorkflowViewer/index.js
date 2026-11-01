import React, { Suspense } from 'react'
import BrowserOnly from '@docusaurus/BrowserOnly'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import { useActiveVersion, useLatestVersion } from '@docusaurus/plugin-content-docs/client'
import StaticFallback from './StaticFallback'

// The viewer itself (React Flow, dagre) is a client-only chunk: the alias resolves to an empty
// module in the server build (plugins/engine-domain), so SSR never bundles them.
const Viewer = React.lazy(() => import('@skraft/workflow-viewer-client'))

/** The handbook version this page belongs to (the latest one outside the docs). */
const useVersion = () => {
  const active = useActiveVersion(undefined)
  const latest = useLatestVersion(undefined)
  return active ?? latest
}

/**
 * The interactive drawing of a skraft workflow, read by the engine's readWorkflow.
 * @param {{ file?: 'pipeline' | 'review', direction?: 'LR' | 'TB' }} props
 *   file: the workflow drawn first; direction: the layout, else horizontal on a wide screen
 */
export default function WorkflowViewer({ file = 'pipeline', direction }) {
  const { siteConfig } = useDocusaurusContext()
  const version = useVersion()
  const ref = siteConfig.customFields.workflowRefs[version.name] ?? siteConfig.customFields.workflowRefs.current
  const fallback = <StaticFallback file={file} gitRef={ref} />
  return (
    <BrowserOnly fallback={fallback}>
      {() => (
        <Suspense fallback={fallback}>
          <Viewer file={file} direction={direction} gitRef={ref} versionName={version.name} versionPath={version.path} />
        </Suspense>
      )}
    </BrowserOnly>
  )
}
