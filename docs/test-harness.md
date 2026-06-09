# skraft-test-harness

> Evaluate Copilot SDK agents and skills against declarative YAML scenarios.

## Overview

`skraft-test-harness` loads scenario suites defined in `eval.yaml` files, runs the target agent twice per scenario — once without the skill (baseline) and once with the skill — then judges which response is better and emits structured reports. The harness is designed to detect regression (skill hurts quality) and overfitting (skill merely echoes assertion keywords) via the `OverfittingJudge`.

## Quick Start

### Prerequisites

- .NET 10 SDK
- `GITHUB_TOKEN` for live runs (optional — `--mock` works offline)

### Build

```bash
dotnet build tools/skraft-test-harness
```

### Run (mock mode)

```bash
dotnet run --project tools/skraft-test-harness/src/SkraftTestHarness.Cli -- \
  evaluate --skill <skill-id> --tests-dir tests/skraft-plugin/<agent-id> --mock
```

### Run (live — requires GITHUB_TOKEN)

> **Note:** Live agent integration is not yet wired. The CLI will reject a run without `--mock` and return exit code `2`. This section documents the intended interface.

```bash
dotnet run --project tools/skraft-test-harness/src/SkraftTestHarness.Cli -- \
  evaluate --skill <skill-id> --tests-dir tests/skraft-plugin/<agent-id>
```

### Consolidate reports

```bash
dotnet run --project tools/skraft-test-harness/src/SkraftTestHarness.Cli -- \
  consolidate --results-dir <path-to-json-reports>
```

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

See [`tests/skraft-plugin/software-engineer-agent/eval.yaml`](../tests/skraft-plugin/software-engineer-agent/eval.yaml) for a full suite covering outside-in TDD, Clean Architecture vocabulary, and Object Calisthenics.

---

## CLI Reference

### evaluate

Loads an `eval.yaml`, runs each scenario through the agent pipeline, judges the outputs, and optionally writes a JSON report.

| Option | Required | Description |
|---|---|---|
| `--skill <id>` | ✅ | Identifier of the skill being evaluated (e.g. `outside-in-tdd`). Matches the skill's `name:` frontmatter. |
| `--tests-dir <path>` | ✅ | Directory containing `eval.yaml`. |
| `--mock` | — | Replace the LLM agent and judge with deterministic in-memory stubs. Required until live mode is wired. |
| `--report-dir <path>` | — | Directory where the JSON `SkillVerdict` report is written. Omit to suppress file output. |

**Exit codes:** `0` = success, `2` = invoked without `--mock` (live mode not yet available).

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
│    IClock        — current UTC time                 │
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
│    CopilotSdkAgentRunner — real Copilot SDK         │
│    OverfittingJudge — keyword-overfitting heuristic │
│    YamlEvalLoader — reads eval.yaml via YamlDotNet  │
│    JsonReporter / MarkdownReporter / JUnitReporter  │
│    JsonVerdictLoader — reads saved JSON reports     │
│    SystemClock — wraps DateTimeOffset.UtcNow        │
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

### TDD Convention

The project follows a strict red → green commit cycle with conventional commit prefixes:

| Phase | Prefix | Example |
|---|---|---|
| Red (failing test) | `test(harness):` | `test(harness): assert OverfittingJudge detects keyword stuffing` |
| Green (implementation) | `feat(harness):` | `feat(harness): implement OverfittingJudge keyword-stuffing detection` |

Never commit a green test and its implementation in the same commit.
