---
name: quality-gates-evidence-contract
description: Use when producing or verifying the structured evidence log that attests quality gates (tests, build, lint, no-mocks, commits, RED/GREEN integrity, frontend screenshots). Tech-agnostic schema. Loaded by software-engineer (writer) at COMMIT phase and by quality-gates-lens (reader) during review.
---

# Quality Gates Evidence Contract

A tech-agnostic schema that attests quality gates as **falsifiable references**, not as prose.

## Why this exists

Truth #6 (HARNESSES BRIDGE): the LLM cannot prove a test passed by saying so.
The producer (software-engineer) MUST cite **substrate the verifier can re-resolve**:
git SHAs, test files at given revisions, hashed tool outputs deposited on disk.
`qg-verify` (`node "<skill>/scripts/qg-verify/cli/qg-verify.mjs" --log <path>`, bundled in this skill; `<skill>` is the folder holding this SKILL.md) re-resolves every
claim against the files and the Git tree and derives the verdict; nobody re-runs a gate.

## Where the artifacts live — never in Git

One directory per story, never shared with another story, **ignored by Git**:

```
.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/{story}/
├── qg-{story}.json                       # the evidence log (this contract)
├── qg-tests.stdout / .exit / .stdout.sha256
├── qg-build.stdout / .exit / .stdout.sha256
├── qg-lint.*                             # when build.lint runs its own command
├── qg-mocks.*                            # test.no-mocks-core scan output — empty on pass
└── screenshots/                          # evidence.screenshots, frontend stories
```

The consumer project's `.gitignore` holds this line:

```gitignore
.copilot-tracking/skraft-plans/*/evidence/
```

Nothing under `evidence/` is ever committed: not the log, not a capture, not a screenshot.
`qg-verify` fails a v7 log whose evidence directory holds a file Git tracks.

References inside the log are relative to the project's tracking directory
(`evidence/{date}/{story}/qg-tests.stdout`). Tool run folders (Stryker HTML, logs) never land here.

The producer writes captures with the stack adapter's `capture.mjs`, never by
transcribing tool output into the JSON manually. The lens reads them in read-only mode.

## Schema (`qg-{story}.json`)

```json
{
  "$schema": "quality-gates-evidence/v7",
  "story": "string — story identifier (e.g. eligibilite-trottinette)",
  "produced_at": "ISO-8601 UTC timestamp",
  "producer": "software-engineer",
  "tech_adapter": "string — name of the quality-gates-<tech> skill loaded (e.g. quality-gates-dotnet)",
  "repo_root_rev": "string — git rev-parse HEAD after the last work commit (HEAD itself)",

  "commits_covered": [
    {
      "sha": "full git sha",
      "subject": "conventional commit subject line",
      "files_changed": ["relative/path/file.ext", "..."]
    }
  ],

  "gates": [
    {
      "id": "test.acceptance",
      "label": "Acceptance test(s) pass",
      "status": "pass | fail | not_applicable",
      "command_executed": "verbatim shell command string",
      "exit_code_ref": "evidence/{date}/{story}/qg-tests.exit",
      "stdout_ref": "evidence/{date}/{story}/qg-tests.stdout",
      "stdout_sha256": "hex sha256 of the stdout file",
      "stdout_tail": "last ~40 lines of stdout, verbatim",
      "metrics": {
        "tests_total": 0,
        "tests_passed": 0,
        "tests_failed": 0
      }
    },
    {
      "id": "evidence.screenshots",
      "label": "Frontend screenshots captured",
      "status": "pass",
      "screenshots": [
        { "ref": "evidence/{date}/{story}/screenshots/home-rejected.png", "sha256": "hex sha256 of the PNG bytes" }
      ]
    }
  ],

  "test_integrity": {
    "cycles": [
      {
        "cycle": 1,
        "behavior": "scenario title",
        "test_files": ["relative/path/SomeAcceptanceTests.ext"],
        "red_commit": "sha of the test commit that holds the scenario's acceptance test, RED",
        "green_commit": "sha of the scenario's green commit that makes it pass"
      }
    ]
  }
}
```

## Gates (fixed identifiers, `type.description`)

The `id` field uses a fixed taxonomy. Tech adapters MAP their tools to these ids;
they do NOT invent new ones. Adding a gate id is a contract change (new schema version).

