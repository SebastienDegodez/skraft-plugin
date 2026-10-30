// <skraft-flow src="deliver.json" lang="fr"> — fetches a flow, renders it, animates it.
// Also wakes figures pre-rendered into a static page (figure.skraft-flow with an embedded
// <script class="sf-data">), such as the standalone artifact page.

import { renderFigure } from './render.mjs'
import { animate } from './animate.mjs'

const wake = (figure) => {
  if (figure.dataset.live) return
  const data = figure.querySelector('script.sf-data')
  if (!data) return
  figure.dataset.live = 'true'
  animate(figure, JSON.parse(data.textContent))
}

export class SkraftFlow extends HTMLElement {
  async connectedCallback() {
    if (this.dataset.live) return
    this.dataset.live = 'true'
    const lang = this.getAttribute('lang') || document.documentElement.lang || 'fr'
    const response = await fetch(this.getAttribute('src'))
    const flow = await response.json()
    this.innerHTML = renderFigure(flow, { lang, embedData: false })
    const figure = this.querySelector('figure.skraft-flow')
    figure.dataset.live = 'true'
    this.controller = animate(figure, flow)
  }

  disconnectedCallback() {
    this.controller?.destroy()
  }
}

if (!customElements.get('skraft-flow')) customElements.define('skraft-flow', SkraftFlow)

const wakeAll = () => document.querySelectorAll('figure.skraft-flow').forEach(wake)
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wakeAll)
else wakeAll()
