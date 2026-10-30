# FlowFigure — Docusaurus adapter

Not wired yet. To use it once the site runs on Docusaurus:

1. Copy (or symlink) `docs/site/assets/js/flow-figure/` to `static/flow-figure/`.
2. Copy `docs/flows/<id>.json` where the site can import it (e.g. `src/flows/`).
3. Copy `FlowFigure.jsx` to `src/components/FlowFigure.jsx`.
4. In an `.mdx` page:

       import FlowFigure from '@site/src/components/FlowFigure'
       import deliver from '@site/src/flows/deliver.json'

       <FlowFigure flow={deliver} lang="fr" />

The SVG is rendered during the static build (`render` is pure), the animation starts in the browser.
