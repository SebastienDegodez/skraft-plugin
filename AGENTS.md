

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

- Plugin install, use, pipeline, guardrails and harness packaging:
  **`plugins/skraft-framework/README.md`**.
- Framework internals and physical architecture: **`docs/architecture.md`**.
- Runtime hook rationale, fail modes and guardrails G1–G8:
  **`docs/site/en/explanation/hooks.md`** and **`docs/site/fr/explanation/hooks.md`**.
- Roadmap with all 13 US (gain + status + milestone): **`docs/roadmap.md`**.
- Skill evaluation (Vally), the published quality dashboard and AGENTVIZ replay:
  **`docs/skill-evaluation.md`**.

## Repository structure

```
plugins/
  skraft-framework/    ← Claude Code plugin (production source + Stryker config)
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
  skraft-framework/    ← ALL framework tests (unit + acceptance) — single flat directory
  dashboard/           ← Tests for the eng/ evaluation & dashboard tooling
  skills/              ← Vally eval specs: tests/skills/<skill>/eval.yaml
  agents/              ← Vally real-agent specs + suite-local fixtures
  site/                ← Playwright smoke tests for docs/site (incl. the dashboard)

eng/                   ← Skill evaluation & dashboard tooling (zero-dependency Node)
  lib/                 ← Pure rules (front matter, skill profile, verdict, replay naming)
  catalog/scan.mjs     ← Plugin sources → artifacts/catalog/report.json
  vally-adapter/       ← Paired Vally runs → eval-results/<skill>/results.json
  dashboard/           ← History, published data, AGENTVIZ manifest, retention, publish.sh
  run-vally-evals.sh   ← One local runner: paired skill comparisons + real-agent suites
```

### Agent descriptor rules

Descriptors under `plugins/skraft-framework/com.anthropic.claude-code/agents/` are
prompts an agent pays for on every run, not documentation.

- **Write for the agent, never for a human reader.** Every sentence must carry a
  decision the agent has to make. No prose explaining why a rule exists, no gloss
  on the descriptor's own wording, no justification clause. The reasoning belongs
  in the commit message.
- **Put a rule's scope inside the rule**, not in a paragraph after it. A
  prohibition scoped too narrowly is an escape hatch: `You NEVER produce business
  content yourself` left the orchestrator free to configure Stryker and run the
  mutation gates, so it did DELIVER itself and dispatched nothing.
- **Never argue from the evaluation sandbox.** `none of them are available here`
  describes the harness command allowlist; on a developer's machine `base64` and
  `python` work, so the claim is false everywhere else and the agent reads the
  whole rule as stale. Argue from what holds in both.
- **Required dispatch content goes in an explicit list.** Buried mid-paragraph it
  lands about half the time.

### Test placement rules

- **Framework test files live in `tests/skraft-framework/`** — never inside `plugins/`.
- **Evaluation/dashboard tooling tests live in `tests/dashboard/`** and import from `../../eng/...`.
- Naming convention:
  - Unit tests: `{module}.unit.test.mjs` (e.g. `skill-policy.unit.test.mjs`)
  - Acceptance tests: `{feature}.acceptance.test.mjs` (e.g. `skill-loading.acceptance.test.mjs`)
  - Integration/other: `{module}.test.mjs`
- `stryker.config.mjs` uses the glob `tests/skraft-framework/*.test.mjs` — it picks up all tests automatically. **Never replace this glob with an explicit list.**
- Import paths from `tests/skraft-framework/` into plugin source: `../../plugins/skraft-framework/src/...`

### Vally evaluation rules

- One eval spec per skill at `tests/skills/<skill>/eval.yaml`; `<skill>` MUST match the
  directory under `plugins/skraft-framework/skills/` — `eng/run-vally-evals.sh` resolves the skill from
  that path, and reports the eval as skipped when it does not.
- A prompt must **never name the skill** or copy its wording, and a rubric must judge the
  outcome, not the technique. Otherwise the evaluation measures nothing.
- **NEVER create tests for eval specs.** Do not add unit or acceptance tests that load,
  parse, snapshot, or assert an `eval.yaml` file, its prompts, tags, fixtures, graders,
  ordering, or scenario-specific behavior. Validate specs through Vally loading and live
  eval runs. Tests may cover reusable evaluation tooling, but must not mirror spec contents.
- Budget trials for **power, not for a floor**. The sign test needs at least 6 discordant
  pairs before any tally can reach `p <= 0.05`, so 5 trials — or a flawless 5W/0L sweep —
  is reported as inconclusive by design. Ties are common, so plan **12–15 trials** for a
  verdict you can defend, and buy that power up front: adding runs to an already-noisy
  comparison is the worst purchase in the protocol.
- Spend the budget on **runs, not on breadth**. `3 stimuli × 5 runs` and `5 stimuli × 3 runs`
  cost the same and only the first yields readable per-scenario cells. Each stimulus should
  force **one** decision through the narrowest task that exposes it — a paired run executes
  every trial twice plus judge work, and cost per trial is driven by how much work the prompt
  asks for, not by fixture size.
- Real-agent specs live under `tests/agents/<suite>/eval.yaml`. Their custom executor
  selects an allowlisted `.agent.md`; use Vally's typed trajectory events and built-in
  graders where available instead of duplicating event conversion or grading logic.
- Agent application fixtures live under `tests/agents/<suite>/fixtures/<state>/` beside
  their eval spec. Specs stage explicit files from a named state so local ignored build
  outputs cannot leak into prepared workspaces.
- `eng/run-vally-evals.sh` is the only eval entry point. Skill specs run baseline vs
  treatment; agent specs run once through their declared executor.
- `STIMULI=` on the runner narrows a run to named stimuli — the pilot signal check before
  funding a full paired arm. It derives the pilot from the frozen spec and writes to
  `eval-results-pilot/`, so a probe can never be published as a verdict. Never hand-edit a
  committed spec to make a cheaper run possible.
- `BASELINE_CACHE=1` on the runner reuses baseline records per `- name:` block, so only the
  stimuli you actually edited are re-run. **ALWAYS ASK THE HUMAN before using it, every time,
  and never enable it on your own initiative.** A cached arm is a frozen draw rather than a
  fresh sample — two archived baseline arms of the same spec, same model, twelve minutes
  apart, differ by 0.14 in contrast score — so it biases the paired tests in whichever
  direction that draw happened to land. It answers "did my edit move anything" in the local
  loop; it never produces a verdict. The runner refuses it under CI, and any result it
  touches carries `baselineProvenance.publishable: false`. Never publish, commit, or quote
  such a result as a measurement.
- Generated output (`artifacts/`, `eval-results/`, `eval-results-pilot/`, `dashboard-data/`,
  `docs/site/dashboard/data/`) is never committed. The local baseline cache
  (`eval-baseline-cache/`) is likewise disposable and gitignored.

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

