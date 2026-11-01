import React from 'react'
import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react'
import styles from './styles.module.css'

const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** A smooth path through dagre's route: a quadratic curve around each inner point. */
export const routePath = (points) => {
  const [first, ...rest] = points
  const last = rest.at(-1)
  const inner = rest.slice(0, -1)
  const curves = inner.map((point, index) => {
    const end = index === inner.length - 1 ? last : middle(point, inner[index + 1])
    return `Q ${point.x} ${point.y} ${end.x} ${end.y}`
  })
  return [`M ${first.x} ${first.y}`, ...(curves.length ? curves : [`L ${last.x} ${last.y}`])].join(' ')
}

/** An edge drawn along dagre's route, with its label and its max_visits badge. */
export default function RouteEdge({ id, data, markerEnd }) {
  const { label, maxVisits, labelAt, points } = data
  return (
    <>
      <BaseEdge id={id} path={routePath(points)} markerEnd={markerEnd} className={styles.edge} />
      {labelAt && (
        <EdgeLabelRenderer>
          <div className={styles.edgeLabel} style={{ transform: `translate(-50%, -50%) translate(${labelAt.x}px, ${labelAt.y}px)` }}>
            {label && <span>{label}</span>}
            {maxVisits !== null && <span className={styles.visits} title={`max_visits=${maxVisits}`}>{`≤${maxVisits}`}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
