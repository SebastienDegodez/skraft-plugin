import React from 'react'
import { Handle, Position } from '@xyflow/react'
import { translate } from '@docusaurus/Translate'
import styles from './styles.module.css'

const SIDES = { LR: [Position.Left, Position.Right], TB: [Position.Top, Position.Bottom] }

/** Edges are drawn from dagre's routes; the handles only anchor them and stay invisible. */
const Anchors = ({ direction }) => {
  const [into, out] = SIDES[direction]
  return (
    <>
      <Handle type="target" position={into} className={styles.anchor} isConnectable={false} />
      <Handle type="source" position={out} className={styles.anchor} isConnectable={false} />
    </>
  )
}

const Lock = ({ unlock }) => (
  <svg className={styles.lock} viewBox="0 0 16 16" width="14" height="14" role="img"
    aria-label={unlock ? translate({ id: 'skraft.workflowViewer.unlocked', message: 'unlocked' }) : translate({ id: 'skraft.workflowViewer.locked', message: 'locked' })}>
    <rect x="3" y="7" width="10" height="8" rx="1.5" fill="currentColor" />
    <path d={unlock ? 'M5 7V5a3 3 0 0 1 6 0' : 'M5 7V5a3 3 0 0 1 6 0v2'} fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
)

const Mandatory = () => (
  <span className={styles.badge} title="mandatory=true">
    {translate({ id: 'skraft.workflowViewer.mandatory', message: 'mandatory' })}
  </span>
)

const Pill = ({ data }) => (
  <div className={`${styles.pill} ${styles[data.node.kind]}`}>
    <Anchors direction={data.direction} />
    {data.title}
  </div>
)

const Header = ({ data }) => (
  <div className={styles.header}>
    {data.node.kind !== 'review' && <span className={styles.kind}>{data.node.kind}</span>}
    <span className={styles.title}>{data.title}</span>
    {(data.node.locked || data.node.unlock) && <Lock unlock={data.node.unlock} />}
    {data.node.mandatory && <Mandatory />}
  </div>
)

const Rows = ({ rows }) => rows.map((row) => <div key={row} className={styles.row}>{row}</div>)

const Card = ({ data, children }) => (
  <div className={`${styles.card} ${styles[data.node.kind]}`}>
    <Anchors direction={data.direction} />
    <Header data={data} />
    <Rows rows={data.rows} />
    {children}
  </div>
)

const Chip = ({ branch }) => (
  <div className={styles.chip}>
    <span>{branch.lens}</span>
    {branch.when && <span className={styles.when}>{`when=${branch.when}`}</span>}
    {branch.mandatory && <Mandatory />}
  </div>
)

const Review = ({ data }) => (
  <Card data={data}>
    {data.branches.map((branch) => <Chip key={branch.id} branch={branch} />)}
    {data.refutedBy && (
      <div className={`${styles.chip} ${styles.verdict}`}>
        <span>{`${data.refutedBy.id} · finding-refuter`}</span>
        {data.refutedBy.mandatory && <Mandatory />}
      </div>
    )}
    <div className={`${styles.chip} ${styles.verdict}`}>
      {translate({ id: 'skraft.workflowViewer.verdict', message: 'verdict (fan-in)' })}
    </div>
  </Card>
)

const Lane = ({ data }) => (
  <div className={styles.lane} aria-hidden="true">
    <span className={styles.laneTitle}>{data.title}</span>
  </div>
)

export const NODE_TYPES = {
  start: Pill,
  exit: Pill,
  agent: Card,
  gate: Card,
  ask: Card,
  publish: Card,
  call: Card,
  review: Review,
  phase: Lane,
}
