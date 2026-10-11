# AGENTS.md — skraft-plugin (V2)

This branch line builds skraft V2. `main` holds v1 and is the regression reference: never push,
merge or open a PR to `main` from V2 work. Each lot lands on `integration/v2-next` through its own
PR; one final PR `integration/v2-next` → `main` ships 2.0.0.

Sources of truth, in this order:

1. [`docs/v2/prd.md`](docs/v2/prd.md) — V2 plan (French, versioned copy of the living doc).
2. [ADR-001](docs/adr/adr-001-host-neutral-engine-with-drivers.md) — engine, drivers, zero hooks.
   V2 ADR numbering starts at 001; v1 ADRs stay on `main`.
3. Epic [#211](https://github.com/SebastienDegodez/skraft-plugin/issues/211) and its lot issues
   #212–#223: scope and done criteria of each lot.

`plugins/skraft-framework/README.md`, `docs/architecture.md` and `docs/site/**/hooks.md` still
describe v1 until they are rewritten; do not take them as V2 guidance.

## Repository map

```
plugins/
  skraft-framework/                  ← central plugin (same install identity as v1)
    engine/                          ← V2 engine: package.json, stryker.config.mjs, jsconfig.json
      domain/                        ← pure policies
      application/  application/ports/ ← use cases and port contracts (JSDoc typedefs)
      infrastructure/                ← adapters: files, git, processes
      drivers/copilot-workflow/      ← GitHub Copilot dynamic workflow + Canvas
      drivers/claude-mod/            ← Claude Code mod + panel
      drivers/copilot-sdk/           ← VS Code through the Copilot SDK
      drivers/cli/                   ← `skraft` CLI (skraft.mjs); VS Code agent-loop fallback
    com.anthropic.claude-code/agents/  com.github.copilot/agents/  ← the two agent trees
    skills/                          ← self-contained skills (scripts inside each skill)
    assets/                          ← shared templates
  skraft-backlog/                    ← backlog plugin; shares no runtime code with the core
  skraft-brownfield/                 ← lot 9; independent plugin, installed next to the core

tests/
  skraft-framework/unit/<feature>/         ← engine use-case acceptance tests
  skraft-framework/integration/<feature>/  ← real adapters, CLI, drivers, architecture rules
  skill-scripts/<feature>/                 ← skill script tests and fixtures
  tooling/<feature>/                       ← repo tooling tests
  regression/                              ← tests of eng/regression
  dashboard/  skraft-backlog/  site/       ← eval/dashboard tooling, backlog plugin, docs site
  skills/<skill>/eval.yaml                 ← Vally skill specs
  agents/<suite>/eval.yaml                 ← Vally real-agent specs and fixtures

eng/
  regression/      ← v1 (a `main` ref in a worktree) vs this branch on the same fixtures
  lib/             ← pure modules shared by repo tooling
  catalog/  vally-adapter/  vally-agent-executor/  dashboard/  run-vally-evals.sh
scripts/
  agent-policy/    ← dispatch-tree and model-policy checks for both agent trees
```

## Engine rules

- `domain/` imports only `domain/`. `application/` imports only `domain/` and `application/`.
  Neither uses `node:` modules, `process`, `child_process` or `$`. This is what lets the Claude
  Code mod module (no Node, no `import()`) and the Copilot extension import the same code.
- `infrastructure/` never imports a driver or a use case (ports allowed). A driver never imports
  another driver. Every engine file sits in one of the four layers.
- Drivers execute what the engine asks and are the only callers that spawn agents (depth 1). No
  agent spawns another agent.
- Checks live in the engine, not in hooks or prose: phase order, expected outputs, write scope
  (git diff per step), gates, review verdict, TDD red/green commits.
- V2 ships **no command hooks**. A hook comes back only if it protects an irreversible action the
  engine cannot detect afterwards, with a measured cost and a documented behaviour on Claude
  Code, Copilot CLI and VS Code. `hooks/hooks.json` may only declare the mod module.
- State lives in `.copilot-tracking/skraft-plans/<slug>/`; `events.jsonl` (hash-chained)
  replaces `state.json`; `.active-slug` is mandatory and never guessed.
- Developer configuration is `skraft-config.json` with components (root, stack, paths,
  commands, mocking, contractTesting). A command written by the developer always wins over a
  default. Quality thresholds are not configurable.
- The workflow is a DOT graph shipped in the plugin and copied into a repo with
  `skraft workflow eject`. DELIVER gates are `locked`; removing one needs `unlock="<reason>"`.

## Portability rules

Everything must run on Windows and macOS, under Claude Code, Copilot CLI and VS Code.

- Node code: `node:path` for paths, `spawnSync`/`spawn` with an argv array, never a shell string.
- Commands that an agent runs: no environment variable (`$SKRAFT_PLUGIN_ROOT` and the like), no
  heredoc, no pipe; data goes through files at paths the engine gives; the command form
  `node "<absolute path>" <subcommand> --option value` works in sh and PowerShell.
- A skill carries every script it runs, even if that duplicates another skill's script; skills
  reference each other by name, never by path. `npm run skills:sync` / `skills:check` maintain
  declared copies.
- A skill script called often (per tool call or per TDD cycle) is written as `.sh` + `.ps1`
  twins tested by one contract suite on the three OS; a script called once per story may stay in
  Node.

## Testing rules

Apply the `clean-architecture-testing` and `outside-in-tdd` skills to the engine itself.

- Test files never live inside `plugins/`; the mod's `*.test.ts` live in
  `tests/skraft-framework/integration/claude-mod/plugin-test/` and run on a temporary copy. Feature folders are named by behaviour
  (`pipeline-flow`, `write-scope`, `review`, `gates`…), never by ticket. Name files
  `<behaviour>.test.mjs`.
- `tests/skraft-framework/unit/<feature>/`: enter through a use case; assert the returned step,
  the events and the files. Hand-written InMemory doubles (run store, workspace, scripted
  command runner, fixed clock) with real domain objects; **no mock library**. The LLM is never
  called: agent results are files written by the test. A domain test only for an extracted
  complex rule already covered by an acceptance test.
- `tests/skraft-framework/integration/<feature>/`: real adapters (temp dirs, real git, real
  processes), the CLI end to end, drivers on a simulated host, architecture rules. No doubles.
  Passes on Windows, macOS and Linux.
- Work outside-in: approved scenarios become the first tests at the use-case level; one red test
  at a time, red on a business assertion (a compile or import error is not red). A red commit
  is allowed on a lot branch. After green, check the wiring (`git diff`) and refactor without
  touching the test.
- Import path from a test feature folder into the engine:
  `../../../../plugins/skraft-framework/engine/...`

## Mutation rules

- Config: `plugins/skraft-framework/engine/stryker.config.mjs`, incremental, run with
  `npm run mutation:engine` after `npm ci --prefix plugins/skraft-framework/engine`.
- It mutates all of `engine/` except `drivers/cli/skraft.mjs`. Never keep a hand-maintained
  `mutate` list. `thresholds.break` is 80; change thresholds only on explicit instruction.
- Kill a surviving mutant with a sharper acceptance scenario, never with a test written for that
  mutant. Exclude an equivalent mutant only with its reason.

## Regression rules

- `eng/regression/` compares a v1 run (from a worktree on a `main` ref) with a V2 run on the same
  fixtures: phases reached, verdicts, gates, artefacts, duration, cost, retries.
- A lot PR that degrades a criterion without a waiver (`regression-waivers.json`, one criterion
  on one fixture, with a reason) does not merge.
- V2 events must follow the `events.jsonl` contract written in `eng/regression/README.md`.

## Agent descriptor rules

Descriptors are prompts an agent pays for on every run, not documentation.

- Edit agents in either of the two flat trees, then `npm run plugin:sync` and
  `npm run plugin:check` ([scripts/project-plugin-adapters.mjs](scripts/project-plugin-adapters.mjs)).
  Sync body and description only; preserve every client-specific header. Keep stable basename
  IDs and per-side shared fields in `.agent-sync.json`. Never introduce a third descriptor tree.
  A new agent needs both client versions authored explicitly; never inherit tools blindly.
  Commit both trees and the baseline together; marketplace Git installs do not build.
- Register every agent, internal lenses included, in
  [plugins/skraft-framework/.claude-plugin/plugin.json](plugins/skraft-framework/.claude-plugin/plugin.json).
  Keep the root `plugin.json` on the canonical schema with no root `agents` list. Preserve
  `user-invocable: false` on internal agents.
- The model is fixed in each agent file; Copilot and VS Code need the exact model name.
  `node scripts/agent-policy/resolve-model-bin.mjs --check` must pass.
- **Write for the agent, never for a human reader.** Every sentence carries a decision the agent
  has to make. No prose explaining why a rule exists; the reasoning belongs in the commit message.
- **Do not repeat a check the engine performs** (order, inputs, outputs, commit convention,
  gates, verdict). A check stays in prose only if nothing else performs it and only that agent
  can avoid the error.
- **Put a rule's scope inside the rule**, not in a paragraph after it. A prohibition scoped too
  narrowly is an escape hatch.
- **Never argue from the evaluation sandbox.** Argue from what holds on a developer machine too.
- **Required dispatch content goes in an explicit list.** Buried mid-paragraph it lands about
  half the time.
- skraft does Clean Architecture: no "hexagonal" and no port/adapter vocabulary in agent or
  skill prose.

## Skill rules

- A language skill (e.g. `clean-architecture-java`) holds the strict minimum, never a copy of
  another language's skill. Check every rule before reducing a skill; then reduce.
- Every skill change is judged with Vally on Sonnet (rules below).

## Vally evaluation rules

- One eval spec per skill at `tests/skills/<skill>/eval.yaml`; `<skill>` MUST match the
  directory under `plugins/skraft-framework/skills/` — `eng/run-vally-evals.sh` resolves the skill
  from that path, and reports the eval as skipped when it does not.
- A prompt must **never name the skill** or copy its wording, and a rubric must judge the
  outcome, not the technique.
- **NEVER create tests for eval specs.** Do not add tests that load, parse, snapshot or assert an
  `eval.yaml`, its prompts, tags, fixtures, graders, ordering or scenario-specific behaviour.
  Validate specs through Vally loading and live eval runs. Tests may cover reusable evaluation
  tooling.
- Budget trials for **power, not for a floor**. The sign test needs at least 6 discordant pairs
  before any tally can reach `p <= 0.05`; plan **12–15 trials** for a verdict you can defend, and
  buy that power up front.
- Spend the budget on **runs, not on breadth**: `3 stimuli × 5 runs` beats `5 stimuli × 3 runs`.
  Each stimulus forces **one** decision through the narrowest task that exposes it.
- Real-agent specs live under `tests/agents/<suite>/eval.yaml`; their custom executor selects an
  allowlisted `.agent.md`. Use Vally's typed trajectory events and built-in graders.
- Agent fixtures live under `tests/agents/<suite>/fixtures/<state>/`; specs stage explicit files
  from a named state.
- `eng/run-vally-evals.sh` is the only eval entry point.
- `STIMULI=` narrows a run to named stimuli and writes to `eval-results-pilot/`; a pilot is never
  a verdict. Never hand-edit a committed spec to make a cheaper run possible.
- `BASELINE_CACHE=1` reuses baseline records. **ALWAYS ASK THE HUMAN before using it, every
  time, and never enable it on your own initiative.** A cached arm is a frozen draw that biases
  the paired tests; its results carry `baselineProvenance.publishable: false` and are never
  published, committed or quoted as a measurement.
- Generated output (`artifacts/`, `eval-results/`, `eval-results-pilot/`, `dashboard-data/`,
  `docs/site/dashboard/data/`, `eval-baseline-cache/`) is never committed.

## Git rules

- Move files with `git mv`; keep a symlink at the old location when something outside the repo
  may still point there.
- Conventional commit titles. Lot PRs reference their issue (`Refs #212`) without closing it;
  only the final PR to `main` closes issues.

## gh-aw workflow rules

- Never hand-compute `frontmatter_hash` in `.github/workflows/*.lock.yml`. Run
  `gh aw compile <workflow-name>` and diff the result; install it with
  `gh extension install github/gh-aw` if missing.

## Tool rules

- Read and search files with the dedicated view/grep/glob tools, not `cat`/`head`/`tail`/`find`.
  Reserve the shell for git, tests and builds. Read large files by range.
- When `graphify-out/graph.json` exists, start codebase questions with `graphify query`,
  `graphify path` or `graphify explain`; run `graphify update .` after modifying code. On
  `/graphify`, invoke the `graphify` skill first.

## Commands

```bash
npm run test:engine            # engine unit + integration
npm run test:regression        # regression harness
npm run test:tooling           # repo tooling
npm run test:skill-scripts     # skill scripts (needs npm ci --prefix plugins/skraft-framework/engine)
npm run mutation:engine        # Stryker, incremental
npm run skills:check && npm run plugin:check && npm run backlog:check
node scripts/agent-policy/resolve-model-bin.mjs --check
claude plugin validate plugins/skraft-framework                    # the Claude Code mod
node tests/skraft-framework/integration/claude-mod/run-plugin-test.mjs  # `claude plugin test` on a copy
node scripts/local-ci.mjs      # mirrors CI locally
```
