---
name: quality-gates-evidence-contract
description: Use when producing or verifying the structured evidence log that attests quality gates (tests, build, lint, no-mocks, commits, RED/GREEN integrity, frontend screenshots). Tech-agnostic schema. Loaded by software-engineer (writer) at COMMIT phase and by quality-gates-lens (reader) during review.
---

# Quality Gates Evidence Contract

A tech-agnostic schema that attests quality gates with **verdicts written by scripts and facts
read from Git**, never with prose.

## Why this exists

Truth #6 (HARNESSES BRIDGE): the LLM cannot prove a test passed by saying so.
So no agent ever writes a gate status: the stack adapter's scripts run each command and record
its exit code in the log, and `qg-verify`
(`node "<skill>/scripts/qg-verify/cli/qg-verify.mjs" --log <path>`, bundled in this skill;
`<skill>` is the folder holding this SKILL.md) derives everything else from Git — the commits
since the DELIVER base and every RED acceptance test — and judges the verdict. Nobody re-runs a
gate; the project's CI runs them again on the pull request.

## Where the artifacts live — never in Git

One directory per story, never shared with another story, **ignored by Git**. It holds the log
and, for a frontend story, its screenshots — nothing else:

```
.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/{story}/
├── qg-{story}.json      # the evidence log (this contract): verdicts only
└── screenshots/         # evidence.screenshots, frontend stories
```

The consumer project's `.gitignore` holds this line:

```gitignore
.copilot-tracking/skraft-plans/*/evidence/
```

Nothing under `evidence/` is ever committed: not the log, not a screenshot. No tool output,
exit-code or hash file is written either. `qg-verify` fails a v7 log whose evidence directory
holds a file Git tracks.

A screenshot `ref` is relative to the project's tracking directory
(`evidence/{date}/{story}/screenshots/home.png`). Tool run folders (Stryker HTML, TRX, logs)
never land here.

The test plan (`details/{date}/test-plan-{story}.md`, written by DISTILL) stays where it is: with
the screenshots, it is what the QA reads.

## Schema (`qg-{story}.json`)

The stack adapter's scripts write it — `capture.mjs` and the no-mocks scan for each gate,
`gate-log.mjs` for screenshots and `not_applicable` gates, or `qg-collect.mjs` for all of them on
.NET. Each write stamps `repo_root_rev` with `HEAD` and `produced_at` with the time.

```json
{
  "$schema": "quality-gates-evidence/v7",
  "story": "string — story identifier, from the file name qg-{story}.json",
  "produced_at": "ISO-8601 UTC timestamp",
  "producer": "software-engineer",
  "tech_adapter": "string — the quality-gates-<tech> skill whose scripts wrote it",
  "repo_root_rev": "string — git rev-parse HEAD (the last work commit)",
  "gates": [
    {
      "id": "test.acceptance",
      "label": "Acceptance test(s) pass",
      "status": "pass | fail | not_applicable",
      "command_executed": "the command the script ran",
      "summary": "last line of its output, e.g. Passed! - Failed: 0, Passed: 15",
      "metrics": { "tests_total": 15, "tests_passed": 15, "tests_failed": 0 }
    },
    {
      "id": "evidence.screenshots",
      "label": "Frontend screenshots captured",
      "status": "pass",
      "screenshots": [
        { "ref": "evidence/{date}/{story}/screenshots/home-rejected.png", "sha256": "hex sha256 of the PNG bytes" }
      ]
    }
  ]
}
```

`metrics` is optional (the .NET adapter reads it from the TRX report). A `not_applicable` gate
carries a `rationale` instead of a command.

## Gates (fixed identifiers, `type.description`)

The `id` field uses a fixed taxonomy. Tech adapters MAP their tools to these ids;
they do NOT invent new ones. Adding a gate id is a contract change (new schema version).

