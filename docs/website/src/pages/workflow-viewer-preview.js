import React from 'react'
import Layout from '@theme/Layout'
import WorkflowViewer from '@site/src/components/WorkflowViewer'

// TEMPORARY preview of the workflow viewer until the embedding commit places it in the three pages
// (reference/workflow-dot, explanation/pipeline/index, how-to/eject-workflow); deleted then.
export default function WorkflowViewerPreview() {
  return (
    <Layout title="Workflow viewer preview" noFooter>
      <main className="container margin-vert--lg">
        <h1>Workflow viewer preview</h1>
        <WorkflowViewer file="pipeline" />
        <h2>Review, vertical</h2>
        <WorkflowViewer file="review" direction="TB" />
      </main>
    </Layout>
  )
}