| id | label | what it attests | before v7 |
|----|-------|-----------------|-----------|
| `test.acceptance` | Acceptance test(s) pass | the BDD/acceptance scenario for the active story is green | G1 |
| `test.unit` | All unit tests pass | the full unit suite is green; on .NET it includes the architecture tests | G2 |
| `build.compile` | Build passes | compilation / static type-check succeeded | G3 |
| `build.lint` | Static analysis pass | linter / analyzer reported no blocking issue; carries the boundary rules of the stack (ESLint `boundaries/*`, Python `import-linter`) | G4 |
| `test.no-mocks-core` | No mocks in Domain/Application core | the adapter's scan of the Domain/Application projects and their unit tests printed nothing | G7 |
| `commit.convention` | Conventional commit policy | each exact covered commit's full Git message satisfies feature scope, optional issue reference and sign-off under the shared policy below | G8 |
| `test.integrity` | No test tampering (RED→GREEN integrity) | for every cycle, each test file changed only by ADDITION between its RED and GREEN commits | G9 |
| `evidence.screenshots` | Frontend screenshots captured | the story's frontend outcome is shown by at least one hashed screenshot; required for a frontend story | — |

Architecture, coverage and mutation are not pipeline gates. The project's CI runs them
(coverage with a minimal bar and no exclusion, mutation as its own step); the developer runs
`/skraft-mutation` by hand. A v7 log never carries `arch.boundaries`, `ci.coverage`,
`ci.mutation` nor any `G<N>` id: `qg-verify` reports an unknown id as `inconclusive`.

The RED of a scenario is its `test` commit: the acceptance test, committed
before the code that makes it pass. No RED run is captured, no snapshot is written.

A cycle is one scenario of the story, numbered by its rank in the implementation plan: its
acceptance test files at the `test` commit that holds it RED (DISTILL's or the engineer's for
scenario 1) and at the green commit that makes it pass. The inner
unit-test cycles of a scenario are not committed and get no cycle entry; their tests land in the
scenario's green commit.

A gate that is genuinely irrelevant for the story uses `status: "not_applicable"` and
MUST include a `rationale` field explaining why. `not_applicable` is **never** a substitute
for `fail` or for missing evidence.

## Frontend stories — screenshots are mandatory

A story is frontend when its covered commits touch at least one of:

- a `.feature` file holding a `@visual` scenario;
- a path under `tests/e2e/`;
- a `package.json` declaring `react` (dependencies, devDependencies or peerDependencies);
- a `playwright.config.*` file.

A frontend story records `evidence.screenshots` with `status: "pass"` and at least one
screenshot: the PNG copied into `evidence/{date}/{story}/screenshots/`, its `ref` and the
sha256 of its bytes. Any other story omits the gate or records it `not_applicable` with a rationale.

## Falsification surface (what qg-verify checks)

`qg-verify` resolves every row below against the files and the Git tree; the
quality-gates lens reports its verdict and checks only the commit policy it cannot
(approved feature scope, `Refs`/`Closes` issue line).

| Field | How it is falsified |
|-------|---------------------|
| `repo_root_rev` | resolves, and is `HEAD` |
| evidence directory | no file under it is tracked by Git |
| covered range | with the DELIVER base, every commit in `base..repo_root_rev` is listed in `commits_covered` |
| `commits_covered[].sha` | independent Git-derived evidence resolves this exact SHA; proven missing SHA → contradiction, inaccessible evidence → inconclusive |
| `commits_covered[].files_changed` | compare with independently accessible actual commit diff; listed file absent → contradiction, unavailable diff → inconclusive |
| `commits_covered[].subject` | equals the first line of the actual full message for that exact SHA; apply `commit.convention` below to the full message, not this producer-supplied summary |
| `gates[].stdout_ref` | file MUST exist at the declared path |
| `gates[].stdout_sha256` | re-hash of the file MUST equal declared value |
| `gates[].stdout_tail` | MUST be a strict suffix of the file content |
| `gates[].exit_code_ref` | file MUST exist; for `status: "pass"` content MUST be `0` |
| `gates[].metrics.tests_failed` | for `status: "pass"` MUST be `0` |
| `gates[].screenshots[]` | each file MUST exist; the sha256 of its bytes MUST equal the declared value |
| frontend detection | computed from the covered commits' files at `repo_root_rev` |
| RED→GREEN diff | `git show {red_commit}:{test_file}` against `git show {green_commit}:{test_file}`: any line REMOVED or MUTATED → `test.integrity` violation; only ADDED lines are allowed |

