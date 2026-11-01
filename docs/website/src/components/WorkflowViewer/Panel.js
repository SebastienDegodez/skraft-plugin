import React, { useEffect, useId, useRef } from 'react'
import Link from '@docusaurus/Link'
import { translate } from '@docusaurus/Translate'
import { panelFields } from './flow-model.mjs'
import styles from './styles.module.css'

const docLink = (versionPath, to) => `${versionPath.replace(/\/$/, '')}/${to}`

const Field = ({ field, versionPath }) => (
  <>
    <dt>{field.key}</dt>
    <dd>
      <code>{field.value}</code>
      <span className={styles.refs}>
        {field.links.map(({ to, label }) => (
          <Link key={`${to}:${label}`} to={docLink(versionPath, to)}>{label}</Link>
        ))}
      </span>
    </dd>
  </>
)

const Leads = ({ edges }) => (
  <>
    <h4>{translate({ id: 'skraft.workflowViewer.leadsTo', message: 'Leads to' })}</h4>
    <ul className={styles.leads}>
      {edges.map((edge) => (
        <li key={edge.id}>
          <code>{edge.target}</code>
          {edge.data.label && ` · ${edge.data.label}`}
          {edge.data.maxVisits !== null && ` · max_visits=${edge.data.maxVisits}`}
        </li>
      ))}
    </ul>
  </>
)

/**
 * The details of the selected node: every field it sets, each linked to the reference.
 * Esc closes it and gives the focus back to the node.
 */
export default function Panel({ node, edges, versionPath, onClose, onOpenWorkflow }) {
  const heading = useRef(null)
  const titleId = useId()
  useEffect(() => heading.current?.focus(), [node.id])
  const onKeyDown = (event) => {
    if (event.key === 'Escape') onClose()
  }
  return (
    <aside className={styles.panel} aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <div className={styles.panelHeader}>
        <h3 id={titleId} ref={heading} tabIndex={-1}>{node.id}</h3>
        <button type="button" className="clean-btn" onClick={onClose}
          aria-label={translate({ id: 'skraft.workflowViewer.close', message: 'Close the details' })}>
          ×
        </button>
      </div>
      <dl className={styles.fields}>
        {panelFields(node).map((field) => <Field key={field.key} field={field} versionPath={versionPath} />)}
      </dl>
      {node.call && (
        <button type="button" className="button button--sm button--primary" onClick={() => onOpenWorkflow(node.call.workflow)}>
          {translate({ id: 'skraft.workflowViewer.openCalled', message: 'Open the {workflow} workflow' }, { workflow: node.call.workflow })}
        </button>
      )}
      {edges.length > 0 && <Leads edges={edges} />}
    </aside>
  )
}
