import React from 'react'
import Head from '@docusaurus/Head'
import { useDoc } from '@docusaurus/plugin-content-docs/client'
import PageActions from '@site/src/components/PageActions'
import PhaseRibbon from '@site/src/components/PhaseRibbon'
import { twinPathOf } from '@site/plugins/markdown-twin/twin-path.mjs'
import styles from './styles.module.css'

// The slot above every doc page: the phase ribbon when the front matter has `phase`, the Agent
// button on the right, and the <link> to the page's Markdown twin.
export default function DocPageHeader() {
  const { frontMatter, metadata } = useDoc()
  const twinUrl = twinPathOf(metadata)
  return (
    <div className={styles.header}>
      <Head>
        <link rel="alternate" type="text/markdown" href={twinUrl} />
      </Head>
      {frontMatter.phase && <PhaseRibbon current={frontMatter.phase} />}
      <PageActions twinUrl={twinUrl} />
    </div>
  )
}
