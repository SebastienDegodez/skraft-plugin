import React, { useState } from 'react'
import Translate, { translate } from '@docusaurus/Translate'
import { commandsOf, parseConsole, titleOf } from './parse.mjs'
import styles from './styles.module.css'

// Minimal Terminal (WP0): macOS title bar, prompts, commands, output, copy of the commands only.
// WP3 adds highlighting, the status words, word wrap and the mobile rules.
export default function Terminal({ children, metastring }) {
  const rows = parseConsole(String(children))
  const commands = commandsOf(rows)
  const title = titleOf(metastring) ?? translate({ id: 'skraft.terminal.title', message: 'Terminal' })
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(commands)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className={styles.terminal} role="region" aria-label={title}>
      <div className={styles.bar}>
        <span className={styles.dots} aria-hidden="true">
          <i style={{ background: '#ff5f57' }} />
          <i style={{ background: '#febc2e' }} />
          <i style={{ background: '#28c840' }} />
        </span>
        <span className={styles.title}>{title}</span>
        {commands && (
          <button type="button" className={styles.copy} onClick={copy}>
            {copied ? <Translate id="skraft.terminal.copied">Copied</Translate> : <Translate id="skraft.terminal.copy">Copy commands</Translate>}
          </button>
        )}
      </div>
      <pre className={styles.body} tabIndex={0}>
        {rows.map((row, index) => (
          <div key={index} className={styles[row.kind]}>
            {row.prompt && <span className={styles.prompt}>{row.prompt} </span>}
            {row.text}
          </div>
        ))}
      </pre>
    </div>
  )
}
