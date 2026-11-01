import React from 'react'
import { usePluginData } from '@docusaurus/useGlobalData'
import useBrokenLinks from '@docusaurus/useBrokenLinks'
import Translate from '@docusaurus/Translate'

function Entry({ cite }) {
  useBrokenLinks().collectAnchor(`cite-${cite.key}`) // so onBrokenAnchors sees the target
  return (
    <p id={`cite-${cite.key}`} className="citation-entry">
      <strong>{cite.authors}</strong> ({cite.year}). <em>{cite.title}</em>.
      {cite.publisher ? ` ${cite.publisher}.` : ''}
      {cite.type === 'article' && <> (<Translate id="skraft.bibliography.article">article</Translate>)</>}
      {cite.type === 'chapter' && <> (<Translate id="skraft.bibliography.chapter">chapter</Translate>)</>}
      {cite.url && <> <a href={cite.url}>{cite.url}</a></>}
    </p>
  )
}

/** Every reference of data/citations.yml, each at `#cite-<key>`. */
export default function Bibliography() {
  const { citations } = usePluginData('skraft-data')
  return citations.map((cite) => <Entry key={cite.key} cite={cite} />)
}
