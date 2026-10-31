# AGENTS.md — skraft-plugin (V2)

This branch line builds skraft V2. `main` holds v1: never push,
merge or open a PR to `main` from V2 work. Each lot lands on `integration/v2-next` through its own
PR; one final PR `integration/v2-next` → `main` ships 2.0.0.

Sources of truth, in this order:

1. This file — engine, drivers, zero hooks, and the Copilot driver contract (rules below). The
   handbook page [Architecture](docs/site/en/explanation/architecture.md) explains them.
2. Epic [#211](https://github.com/SebastienDegodez/skraft-plugin/issues/211) and its lot issues
   #212–#223: scope and done criteria of each lot.

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

cli/                                 ← npm package @skraft/cli: the `skraft` command for humans. Holds no
                                       engine; finds the plugin a host installed (SKRAFT_PLUGIN_ROOT, then
                                       Copilot CLI, then Claude Code) and imports its drivers/cli/skraft.mjs.
                                       Own version, published by hand from main (cli-publish.yml); commits
                                       scoped `cli` never release the plugin. Agents keep the absolute path.

tests/
  skraft-framework/unit/<feature>/         ← engine use-case acceptance tests
  skraft-framework/integration/<feature>/  ← real adapters, CLI, drivers, architecture rules
  skill-scripts/<feature>/                 ← skill script tests and fixtures
  tooling/<feature>/                       ← repo tooling tests
  cli/<feature>/                           ← the `skraft` command (cli/), real processes on a temp HOME
  dashboard/  skraft-backlog/  site/       ← eval/dashboard tooling, backlog plugin, docs site
  skills/<skill>/eval.yaml                 ← Vally skill specs
  agents/<suite>/eval.yaml                 ← Vally real-agent specs and fixtures

eng/
  host-probe/      ← Copilot host probe: headless SDK host, no model call
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
  agent spawns another agent, with one exception: `brownfield-refactorer` (skraft-brownfield),
  run as a session's main agent, may dispatch `refactoring-worker`, and that worker dispatches no
  one.
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

## Copilot host driver rules

[Architecture](docs/site/en/explanation/architecture.md#the-copilot-driver-contract) explains them; these are the rules a
change to `drivers/copilot-workflow/` or `com.github.copilot/extensions/` must keep. Each is
load-bearing and easy to break: a change that "looks more correct" is presumed a regression until
the probe or a test says otherwise.

- **Measure host behaviour, never assume it.** A behaviour the driver relies on has a check in
  `eng/host-probe/copilot-probe.mjs` and a row in `docs/v2/host-verification.md` with the CLI
  version. A comment stating a host behaviour names the version it was measured on.
- **One file imports the SDK.** The extension entry hands `defineWorkflow`/`joinSession` to a
  tested `register`; each component in its own `try`; a refused join retried without the tool;
  failures through `session.log`. Never write to stdout (it is the JSON-RPC channel). Nothing
  starts at import.
- **The directory is live.** Read it from the `session.context_changed` tracker when a run starts
  and on each tool call; never capture `process.cwd()` at load.
- **Nothing throws on the run path.** Every failure is an outcome with `status`, `code` and a fixed
  `reason`; only a cancellation is rethrown.
- **Arguments are model-written.** Refuse unknown keys; never let an argument choose an
  executable, an agent or a model outside the workflow and `skraft-config.json`; never echo a
  refused value.
- **Messages are fixed by code.** No exception text or stderr in the journal, an outcome, a prompt
  or a tool result.
- **A human decision needs the host.** Under Copilot, record an answer only after
  `session.ui.confirm`/`select` returns it (literal `true` or an offered option); refuse without
  elicitation, in `autopilot`, or when the mode cannot be read; journal `by: 'host-confirmed'`.
  No agent, skill or prompt names `skraft_decide`.
- **Commands are bounded.** `signal`, `timeoutMs`, output cap, process group ended as a whole.
- **No pre-tool hook**, ever; a returning post-tool hook gives `additionalContext` only.
- **A check counts once seen failing**, and a report says what it examined.

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

## Engine core: outside-in TDD from the use case

Applies to every change in `engine/domain/` and `engine/application/`, including closing mutation
gaps. Follow the plugin's `outside-in-tdd` skill; these rules add what the engine needs.

- Enter through `application/` first. A use case (`createInit`, `createRunGate`,
  `createConfigureComponents`, `createDoctor`, `createRunPipeline`, `createObserve`…) is the only
  input boundary of a `tests/skraft-framework/unit/<feature>/` test; assert its returned outcome,
  the journal events and the files written. `domain/` is covered **through** these scenarios:
  never import a `domain/` module from a test, unless it is an extracted complex rule (tiers, a
  matrix of edge cases) already covered by an acceptance scenario.
- Red first, also when the code already exists: write or sharpen the scenario, apply the change it
  should catch to the production code by hand, see the scenario fail on a business assertion,
  restore the code, see it pass. A test that stays green against the broken code is not done.
- Before writing a scenario, sharpen an existing one in the same feature folder (more fields
  asserted, data with two elements instead of one, a hyphenated slug). A new test exists only for a
  behaviour no scenario shows. Name tests by behaviour, never by mutant or ticket.
- Every surviving or uncovered mutant in `domain/` or `application/` ends one of three ways, and
  the target is 100 %:
  1. **No behaviour asks for the code** → delete it (unreachable guard, a fallback the port
     contract already rules out, a field no caller reads).
  2. **A behaviour asks for it** → a use-case scenario shows that behaviour and kills the mutant.
  3. **The mutant changes nothing observable** → `// Stryker disable next-line <Mutator>: <reason>`
     on that line only.
- No code for a later lot. A phase, a field, a step kind or a default that only a future lot will
  read is written by that lot, with its scenario. Never exclude a mutant because "lot N will use it".
- Code reached only from a child process is invisible to Stryker: drive the CLI and the drivers in
  the test process (`runCli`, the driver factories); keep one test that starts the executable.
- Stryker needs the npm registry. Where it is unreachable, prove each kill by hand-applying the
  mutant; the local mutation run is the verdict.

## Mutation rules

- Config: `plugins/skraft-framework/engine/stryker.config.mjs`, incremental, run with
  `npm run mutation:engine` after `npm ci --prefix plugins/skraft-framework/engine`.
- It mutates all of `engine/` except `drivers/cli/skraft.mjs`. Never keep a hand-maintained
  `mutate` list. `thresholds.break` is 80; change thresholds only on explicit instruction.
- A pull request mutates only the engine lines it added or changed since its merge base with the
  branch it targets: `node eng/mutation-scope.mjs --base origin/<base> --run`
  (`npm run mutation:engine:changed` against `integration/v2-next`, uncommitted changes
  included; `node scripts/local-ci.mjs --mutation` runs the same). Mutation runs locally only:
  the CI job is switched off (`if: false`) because a runner is slower.
- Kill a surviving mutant with a sharper acceptance scenario, never with a test written for that
  mutant. Exclude an equivalent mutant only with its reason.

## Lint rules

- Config: `plugins/skraft-framework/engine/eslint.config.mjs`, run with `npm run lint:engine`
  after `npm ci --prefix plugins/skraft-framework/engine`. It lints all of `engine/` and blocks
  CI and the local CI.
- Limits, per function, for every function in `engine/`: at most 12 lines (blank lines and
  comments not counted), 12 statements, cyclomatic complexity 8, block depth 3. Change a limit
  only on explicit instruction.
- A nested function counts inside its parent. A factory (`createX = (deps) => Object.freeze({…})`)
  only delegates to module-level functions; a function never holds a long closure.
- Split along decisions: one level of abstraction per function, named by what it decides. Never
  pass a limit by packing logic onto one line, chaining ternaries or merging statements.
- No `eslint-disable` comment, anywhere in `engine/`.

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
- A model family is a tier (`economy` < `standard` < `frontier` < `premium`, the only rank; nothing in skraft assigns `premium` and the refuter's escalation stops at `frontier`), a role with a
  built-in tier (`reviewer`, `researcher`, `implementer`, `planner`) or a free family that
  declares its `tier`. The configuration chooses it: four layers merged as JSON Merge Patch
  (plugin defaults, `~/.skraft/config.json`, `skraft-config.json`, uncommitted
  `skraft-config.local.json`); `assign` picks each agent's family (by agent, then an ejected
  workflow's `model=` / `@<family>` / `refuter=`, then by type, then by default) and may add an
  effort per host; `models` gives each family, per host (`claude-code`, `copilot`), a model or a
  list and an effort (`low`…`max`). The engine journals the resolved assignment; the driver
  passes the host's model and effort at spawn, else none. Never write a model name in code,
  tooling or an argument (the evaluation pins in `eng/eval-models.json` excepted, see the Vally
  evaluation rules); the plugin defaults hold Claude Code aliases only. A Claude Code agent
  file names a Claude Code alias (`haiku`, `sonnet`, `opus`, `fable`) or `inherit`; a Copilot
  agent file names no model:
  `node scripts/agent-policy/resolve-model-bin.mjs --check --forbid-model` must pass.
- An agent lists its mandatory skills twice, in both trees: under top-level `skills:`, which the
  host loads into the agent at launch (Claude Code; under Copilot this is read in the CLI 1.0.78
  source, which parses `skills` and ignores `metadata`, and not yet measured in a session, nor
  in VS Code), and under `metadata.skills`, which the evaluation tooling reads.
  `node scripts/agent-policy/build-config-bin.mjs --preload --dir <agents dir>` requires the two
  lists to be equal. Never rely on the Copilot load until the host probe's `agent-skills-preload`
  check (`--agent-calls`) has measured it.
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

- One eval spec per skill at `tests/skills/<skill>/eval.yaml`; `<skill>` MUST match a skill
  directory under `plugins/<plugin>/skills/` — `eng/run-vally-evals.sh` resolves the skill from
  `plugins/*/skills/<skill>`, and reports the eval as skipped when none matches.
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
- Evaluation models are pinned, in one place: `eng/eval-models.json` maps each evaluation family
  to a versioned model, names the default family and pins the judge. Nothing else under `eng/`,
  `scripts/`, `.github/workflows/`, `tests/skills/` or `tests/agents/` names a versioned model: a
  spec's `defaults.model` names a family from that file (the runner refuses any other name), a
  workflow reads the file through `eng/resolve-eval-model.mjs`. Change a pin only on purpose and
  for every eval; the file is part of every eval fingerprint.
- A gh-aw workflow (`.github/workflows/*.md`) is no evaluation: its `model:` names a gh-aw family
  alias offered to the agentic-workflows integration (`sonnet`), never a versioned model; `mini`
  resolved to a model that integration refuses (#277).
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
npm run test:tooling           # repo tooling
npm run test:skill-scripts     # skill scripts (needs npm ci --prefix plugins/skraft-framework/engine)
npm run mutation:engine        # Stryker, incremental
npm run mutation:engine:changed  # Stryker on the engine lines changed since integration/v2-next
npm run lint:engine            # ESLint function-size and complexity limits on the engine
npm run skills:check && npm run plugin:check && npm run backlog:check
node scripts/agent-policy/resolve-model-bin.mjs --check --forbid-model
claude plugin validate plugins/skraft-framework                    # the Claude Code mod
node tests/skraft-framework/integration/claude-mod/run-plugin-test.mjs  # `claude plugin test` on a copy
node scripts/local-ci.mjs      # mirrors CI locally
npm run probe:copilot -- --report-issues   # Copilot host probe (local Copilot CLI, no model call); see eng/host-probe/README.md
```
