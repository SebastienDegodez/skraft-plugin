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

The Copilot entry is `com.github.copilot/extensions/skraft-prd-backlog/extension.mjs`. Tested
against a simulated `ctx` and a fake `gh` (`tests/skraft-backlog/prd-backlog/`).
