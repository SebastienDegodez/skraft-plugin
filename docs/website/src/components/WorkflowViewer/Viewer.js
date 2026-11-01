import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Controls, MarkerType, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useColorMode } from '@docusaurus/theme-common'
import useBaseUrl from '@docusaurus/useBaseUrl'
import { translate } from '@docusaurus/Translate'
import { readWorkflow } from '@skraft/engine-domain/workflow/workflow.mjs'
import { questionSpec } from '@skraft/engine-domain/decisions/questions.mjs'
import { toFlow } from './flow-model.mjs'
import { chooseSource, fetchLive, liveUrl } from './source.mjs'
import { NODE_TYPES } from './nodes'
import RouteEdge from './RouteEdge'
import Panel from './Panel'
import styles from './styles.module.css'

const EDGE_TYPES = { route: RouteEdge }
const WORKFLOWS = ['pipeline', 'review']
const WIDE = '(min-width: 997px)'
const FIT = { padding: 0.08 }
const READABLE = 0.55 // below this zoom a card's text is unreadable
const EDGE_GAP = 16

/**
 * The whole drawing when it stays readable; else a readable zoom anchored at the start (left in
 * a horizontal layout, top in a vertical one) and centred across. The Fit button shows it all.
 */
const firstView = (flow, direction, box) => {
  const fit = Math.min(box.width / flow.width, box.height / flow.height)
  if (fit >= READABLE) return null
  const across = (room, size) => Math.max(EDGE_GAP, (room - size * READABLE) / 2)
  return direction === 'LR'
    ? { zoom: READABLE, x: EDGE_GAP, y: across(box.height, flow.height) }
    : { zoom: READABLE, x: across(box.width, flow.width), y: EDGE_GAP }
}
const answersOf = (question) => questionSpec(question)?.options ?? []

/** The pipeline is read as the engine runs it; a workflow it calls, as a call reads it. */
const readerOf = (file) => (text) => readWorkflow(text, { called: file !== 'pipeline' })

const fetchBundled = async (url) => {
  try {
    const response = await fetch(url)
    return response.ok ? await response.text() : null
  } catch {
    return null
  }
}

/** Reads the workflow once per file: live first, the bundled copy otherwise. */
const useSource = (file, gitRef, versionName) => {
  const bundledUrl = useBaseUrl(`/workflows/${versionName}/${file}.skraft.dot`)
  const [source, setSource] = useState(null)
  useEffect(() => {
    let current = true
    setSource(null)
    Promise.all([fetchLive(liveUrl(gitRef, file)), fetchBundled(bundledUrl)]).then(([live, bundled]) => {
      if (current) setSource(chooseSource({ live, bundled, read: readerOf(file) }))
    })
    return () => {
      current = false
    }
  }, [file, gitRef, bundledUrl])
  return source
}

const flowNodesOf = (flow, direction) => flow.nodes.map((node) => {
  const lane = node.type === 'phase'
  return {
    ...node,
    data: { ...node.data, direction },
    style: { width: node.width, height: node.height },
    draggable: false,
    selectable: !lane,
    focusable: !lane,
    zIndex: lane ? -1 : 0,
    ariaLabel: lane ? undefined : `${node.type} ${node.data.title}`,
  }
})

const flowEdgesOf = (flow) => flow.edges.map((edge) => ({
  ...edge,
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
  focusable: false,
  selectable: false,
}))

const Toggle = ({ label, options, value, onChange }) => (
  <div className={styles.toggle} role="group" aria-label={label}>
    {options.map(([key, text]) => (
      <button key={key} type="button" aria-pressed={value === key} className={`button button--sm ${value === key ? 'button--primary' : 'button--secondary'}`} onClick={() => onChange(key)}>
        {text}
      </button>
    ))}
  </div>
)

const Toolbar = ({ file, setFile, direction, setDirection }) => {
  const { fitView } = useReactFlow()
  return (
    <div className={styles.toolbar}>
      <Toggle label={translate({ id: 'skraft.workflowViewer.workflow', message: 'Workflow' })} value={file} onChange={setFile}
        options={[['pipeline', translate({ id: 'skraft.workflowViewer.pipeline', message: 'Pipeline' })], ['review', translate({ id: 'skraft.workflowViewer.review', message: 'Review' })]]} />
      <Toggle label={translate({ id: 'skraft.workflowViewer.layout', message: 'Layout' })} value={direction} onChange={setDirection}
        options={[['LR', translate({ id: 'skraft.workflowViewer.horizontal', message: 'Horizontal' })], ['TB', translate({ id: 'skraft.workflowViewer.vertical', message: 'Vertical' })]]} />
      <button type="button" className="button button--sm button--secondary" onClick={() => fitView(FIT)}>
        {translate({ id: 'skraft.workflowViewer.fit', message: 'Fit' })}
      </button>
    </div>
  )
}

