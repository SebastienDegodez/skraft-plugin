# skraft-test-harness

> Evaluate skraft agents and skills against declarative YAML scenarios, driving the **real GitHub Copilot CLI**.

## Overview

`skraft-test-harness` loads scenario suites defined in `eval.yaml` files, runs the target agent twice per scenario — once without the skill (baseline) and once with the skill — then judges which response is better and emits structured reports. The harness is designed to detect regression (skill hurts quality) and overfitting (skill merely echoes assertion keywords) via the `OverfittingJudge`.

In **real mode** (the default), the harness drives the actual `copilot` CLI non-interactively (`copilot -p … --output-format json`) through the `CopilotCliAgentRunner`, parses the JSONL transcript for the assistant output and the tools the agent invoked, and loads the skraft agent under test via `--plugin-dir`/`--agent`. In **mock mode** (`--mock`) the runner and judge are deterministic in-memory stubs, so the full pipeline can be exercised offline.

## Quick Start

### Prerequisites

- .NET 10 SDK
- The [GitHub Copilot CLI](https://github.com/github/copilot-cli) (`copilot`) installed, authenticated, and on `PATH` — required for real runs (`--mock` works offline without it)

### Build

```bash
dotnet build tools/skraft-test-harness
```

### Run (mock mode)

```bash
dotnet run --project tools/skraft-test-harness/src/SkraftTestHarness.Cli -- \
  evaluate --skill <skill-id> --tests-dir tests/skraft-plugin/<agent-id> --mock
```

### Run (real mode — requires the `copilot` CLI)

Real mode is the default. To evaluate a **workflow agent**, point the harness at the skraft plugin and the namespaced agent id:

```bash
dotnet run --project tools/skraft-test-harness/src/SkraftTestHarness.Cli -- \
  evaluate --skill skraft-orchestrator \
  --tests-dir tests/skraft-plugin/pipeline/01-DISCOVER \
  --plugin-dir plugins --agent skraft:skraft-orchestrator \
  --report-dir ./eval-reports
```

The baseline run loads no skill (`--no-custom-instructions`); the with-skill run loads the plugin and custom agent. See [Testing the workflow agents](#testing-the-workflow-agents-real-mode) below.

### Consolidate reports

```bash
dotnet run --project tools/skraft-test-harness/src/SkraftTestHarness.Cli -- \
  consolidate --results-dir <path-to-json-reports>
```

---

## Testing the workflow agents (real mode)

The skraft SDLC workflow is a set of Copilot agents under `plugins/skraft-framework/agents/*.agent.md` (e.g. `software-engineer`, `solution-architect`, `acceptance-designer`, `backlog-planner`). The harness regression-tests each one by replaying behavioural `eval.yaml` scenarios against the **real agent** and asserting on its output.

### Plugin manifest

For `copilot --plugin-dir plugins` to expose the agents, the `plugins/` directory must contain a Copilot plugin manifest at [`plugins/skraft-framework/.claude-plugin/plugin.json`](../plugins/skraft-framework/.claude-plugin/plugin.json). With it, every agent is registered under the `skraft:` namespace:

```text
skraft:software-engineer, skraft:solution-architect, skraft:acceptance-designer, …
```

Enumerate them with a throwaway bad agent id:

```bash
copilot -p hi --plugin-dir plugins --agent __list__ --output-format json --log-level error
# → No such agent: __list__, available: skraft:software-engineer, skraft:solution-architect, …
```

### Run a suite against the real agent

```bash
dotnet run --project tools/skraft-test-harness/src/SkraftTestHarness.Cli -- \
  evaluate --skill skraft-orchestrator \
  --tests-dir tests/skraft-plugin/pipeline/03-DESIGN \
  --plugin-dir plugins --agent skraft:skraft-orchestrator \
  --report-dir ./eval-reports
# → SkillVerdict(skill=skraft-orchestrator, scenarios=1, winner: with-skill)
```

Validated suites live under `tests/skraft-plugin/pipeline/<NN-PHASE>/eval.yaml`
(`01-DISCOVER` … `05-DELIVER`).

---

## eval.yaml Schema

Each `eval.yaml` file lives inside a test directory (e.g. `tests/skraft-plugin/<agent-id>/eval.yaml`) and contains one or more named scenarios. Each scenario has a `prompt` sent to the agent and a list of `assertions` that are evaluated against the agent's output.

```yaml
scenarios:
  - name: "Descriptive scenario name"       # required – unique human-readable label
    prompt: "User turn sent to the agent."  # required – the exact user message

    assertions:

      # output_contains — passes when the literal string is present in the output
      - output_contains: "some expected phrase"

      # output_not_contains — passes when the literal string is absent from the output
      - output_not_contains: "phrase that must not appear"

      # output_matches — passes when the output matches the .NET regex pattern
      - output_matches: "(?i)outside[- ]in"

      # output_not_matches — passes when the output does NOT match the regex
      - output_not_matches: "(?i)sure,?\\s+let'?s\\s+skip"
```

**Rules:**
- Every assertion must have **exactly one key**.
- A scenario must declare **at least one** assertion.
- `output_matches` / `output_not_matches` values are compiled as .NET `Regex` patterns (case-sensitive by default; use `(?i)` for case-insensitive).
- Unknown keys cause an error at load time.

**Planned (not yet in YAML loader):** `expect_tools`, `reject_tools` (domain types exist), `file_exists`, `additional_required_skills`.

### Real-world example

See [`tests/skraft-plugin/pipeline/05-DELIVER/eval.yaml`](../tests/skraft-plugin/pipeline/05-DELIVER/eval.yaml) for a full suite that drives the orchestrator through the DELIVER phase and asserts the produced feature code.

---

## CLI Reference

### evaluate

Loads an `eval.yaml`, runs each scenario through the agent pipeline, judges the outputs, and optionally writes a JSON report.

| Option | Required | Description |
|---|---|---|
| `--skill <id>` | ✅ | Identifier of the skill being evaluated (e.g. `software-engineer`). Used as the report label. |
| `--tests-dir <path>` | ✅ | Directory containing `eval.yaml`. |
| `--mock` | — | Replace the agent and judge with deterministic in-memory stubs (offline, no `copilot` call). |
| `--report-dir <path>` | — | Directory where the JSON `SkillVerdict` report is written. Omit to suppress file output. |
| `--plugin-dir <path>` | — | Plugin directory loaded for the with-skill run (real mode). Use `plugins` to load the skraft agents. |
| `--agent <id>` | — | Namespaced custom agent loaded for the with-skill run (real mode), e.g. `skraft:software-engineer`. |
| `--model <id>` | — | Pin the model the Copilot CLI uses (real mode). |
| `--working-dir <path>` | — | Working directory the Copilot CLI runs in (real mode). |
| `--copilot-exe <path>` | — | Path or name of the `copilot` executable (real mode). Defaults to `copilot`. |

**Exit codes:** `0` = success, `1` = evaluation failed (e.g. the `copilot` executable could not be started — the error is printed as `evaluation failed: <reason>`).

### consolidate

Reads all JSON `SkillVerdict` report files from a directory, aggregates them into an `AggregateReport`, and prints a summary to stdout.

| Option | Required | Description |
|---|---|---|
| `--results-dir <path>` | ✅ | Directory containing JSON report files produced by `evaluate --report-dir`. |

**Exit codes:** `0` = success, `1` = no report files found.

---

## Reports

Three `IReporter` implementations are available in Infrastructure. The `evaluate` command currently wires `JsonReporter` via `--report-dir`; Markdown and JUnit reporters are implemented but not yet exposed as CLI flags.

| Format | File name pattern | How to enable |
|---|---|---|
| **JSON** | `<skill-id>-<UTC-timestamp>.json` | Pass `--report-dir <path>` to `evaluate` |
| **Markdown** | `<skill-id>-<UTC-timestamp>.md` | Planned: `--report-format markdown` |
| **JUnit XML** | `<skill-id>-<UTC-timestamp>.xml` | Planned: `--report-format junit` |

The JSON payload shape:

```json
{
  "skill": "outside-in-tdd",
  "scenarios": [
    { "name": "Routes new feature work…", "winner": "WithSkill", "reason": "length-based heuristic" }
  ]
}
```

The JUnit reporter maps `Baseline` winners to `<failure>` elements so CI pipelines can fail on skill regressions.

---

## Architecture

The harness follows Clean Architecture. Inner layers (Domain, Application) have no I/O dependencies; only Infrastructure and CLI layers touch the file system, network, and YAML parsing.

```
┌─────────────────────────────────────────────────────┐
│  CLI  (SkraftTestHarness.Cli)                       │
│  Parses args, wires composition root, calls         │
│  Application handlers                               │
└───────────────────┬─────────────────────────────────┘
                    │ depends on
┌───────────────────▼─────────────────────────────────┐
│  Application  (SkraftTestHarness.Application)       │
│  EvaluateSkillHandler, ConsolidateResultsHandler    │
│  Gateway interfaces (ports):                        │
│    IAgentRunner  — run the agent for a scenario     │
│    IJudge        — pairwise compare outputs         │
│    IScenarioLoader — load eval.yaml → Scenarios     │
│    IWorkspaceProbe — check files in workspace       │
│    IReporter     — emit SkillVerdict                │
│    IVerdictLoader — load saved SkillVerdicts        │
│    (time is provided via System.TimeProvider)       │
└───────────────────┬─────────────────────────────────┘
                    │ depends on
┌───────────────────▼─────────────────────────────────┐
│  Domain  (SkraftTestHarness.Domain)                 │
│  Scenario, Assertions, SkillVerdict, AggregateReport│
│  Assertion sub-types: OutputContains, OutputMatches │
│    OutputNotContains, OutputNotMatches,             │
│    ExpectTools, RejectTools, FileExists             │
│  OverfittingScore, ImprovementScoreCalculator       │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Infrastructure  (SkraftTestHarness.Infrastructure) │
│  Adapters implementing gateway interfaces:          │
│    CopilotCliAgentRunner — drives the real copilot  │
│      CLI (copilot -p … --output-format json)        │
│    CopilotCliTranscript — parses the JSONL stream   │
│    ProcessCopilotCliInvoker — shells out to copilot │
│    CopilotSdkAgentRunner — GitHub Models API runner │
│    OverfittingJudge — keyword-overfitting heuristic │
│    YamlEvalLoader — reads eval.yaml via YamlDotNet  │
│    JsonReporter / MarkdownReporter / JUnitReporter  │
│    JsonVerdictLoader — reads saved JSON reports     │
│    MockAgentRunner / MockJudge / MockReporter       │
└─────────────────────────────────────────────────────┘
```

Dependency rule: arrows point inward only. Domain has no references to Application or Infrastructure.

---

## Adding a new eval.yaml

1. **Create the directory** for the agent under test:
   ```bash
   mkdir -p tests/skraft-plugin/<agent-id>
   ```

2. **Create `eval.yaml`** with at least one scenario:
   ```yaml
   scenarios:
     - name: "Smoke test"
       prompt: "What is your purpose?"
       assertions:
         - output_contains: "help"
   ```

3. **Validate the schema** by running in mock mode:
   ```bash
   dotnet run --project tools/skraft-test-harness/src/SkraftTestHarness.Cli -- \
     evaluate --skill my-skill --tests-dir tests/skraft-plugin/<agent-id> --mock
   ```
   A load-time error will be printed if any scenario is malformed.

4. **Commit** the new file.

---

## Development

### Tests

Run from the repo root:

```bash
# Build (quiet)
dotnet build tools/skraft-test-harness -v quiet

# Unit tests
dotnet run --project tools/skraft-test-harness/tests/SkraftTestHarness.UnitTest --no-build

# Integration tests (architecture rules + CLI end-to-end + reporter I/O)
dotnet run --project tools/skraft-test-harness/tests/SkraftTestHarness.IntegrationTest --no-build
```

### Live integration tests (opt-in)

The integration suite includes live tests that drive the **real** `copilot`
CLI (the `CopilotCliAgentRunner*LiveTests` and `EvaluateRealEndToEndTests`).
They are skipped by default and only run when `SKRAFT_COPILOT_LIVE=1` is set
(so CI never burns model quota), with `copilot` installed and authenticated:

```bash
SKRAFT_COPILOT_LIVE=1 \
  dotnet run --project tools/skraft-test-harness/tests/SkraftTestHarness.IntegrationTest --no-build
```

### TDD Convention

The project follows a strict red → green commit cycle with conventional commit prefixes:

| Phase | Prefix | Example |
|---|---|---|
| Red (failing test) | `test(harness):` | `test(harness): assert OverfittingJudge detects keyword stuffing` |
| Green (implementation) | `feat(harness):` | `feat(harness): implement OverfittingJudge keyword-stuffing detection` |

Never commit a green test and its implementation in the same commit.
