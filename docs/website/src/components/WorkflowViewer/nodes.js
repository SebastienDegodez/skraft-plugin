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
