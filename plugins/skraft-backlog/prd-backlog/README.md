# prd-backlog

The `skraft-prd-backlog` Copilot CLI dynamic workflow. It decides nothing a script or a human
decides: every check is a function here, every verdict comes from `review-verdict.mjs`.

- `workflow.mjs`: `PRD_BACKLOG_META` and the workflow body (`ctx.step`, `ctx.agent`,
  `ctx.parallel`, `ctx.pause`).
- `prd-inventory.mjs`: the requirement ids of a PRD and the epic of each FR.
- `story-map.mjs`: checks of `story-map.json` (coverage, ids, milestones, tracer, dependencies,
  cycles) and the build order.
- `story.mjs`: Definition of Ready checks of a story file.
- `briefs.mjs`: the prompts of the slicer, the story writer and the four planning lenses.
- `render.mjs`: `story-map.md`, the lens inputs and the GitHub issue bodies.
- `handoff.mjs`: the planned operations and the HVE planning files.
- `publish.mjs`: the idempotent publisher over `gh`.

`canvas/` is the backlog canvas the same extension declares:

- `assess.mjs`: each story's INVEST letters and DoR items, with the evidence behind them (the
  checks of `story.mjs`, the map, the lens findings).
- `store.mjs`: the files the canvas reads, and `review.json` / `published.json` it writes.
- `creation.mjs`: the selection closed over dependencies, its sub-plan, the dry run and the
  creation through `publish.mjs`.
- `controller.mjs`: the actions the panel and the agent share; reviewing and creating are human
  actions.
- `explain.mjs`: the explanation the agent reads.
- `server.mjs`: the loopback server (per-process token, loopback Host, server-sent events).
- `canvas.mjs`: the declaration passed to `createCanvas`.
- `ui/`: the panel (`view.mjs` renders, `app.mjs` wires, `i18n.mjs` words every check in French and
  English).

The Copilot entry is `com.github.copilot/extensions/skraft-prd-backlog/extension.mjs`. Tested
against a simulated `ctx` and a fake `gh` (`tests/skraft-backlog/prd-backlog/`,
`tests/skraft-backlog/canvas/`); the panel runs in a browser under Playwright
(`npx playwright test -c playwright.backlog-canvas.config.mjs`).