| id | label | what it attests | before v7 |
|----|-------|-----------------|-----------|
| `test.acceptance` | Acceptance test(s) pass | the BDD/acceptance scenario for the active story is green | G1 |
| `test.unit` | All unit tests pass | the full unit suite is green; on .NET it includes the architecture tests | G2 |
| `build.compile` | Build passes | compilation / static type-check succeeded | G3 |
| `build.lint` | Static analysis pass | linter / analyzer reported no blocking issue; carries the boundary rules of the stack (ESLint `boundaries/*`, Python `import-linter`) | G4 |
| `test.no-mocks-core` | No mocks in Domain/Application core | the adapter's scan of the Domain/Application projects and their unit tests found nothing | G7 |
| `evidence.screenshots` | Frontend screenshots captured | the story's frontend outcome is shown by at least one hashed screenshot; required for a frontend story | — |
| `commit.convention` | Conventional commit policy | *derived by `qg-verify`, never in the log*: every commit since the DELIVER base satisfies the shared policy below | G8 |
| `test.integrity` | No test tampering (RED→GREEN integrity) | *derived by `qg-verify`, never in the log*: every test file a `test` commit holds only grows afterwards | G9 |

Architecture, coverage and mutation are not pipeline gates. The project's CI runs them
(coverage with a minimal bar and no exclusion, mutation as its own step); the developer runs
`/skraft-mutation` by hand. A v7 log never carries `arch.boundaries`, `ci.coverage`,
`ci.mutation` nor any `G<N>` id: `qg-verify` reports an unknown id as `inconclusive`, and a
derived id (`commit.convention`, `test.integrity`) recorded in the log as `inconclusive` too.

The RED is DISTILL's `test` commit: every acceptance test, committed before DELIVER starts and
before the code that makes it pass. No RED run is captured, no snapshot is written, and the
producer lists no commit and no cycle: `qg-verify` reads them from Git.

A gate that is genuinely irrelevant for the story uses `status: "not_applicable"` and
MUST include a `rationale` field explaining why. `not_applicable` is **never** a substitute
for `fail` or for missing evidence.

## Frontend stories — screenshots are mandatory

A story is frontend when a commit since the DELIVER base touches at least one of:

- a `.feature` file holding a `@visual` scenario;
- a path under `tests/e2e/`;
- a `package.json` declaring `react` (dependencies, devDependencies or peerDependencies);
- a `playwright.config.*` file.

A frontend story records `evidence.screenshots` with `status: "pass"` and at least one
screenshot — `node "<adapter>/scripts/gate-log.mjs" --log "$EV/qg-{story}.json" --screenshot <png>`
copies each PNG into `evidence/{date}/{story}/screenshots/` and records its `ref` and the sha256
of its bytes. Any other story omits the gate or records it `not_applicable` with a rationale.

## Falsification surface (what qg-verify checks)

`qg-verify` takes the DELIVER base (`--base`, default: the one the pipeline recorded) and the
DISTILL base (`--red-base`, default: idem). The quality-gates lens reports its verdict and checks
only the commit policy it cannot (approved feature scope, `Refs`/`Closes` issue line).

| What | How it is falsified |
|------|---------------------|
| `repo_root_rev` | resolves, and is `HEAD` |
| evidence directory | no file under it is tracked by Git |
| `gates[].status` | written by a script from an exit code; `fail` fails the log |
| `gates[].metrics.tests_failed` | for `status: "pass"` MUST be `0` |
| `gates[].screenshots[]` | each file MUST exist; the sha256 of its bytes MUST equal the declared value |
| `commit.convention` | every commit of `base..repo_root_rev`, read from Git |
| `test.integrity` | the test files of the `test` commits since the DISTILL base are guarded: each later commit that touches one may only ADD lines (`git show` of its parent against `git show` of the commit), unless its message records `PLAN_DEVIATION:` |
| frontend detection | computed from the files of `base..repo_root_rev` at `repo_root_rev` |

A test file is a `.feature`, a file under a `test`, `tests`, `__tests__`, `spec`, `specs` or `e2e`
folder, or a file named as a test (`*.test.*`, `*.spec.*`, `*Tests.cs`, `test_*.py`, `*_test.py`).
The production stubs DISTILL commits with the RED are not guarded: the GREEN rewrites them.

## commit.convention — Full-message verification

Each commit's actual Git message: `type(feature): subject`, with the
approved feature scope and `Signed-off-by` trailer from `git commit -s`. For a
known issue, the final body line is `Refs: #N` for intermediate work or
`Closes #N` only when the whole issue is genuinely finished and all required
gates pass. Omit the issue line when unknown.

`qg-verify` checks the syntax and the sign-off; the lens checks the feature scope and the issue
line from the full messages. A verified violation is `fail`; a message nobody can read is
`inconclusive`.

## Producer rules (software-engineer side)

- Record the gates **once**, at the end of the story, after every work commit landed; each
  script stamps `repo_root_rev` with that last work commit, `HEAD`. Nothing is committed after it.
