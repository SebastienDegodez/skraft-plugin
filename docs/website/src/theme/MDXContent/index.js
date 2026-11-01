import React from 'react'
import MDXContent from '@theme-original/MDXContent'
import useRouteContext from '@docusaurus/useRouteContext'
import DocPageHeader from '@site/src/components/DocPageHeader'

// Wrap (safe): the page header slot goes before the content of a docs page only.
export default function MDXContentWrapper(props) {
  const { plugin } = useRouteContext()
  const isDocsPage = plugin.name === 'docusaurus-plugin-content-docs'
  return (
    <>
      {isDocsPage && <DocPageHeader />}
      <MDXContent {...props} />
    </>
  )
}
