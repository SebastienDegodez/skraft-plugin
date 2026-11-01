import React, { useState } from 'react'
import { translate } from '@docusaurus/Translate'
import styles from './styles.module.css'

// The Agent button: a real link to the page's Markdown twin (new tab, works without JS and for
// crawlers). On activation it also copies the twin's text; the result is announced in a live region.

const label = () =>
  translate({
    id: 'skraft.agentButton.label',
    message: 'Open this page as Markdown for an AI agent (new tab) and copy it',
  })

const COPIED = () => translate({ id: 'skraft.agentButton.copied', message: 'Markdown copied' })
const FAILED = () =>
  translate({ id: 'skraft.agentButton.failed', message: 'Could not copy; the Markdown opened in a new tab' })

const twinBlob = (url) =>
  fetch(url).then((response) => {
    if (!response.ok) throw new Error('twin not found')
    return response.text().then((text) => new Blob([text], { type: 'text/plain' }))
  })

// The promise-valued ClipboardItem is created during the click, which keeps the user activation in Safari.
// Fallback: the twin's URL, so that the clipboard still leads to the Markdown.
async function copyTwin(url) {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': twinBlob(url) })])
    return true
  } catch {
    await navigator.clipboard?.writeText(url).catch(() => undefined)
    return false
  }
}

function AgentIcon() {
  return (
    <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 8V4M9 13h.01M15 13h.01M9.5 17h5" />
    </svg>
  )
}

/** @param {{ twinUrl: string }} props the site path of the page's Markdown twin */
export default function PageActions({ twinUrl }) {
  const [status, setStatus] = useState('')
  const onClick = () => {
    setStatus('')
    copyTwin(twinUrl).then((copied) => setStatus(copied ? COPIED() : FAILED()))
  }
  // A link activates on Enter natively; Space is added, without scrolling the page.
  const onKeyDown = (event) => {
    if (event.key !== ' ') return
    event.preventDefault()
    event.currentTarget.click()
  }
  return (
    <div className={styles.actions}>
      <a className={`skraft-agent-button ${styles.button}`} href={twinUrl} target="_blank" rel="noopener"
        aria-label={label()} title={label()} onClick={onClick} onKeyDown={onKeyDown}>
        <AgentIcon />
        <span>Agent</span>
      </a>
      <span className={styles.status} role="status" aria-live="polite">{status}</span>
    </div>
  )
}
