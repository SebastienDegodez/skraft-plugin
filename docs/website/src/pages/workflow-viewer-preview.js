import React from 'react'
import Layout from '@theme/Layout'
import { readWorkflow } from '@skraft/engine-domain/workflow/workflow.mjs'

const DOT = 'digraph w { start [shape=Mdiamond]; exit [shape=Msquare]; start -> exit }'

export default function WorkflowViewerPreview() {
  const read = readWorkflow(DOT)
  return <Layout title="Workflow viewer preview" noFooter><main className="container margin-vert--lg">{read.ok ? Object.keys(read.workflow.nodes).join(', ') : 'refused'}</main></Layout>
}
