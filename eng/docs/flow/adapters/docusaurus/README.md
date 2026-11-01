# FlowFigure — Docusaurus adapter

1. Copy `FlowFigure.jsx` to `src/components/FlowFigure.jsx`.
2. Alias the core and the data in a local plugin's `configureWebpack`:
   `resolve: { alias: { '@skraft/flow-figure': path.resolve(repo, 'eng/docs/flow/core'), '@skraft/flows': path.resolve(repo, 'docs/flows') } }`.
3. In an `.mdx` page: `import FlowFigure from '@site/src/components/FlowFigure'`, then `<FlowFigure flow="deliver" />`.
4. The language follows `i18n.currentLocale`, and the colours come from the theme's Infima variables (light and dark).
5. A new flow: add `docs/flows/<id>.layout.json`, run `node eng/docs/flow-from-dot.mjs`, then add one import line to `FLOWS`.

The core imports the canvas's own arrow routing (`engine/drivers/copilot-workflow/canvas-ui/view.js`),
so the figure and the canvas's Workflow tab never disagree.
