import React from 'react'
import Link from '@docusaurus/Link'
import Translate, { translate } from '@docusaurus/Translate'
import styles from './styles.module.css'

const PRODUCT = ['discover', 'discuss']
const ENGINEERING = ['research', 'design', 'distill', 'deliver']

/** "You are here" strip. `current` selects the sequence and the active step; without it, the engineering strip is static. */
export default function PhaseRibbon({ current }) {
  const phases = PRODUCT.includes(current) ? PRODUCT : ENGINEERING
  const scope = PRODUCT.includes(current)
    ? translate({ id: 'skraft.phaseRibbon.product', message: 'optional product preflight' })
    : translate({ id: 'skraft.phaseRibbon.engineering', message: 'engineering pipeline' })
  return (
    <nav className={styles.ribbon} aria-label={translate({ id: 'skraft.phaseRibbon.label', message: 'Pipeline phases' })}>
      <span className={styles.scope}>{scope}</span>
      {phases.map((phase, index) => (
        <React.Fragment key={phase}>
          {phase === current ? (
            <span className={`${styles.step} ${styles.active}`} aria-current="step">{phase.toUpperCase()}</span>
          ) : (
            <Link className={styles.step} to={`/explanation/pipeline/${phase}`}>{phase.toUpperCase()}</Link>
          )}
          {index < phases.length - 1 && <span aria-hidden="true">→</span>}
        </React.Fragment>
      ))}
    </nav>
  )
}
