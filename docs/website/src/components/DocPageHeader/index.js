import React from 'react'
import { useDoc } from '@docusaurus/plugin-content-docs/client'
import PhaseRibbon from '@site/src/components/PhaseRibbon'

// The slot above every doc page: the phase ribbon when the front matter has `phase`.
// WP4 adds the Agent button (PageActions) and the Markdown twin <link> here.
export default function DocPageHeader() {
  const { frontMatter } = useDoc()
  return <>{frontMatter.phase && <PhaseRibbon current={frontMatter.phase} />}</>
}
