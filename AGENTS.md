

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## skraft-framework documentation

- Framework architecture, genesis anchoring (A9/S4/S7), fail modes, guardrails G1–G8,
  and the guide for adding a new guardrail: **`plugins/README.md`**.
- Roadmap with all 13 US (gain + status + milestone): **`docs/roadmap.md`**.

## Repository structure

```
plugins/               ← Claude Code plugin (production source + Stryker config)
  src/
    domain/            ← Pure functions, no IO (Clean Architecture: Domain layer)
    application/       ← Use cases, orchestrate domain + ports (Application layer)
    ports/
      api/             ← Inbound port stubs (hook type constants)
      infrastructure/  ← Outbound port interfaces (transcript reader, audit writer…)
    adapters/
      api/hooks/       ← Hook router, service factory, entry, decision helpers
      infrastructure/  ← JSONL audit writer, JSON state reader, system clock…
    cli/               ← Composition root: hook.mjs wires all services
  hooks/               ← hooks.json manifest (Claude Code hook declarations)
  stryker.config.mjs   ← Mutation testing config (runs tests from tests/skraft-framework/)
  skraft-framework.config.json  ← Generated config (agentSkills, phaseOrder…)

tests/
  skraft-framework/    ← ALL tests (unit + acceptance) — single flat directory
```

### Test placement rules

- **All test files live in `tests/skraft-framework/`** — never inside `plugins/`.
- Naming convention:
  - Unit tests: `{module}.unit.test.mjs` (e.g. `skill-policy.unit.test.mjs`)
  - Acceptance tests: `{feature}.acceptance.test.mjs` (e.g. `skill-loading.acceptance.test.mjs`)
  - Integration/other: `{module}.test.mjs`
- `stryker.config.mjs` uses the glob `tests/skraft-framework/*.test.mjs` — it picks up all tests automatically. **Never replace this glob with an explicit list.**
- Import paths from `tests/skraft-framework/` into plugin source: `../../plugins/src/...`

### stryker.config.mjs rules

- The `mutate` array is **additive**: when adding new modules, append to the existing list — never replace it.
- The `testFiles` glob must stay `['tests/skraft-framework/*.test.mjs']` — never enumerate files explicitly.
- The existing `thresholds` are set per-story; do not change them without an explicit instruction.

### gh-aw workflow frontmatter rules

- Never hand-compute `frontmatter_hash` in `.github/workflows/*.lock.yml` (no ad-hoc SHA256/Node/Python scripts). Always run `gh aw compile <workflow-name>` and let it regenerate the lockfile, then diff the result.
- If `gh aw compile` isn't available in the environment, install it first (`gh extension install github/gh-aw`) rather than reverse-engineering the hash algorithm.

### File inspection tool rules

- Use the `view`/`grep`/`glob` tools to read or search files — not `bash cat`/`head`/`tail`/`find`. Reserve `bash` for git, test, and build commands.
- Use `view_range` on large files instead of dumping the whole file into context.