## commit.convention — Full-message verification

Each covered commit's actual Git message: `type(feature): subject`, with the
approved feature scope and `Signed-off-by` trailer from `git commit -s`. For a
known issue, the final body line is `Refs: #N` for intermediate work or
`Closes #N` only when the whole issue is genuinely finished and all required
gates pass. Omit the issue line when unknown.

`qg-verify` checks the syntax, the sign-off and that the declared subject is the
actual one; the lens checks the feature scope and the issue line from the full
messages. A verified violation is `fail`; a message nobody can read is `inconclusive`.

## Producer rules (software-engineer side)

- The JSON is written **once**, at the end of the story, after every work commit landed;
  `repo_root_rev` is that last work commit, `HEAD`. Nothing is committed after it: the log and
  every capture stay in the Git-ignored evidence directory.
- Before the first capture, `git check-ignore -q "$EV"` must succeed; otherwise append
  `.copilot-tracking/skraft-plans/*/evidence/` to the project's `.gitignore` in a work commit.
- Run `qg-verify` on the log before handing over; a `fail` or `inconclusive` is yours to fix.
- Tool stdout/exit are captured by the stack adapter's bundled `capture.mjs` (or its gate scripts), never transcribed.
- `stdout_sha256` comes from the `.stdout.sha256` file that capture writes, never asserted from memory.
- A screenshot's `sha256` comes from
  `node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync(process.argv[1])).digest('hex'))" <png>`,
  never asserted from memory.
- A failing gate yields `status: "fail"` AND the file is still written. Do NOT suppress the log to hide a failure — a missing log is `inconclusive` (NEEDS_REWORK), so hiding fails harder than disclosing.

## Verifier rules (qg-verify)

- `qg-verify` exits `0` pass, `1` fail, `2` inconclusive; the producer runs it on its own log
  before handing over, the reviewer runs it again, the lens reports its result.
- Any of the following → `verdict: inconclusive` (never `pass`):
  - the JSON is missing
  - a required field is absent or malformed
  - a gate id is not a v7 gate (`GATE_UNKNOWN`)
  - a referenced file or screenshot does not exist
  - a `stdout_sha256` or screenshot `sha256` does not match the file content
  - a cycle's test file does not resolve at its RED or GREEN commit
  - `repo_root_rev` is not `HEAD` (the log describes an older tree)
  - `commit.convention` actual message or completion claim cannot be independently verified with available tools
- Any of the following → `verdict: fail`:
  - a gate has `status: "fail"`
  - `metrics.tests_failed > 0` while `status: "pass"` (internal contradiction)
  - an actual covered commit message violates the shared `commit.convention` policy
  - a test file lost or changed a line between its RED and GREEN commits
  - `commits_covered[].sha` does not resolve in Git
  - `files_changed` lists a path absent from the actual commit diff
  - a commit made since the DELIVER base is missing from `commits_covered`
  - a file of the evidence directory is tracked by Git (`EVIDENCE_COMMITTED`)
  - a frontend story records no screenshot (`SCREENSHOTS_MISSING`)

## Schema versioning

`$schema: "quality-gates-evidence/v7"` is part of the contract. Bump the version
when adding/removing gates or fields; old logs MUST still be parseable with their
declared version.

- **v7** — gate ids become `type.description` (`test.acceptance`, `test.unit`, `build.compile`,
  `build.lint`, `test.no-mocks-core`, `commit.convention`, `test.integrity`). Removes `G5`
  (architecture: covered by `test.unit` on .NET and `build.lint` on TypeScript and Python),
  `G6` (mutation: the project's CI, `/skraft-mutation` by hand) and `G11` (coverage: the
  project's CI). Removes the per-cycle snapshot fields: `qg-verify` reads every test file with
  `git show`. Adds `evidence.screenshots`, required for a frontend story. The log and its
  captures live in a Git-ignored directory; `repo_root_rev` is `HEAD`. v1–v6 logs still verify
  with their `G<N>` ids, snapshots and evidence-only commit.
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
