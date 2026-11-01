import React from 'react'
import Link from '@docusaurus/Link'
import Translate from '@docusaurus/Translate'
import styles from './styles.module.css'

const BLOB = 'https://github.com/SebastienDegodez/skraft-plugin/blob'

/** What the page shows before the viewer loads, and without JavaScript. */
export default function StaticFallback({ file, gitRef }) {
  return (
    <figure className={styles.fallback}>
      <p>
        <Translate id="skraft.workflowViewer.loading">Loading the workflow…</Translate>
      </p>
      <p>
        <Link href={`${BLOB}/${gitRef}/plugins/skraft-framework/workflows/${file}.skraft.dot`}>
          <code>{`${file}.skraft.dot`}</code>
        </Link>{' '}
        (<code>{gitRef}</code>)
      </p>
    </figure>
  )
}