const Notice = ({ source, gitRef }) => {
  if (source === null) return <figcaption className={styles.notice}>{translate({ id: 'skraft.workflowViewer.loading', message: 'Loading the workflow…' })}</figcaption>
  if (source.origin === 'live') {
    return <figcaption className={styles.notice} data-origin="live">{translate({ id: 'skraft.workflowViewer.live', message: 'Live from GitHub' })} <code>{gitRef}</code></figcaption>
  }
  const text = source.origin === 'bundled'
    ? translate({ id: 'skraft.workflowViewer.bundled', message: 'Copy built with this page ({ref}): live fetch failed ({reason})' }, { ref: gitRef, reason: source.reason })
    : translate({ id: 'skraft.workflowViewer.none', message: 'The workflow could not be read ({reason})' }, { reason: source.reason })
  return <figcaption className={styles.notice} data-origin={source.origin}>{text}</figcaption>
}

const Diagram = ({ workflow, direction, file, setFile, setDirection, versionPath }) => {
  const { colorMode } = useColorMode()
  const flow = useMemo(() => toFlow(workflow, { direction, answersOf }), [workflow, direction])
  const edges = useMemo(() => flowEdgesOf(flow), [flow])
  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodesOf(flow, direction))
  const { fitView, setViewport } = useReactFlow()
  const frame = useRef(null)
  const viewport = useRef(null)
  useEffect(() => {
    setNodes(flowNodesOf(flow, direction))
    requestAnimationFrame(() => {
      const view = viewport.current && firstView(flow, direction, viewport.current.getBoundingClientRect())
      if (view) setViewport(view)
      else fitView(FIT)
    })
  }, [flow, direction, setNodes, fitView, setViewport])
  const selected = nodes.find((node) => node.selected && node.type !== 'phase')
  const close = useCallback(() => {
    const id = selected?.id
    setNodes((all) => all.map((node) => ({ ...node, selected: false })))
    if (id) frame.current?.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`)?.focus()
  }, [selected, setNodes])
  return (
    <div className={styles.frame} ref={frame}>
      <Toolbar file={file} setFile={setFile} direction={direction} setDirection={setDirection} />
      <div className={styles.viewport} data-direction={direction} ref={viewport}>
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
          colorMode={colorMode} minZoom={0.15} maxZoom={2}
          zoomOnScroll={false} panOnScroll={false} preventScrolling={false} zoomOnDoubleClick={false}
          nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} elementsSelectable
          proOptions={{ hideAttribution: true }}
          aria-label={translate({ id: 'skraft.workflowViewer.diagram', message: 'Workflow {file}' }, { file })}>
          <Controls showInteractive={false} fitViewOptions={FIT} />
        </ReactFlow>
        {selected && (
          <Panel node={workflow.nodes[selected.id]} edges={edges.filter((edge) => edge.source === selected.id)}
            versionPath={versionPath} onClose={close} onOpenWorkflow={setFile} />
        )}
      </div>
    </div>
  )
}

const initialDirection = (given) => given ?? (window.matchMedia(WIDE).matches ? 'LR' : 'TB')

/** The client-only viewer: loads the workflow, draws it, and holds the toolbar state. */
export default function Viewer({ file: firstFile, direction: given, gitRef, versionName, versionPath }) {
  const [file, setFile] = useState(WORKFLOWS.includes(firstFile) ? firstFile : 'pipeline')
  const [direction, setDirection] = useState(() => initialDirection(given))
  const source = useSource(file, gitRef, versionName)
  return (
    <figure className={styles.viewer} data-workflow={file}>
      <ReactFlowProvider>
        {source?.workflow
          ? <Diagram workflow={source.workflow} direction={direction} file={file} setFile={setFile} setDirection={setDirection} versionPath={versionPath} />
          : <div className={styles.viewport} />}
      </ReactFlowProvider>
      <Notice source={source} gitRef={gitRef} />
    </figure>
  )
}
