import React, { useState } from 'react'
import clsx from 'clsx'
import { Highlight } from 'prism-react-renderer'
import Translate, { translate } from '@docusaurus/Translate'
import { commandsOf, languageOf, parseConsole, statusOf, titleOf } from './parse.mjs'
import styles from './styles.module.css'

// A ```console fence as a macOS terminal window: title bar with the three dots, prompts muted,
// commands highlighted, status words coloured, a copy button that copies the commands only.
// The card stays dark in both colour modes; its palette is the one of eng/docs/terminal-svg.mjs.

// Token colours read the card palette (styles.module.css), so every token keeps AA on the card.
const THEME = {
  plain: { color: 'var(--term-text)' },
  styles: [
    { types: ['comment'], style: { color: 'var(--term-muted)', fontStyle: 'italic' } },
    { types: ['string', 'char', 'attr-value'], style: { color: 'var(--term-ok)' } },
    { types: ['function', 'builtin', 'keyword'], style: { color: 'var(--term-prompt)' } },
    { types: ['variable', 'parameter', 'number', 'boolean'], style: { color: 'var(--term-warn)' } },
  ],
}

function Command({ row }) {
  const language = languageOf(row)
  if (!language) return <span className={styles.command}>{row.text}</span>
  return (
    <Highlight code={row.text} language={language} theme={THEME}>
      {({ tokens, getTokenProps }) => (
        <span className={styles.command}>
          {tokens[0].map((token, index) => <span key={index} {...getTokenProps({ token })} />)}
        </span>
      )}
    </Highlight>
  )
}

function Output({ text }) {
  const status = statusOf(text)
  if (!status) return <span className={styles.output}>{text}</span>
  return (
    <span className={styles.output}>
      <span className={styles[status.status]}>{status.word}</span>
      {text.slice(status.word.length)}
    </span>
  )
}

function Row({ row }) {
  if (row.kind === 'output') return <Output text={row.text} />
  return (
    <>
      {row.kind === 'command' && <span className={styles.prompt}>{row.prompt} </span>}
      <Command row={row} />
    </>
  )
}

function CopyButton({ commands }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(commands)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <>
      <button type="button" className={styles.button} onClick={copy}>
        {copied ? <Translate id="skraft.terminal.copied">Copied</Translate> : <Translate id="skraft.terminal.copy">Copy commands</Translate>}
      </button>
      <span className={styles.announce} aria-live="polite">
        {copied && <Translate id="skraft.terminal.copied">Copied</Translate>}
      </span>
    </>
  )
}

function WrapButton({ wrapped, onToggle }) {
  const label = translate({ id: 'theme.CodeBlock.wordWrapToggle', message: 'Toggle word wrap' })
  return (
    <button type="button" className={styles.button} aria-pressed={wrapped} aria-label={label} title={label} onClick={onToggle}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path fill="currentColor" d="M4 19h6v-2H4v2zM20 5H4v2h16V5zm-3 6H4v2h13.25c1.1 0 2 .9 2 2s-.9 2-2 2H15v-2l-3 3 3 3v-2h2c2.21 0 4-1.79 4-4s-1.79-4-4-4z" />
      </svg>
    </button>
  )
}

export default function Terminal({ children, metastring }) {
  const rows = parseConsole(String(children))
  const commands = commandsOf(rows)
  const title = titleOf(metastring) ?? translate({ id: 'skraft.terminal.title', message: 'Terminal' })
  const [wrapped, setWrapped] = useState(false)
  return (
    <div className={styles.terminal} role="region" aria-label={title}>
      <div className={styles.bar}>
        <span className={styles.dots} aria-hidden="true">
          <i className={styles.close} />
          <i className={styles.minimize} />
          <i className={styles.zoom} />
        </span>
        <span className={styles.title}>{title}</span>
        <span className={styles.actions}>
          <WrapButton wrapped={wrapped} onToggle={() => setWrapped(!wrapped)} />
          {commands && <CopyButton commands={commands} />}
        </span>
      </div>
      <pre className={clsx(styles.body, wrapped && styles.wrapped)} tabIndex={0}>
        <code>
          {rows.map((row, index) => (
            <div key={index} className={styles.line}>
              <Row row={row} />
            </div>
          ))}
        </code>
      </pre>
    </div>
  )
}
