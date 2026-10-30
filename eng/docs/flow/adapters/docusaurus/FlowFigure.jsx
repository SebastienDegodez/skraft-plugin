// Docusaurus adapter for the flow figures (not wired yet: the site migrates on docs/docusaurus).
// Renders the same SVG as the Jekyll pre-render, then hands it to the shared animation.
import React, { useEffect, useMemo, useRef } from 'react'
import { renderFigure } from '@site/static/flow-figure/render.mjs'
import { animate } from '@site/static/flow-figure/animate.mjs'
import '@site/static/flow-figure/flow-figure.css'

export default function FlowFigure({ flow, lang = 'fr' }) {
  const host = useRef(null)
  const html = useMemo(() => renderFigure(flow, { lang, embedData: false }), [flow, lang])
  useEffect(() => {
    const figure = host.current?.querySelector('figure.skraft-flow')
    if (!figure) return undefined
    const controller = animate(figure, flow)
    return () => controller.destroy()
  }, [html, flow])
  return <div ref={host} dangerouslySetInnerHTML={{ __html: html }} />
}