- The scripts refuse a log path Git does not ignore; append
  `.copilot-tracking/skraft-plans/*/evidence/` to the project's `.gitignore` in a work commit.
- Never write or edit the JSON by hand: every status comes from a script.
- Run `qg-verify` on the log before handing over; a `fail` or `inconclusive` is yours to fix.
- A failing gate is recorded `fail` and the log is still written. Do NOT delete the log to hide a
  failure — a missing log is `inconclusive` (NEEDS_REWORK), so hiding fails harder than disclosing.

## Verifier rules (qg-verify)

- `qg-verify` exits `0` pass, `1` fail, `2` inconclusive; the producer runs it on its own log
  before handing over, the reviewer runs it again, the lens reports its result.
- Any of the following → `verdict: inconclusive` (never `pass`):
  - the JSON is missing, or a required field is absent or malformed
  - a gate id is not a v7 gate (`GATE_UNKNOWN`), or a derived gate is recorded (`GATE_DERIVED`)
  - a screenshot does not exist, or its `sha256` does not match its bytes
  - `repo_root_rev` is not `HEAD` (the log describes an older tree)
  - no DELIVER base (`BASE_UNKNOWN`) or no DISTILL base (`RED_BASE_UNKNOWN`) is known
  - no `test` commit since the DISTILL base holds a test, while `test.acceptance` applies
  - a commit cannot be read
- Any of the following → `verdict: fail`:
  - a gate has `status: "fail"`
  - `metrics.tests_failed > 0` while `status: "pass"` (internal contradiction)
  - a commit since the DELIVER base violates the shared `commit.convention` policy
  - a guarded test file lost or changed a line without a `PLAN_DEVIATION:` in the commit
    (a `PLAN_DEVIATION` is reported as a `notice` for the lens to judge)
  - a file of the evidence directory is tracked by Git (`EVIDENCE_COMMITTED`)
  - a frontend story records no screenshot (`SCREENSHOTS_MISSING`)

## Schema versioning

`$schema: "quality-gates-evidence/v7"` is part of the contract. Bump the version
when adding/removing gates or fields; old logs MUST still be parseable with their
declared version.

- **v7** — gate ids become `type.description` (`test.acceptance`, `test.unit`, `build.compile`,
  `build.lint`, `test.no-mocks-core`; `commit.convention` and `test.integrity` derived from Git).
  Removes `G5` (architecture: covered by `test.unit` on .NET and `build.lint` on TypeScript and
  Python), `G6` (mutation: the project's CI, `/skraft-mutation` by hand) and `G11` (coverage: the
  project's CI). The log holds verdicts only: no `stdout_ref`, `stdout_sha256`, `stdout_tail`,
  `exit_code_ref`, `commits_covered` nor `test_integrity` — scripts write each status, and
  `qg-verify` reads the commits and the RED tests from Git. Adds `evidence.screenshots`, required
  for a frontend story. The log and the screenshots live in a Git-ignored directory;
  `repo_root_rev` is `HEAD`. v1–v6 logs still verify with their `G<N>` ids, captures, snapshots
  and evidence-only commit.
- **v6** — removes gate `G10` and the per-cycle fields `red_stdout_ref`, `red_stdout_sha256`,
  `red_exit_code_ref`: the `test` commit is the RED, so no RED run is captured. G6 may still be
  `not_run`. v2–v5 logs still verify their G10.
- **v5** — G6 is one global entry again: the developer's declared mutation commands, judged
  together against one bar. G6 alone may be `not_run`, with a rationale, when no command is
  declared. v4 logs still verify with their two scoped entries.
- **v4** — G6 is recorded once per mutation scope with a `scope` field (`core`, `boundary`);
  its runner reads the break threshold from the checked-in config, so no `--break-at` flag is
  expected in `command_executed`. Evidence lives in one directory per story.
  `repo_root_rev` may be the parent of the evidence-only commit.

- **v3** — adds gate `G11` (line coverage meets the bar) and restates `G6` as an exit-code attestation rather than a score comparison: the runner's `--break-at` decides, so a log no longer records a number a reader must judge. Removes the `depthTier` reference, which no longer exists.
- **v2** — adds gate `G10` (RED observed) and the three per-cycle fields `red_stdout_ref`, `red_stdout_sha256`, `red_exit_code_ref`; everything a `v1` log declares is unchanged.
