import React from 'react'
import CodeBlock from '@theme-original/CodeBlock'
import Terminal from '@site/src/components/Terminal'

// ```console fences become a Terminal; every other fence keeps the stock CodeBlock.
export default function CodeBlockWrapper(props) {
  if (props.className === 'language-console') return <Terminal {...props} />
  return <CodeBlock {...props} />
}
