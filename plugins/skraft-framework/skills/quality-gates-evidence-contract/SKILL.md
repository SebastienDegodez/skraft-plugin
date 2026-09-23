---
name: quality-gates-evidence-contract
description: Use when producing or verifying the structured evidence log that attests quality gates (tests, build, mutation, commits, RED/GREEN integrity). Tech-agnostic schema. Loaded by software-engineer (writer) at COMMIT phase and by quality-gates-lens (reader) during review.
---

# Quality Gates Evidence Contract

A tech-agnostic schema that attests quality gates as **falsifiable references**, not as prose.

## Why this exists

Truth #6 (HARNESSES BRIDGE): the LLM cannot prove a test passed by saying so.
The producer (software-engineer) MUST cite **substrate the verifier can re-resolve**:
git SHAs, file paths at given revisions, hashed tool outputs deposited on disk.
`qg-verify` (`node "$SKRAFT_PLUGIN_ROOT/src/cli/qg-verify.mjs" --log <path>`) re-resolves every
claim against the files and the Git tree and derives the verdict; nobody re-runs a gate.

If a field cannot be falsified from the Git tree alone, the field is mis-designed.

## Where the artifacts live

One directory per story, never shared with another story:

```
.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/{story}/
├── qg-{story}.json                       # the evidence log (this contract)
├── qg-tests.stdout                       # captured tool stdout (referenced by sha256)
├── qg-tests.exit                         # captured exit code
├── qg-build.stdout / qg-build.exit
├── qg-mutation.*                         # core mutation gate (stdout, exit, report, manifest)
├── qg-mutation-boundary.*                # boundary mutation gate
├── qg-mocks.stdout                       # G7 scan output — empty on pass
├── qg-coverage.*                         # G11 coverage gate
├── qg-red-{cycle}.stdout                 # captured stdout of the RED run (referenced by sha256)
├── qg-red-{cycle}.exit                   # captured exit code of the RED run (non-zero)
└── snapshots/
    ├── red-{cycle}-{test-file-basename}  # test file at RED commit
    └── green-{cycle}-{test-file-basename} # same test file at GREEN commit
```

References inside the log are relative to the project's tracking directory
(`evidence/{date}/{story}/qg-tests.stdout`). Tool run folders (Stryker HTML, logs) never land here.

The producer writes them with the **terminal redirecting output to disk**, never by
transcribing tool output into the JSON manually. The lens reads them in
read-only mode.

## Schema (`qg-{story}.json`)

```json
{
  "$schema": "quality-gates-evidence/v4",
  "story": "string — story identifier (e.g. eligibilite-trottinette)",
  "produced_at": "ISO-8601 UTC timestamp",
  "producer": "software-engineer",
  "tech_adapter": "string — name of the quality-gates-<tech> skill loaded (e.g. quality-gates-dotnet)",
  "repo_root_rev": "string — git rev-parse HEAD after the last work commit, before the evidence commit",

  "commits_covered": [
    {
      "sha": "full git sha",
      "subject": "conventional commit subject line",
      "files_changed": ["relative/path/file.ext", "..."]
    }
  ],

  "gates": [
    {
      "id": "G1",
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
    }
  ],

  "test_integrity": {
    "cycles": [
      {
        "cycle": 1,
        "behavior": "short label",
        "test_files": ["relative/path/SomeTests.ext"],
        "red_commit": "sha at which this test was committed RED",
        "green_commit": "sha at which production code made it GREEN",
        "red_snapshot_ref": "evidence/{date}/{story}/snapshots/red-1-SomeTests.ext",
        "green_snapshot_ref": "evidence/{date}/{story}/snapshots/green-1-SomeTests.ext",
        "red_stdout_ref": "evidence/{date}/{story}/qg-red-1.stdout",
        "red_stdout_sha256": "hex sha256 of the RED stdout file",
        "red_exit_code_ref": "evidence/{date}/{story}/qg-red-1.exit"
      }
    ]
  }
}
```

## Mandatory gates (fixed identifiers)

The `id` field uses a fixed taxonomy. Tech adapters MAP their tools to these ids;
they do NOT invent new ones. Adding a gate id is a contract change (new schema version).

| id | label | what it attests |
|----|-------|-----------------|
| G1 | Acceptance test(s) pass | the BDD/acceptance scenario for the active story is green |
| G2 | All unit tests pass | the full unit suite is green |
| G3 | Build passes | compilation / static type-check succeeded |
| G4 | Static analysis pass | linter / analyzer reported no blocking issue |
| G5 | Architecture rules pass | dependency-direction tests pass (Clean Architecture) |
| G6 | Mutation score meets the bar | one entry per scope, `"scope": "core"` and `"scope": "boundary"`: the mutation runner, reading the break threshold from the checked-in config of that scope, exited 0 |
| G7 | No mocks in Domain/Application core | the adapter's scan of the Domain/Application projects and their unit tests printed nothing |
| G8 | Conventional commit policy | each exact covered commit's full Git message satisfies feature scope, optional issue reference and sign-off under the shared policy below |
| G9 | No test tampering (RED→GREEN integrity) | for every cycle, the test file changed only by ADDITION between RED and GREEN snapshots |
| G11 | Line coverage meets the bar | the adapter's coverage run over Domain and Application exited 0 (the bar is inside the adapter, never a caller argument) |
| G10 | RED observed | for every cycle, the test was actually RUN and FAILED before the implementation landed: captured RED stdout hashed by sha256, and a NON-zero exit code recorded — both captured at RED time |

G10 is the one gate whose substrate does NOT live in its own `gates[]` entry: that entry carries
`status` (and `rationale`) only, while the evidence sits in the per-cycle
`test_integrity.cycles[].red_*` fields — so the generic `gates[].exit_code_ref` rule
(content MUST be `0` for `status: "pass"`) does not apply to G10, whose expectation is the
exact inverse.

A gate that is genuinely irrelevant for the story uses `status: "not_applicable"` and
MUST include a `rationale` field explaining why. `not_applicable` is **never** a substitute
for `fail` or for missing evidence.

## Falsification surface (what qg-verify checks)

`qg-verify` resolves every row below against the files and the Git tree; the
quality-gates lens reports its verdict and checks only the commit policy it cannot
(approved feature scope, `Refs`/`Closes` issue line).

| Field | How the lens falsifies it |
|-------|---------------------------|
| `repo_root_rev` | resolves, and is `HEAD` or the parent of an evidence-only `HEAD` (the commit that adds the log touches only the story's evidence directory) |
| covered range | with the DELIVER base, every commit in `base..repo_root_rev` is listed in `commits_covered` |
| `commits_covered[].sha` | independent Git-derived evidence resolves this exact SHA; proven missing SHA → contradiction, inaccessible evidence → inconclusive |
| `commits_covered[].files_changed` | compare with independently accessible actual commit diff; listed file absent → contradiction, unavailable diff → inconclusive |
| `commits_covered[].subject` | equals the first line of the actual full message for that exact SHA; apply G8 below to the full message, not this producer-supplied summary |
| `gates[].stdout_ref` | file MUST exist at the declared path |
| `gates[].stdout_sha256` | re-hash of the file MUST equal declared value |
| `gates[].stdout_tail` | MUST be a strict suffix of the file content |
| `gates[].exit_code_ref` | file MUST exist; for `status: "pass"` content MUST be `0` |
| `gates[].metrics.tests_failed` | for `status: "pass"` MUST be `0` |
| `test_integrity.cycles[].red_snapshot_ref` | file MUST exist; content MUST equal `git show {red_commit}:{test_file}` |
| `test_integrity.cycles[].green_snapshot_ref` | same against `green_commit` |
| RED→GREEN diff | computed by the lens: any line REMOVED or MUTATED in an existing test → G9 violation; only ADDED lines are allowed |
| `test_integrity.cycles[].red_stdout_ref` | file MUST exist; re-hash MUST equal `red_stdout_sha256` |
| `test_integrity.cycles[].red_exit_code_ref` | file MUST exist; for G10 `status: "pass"` content MUST be NON-zero — a `0` means the test never failed |

## G8 — Full-message verification

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
  `repo_root_rev` is that last work commit. The evidence is then committed alone, touching
  only the story's evidence directory.
- Run `qg-verify` on the log before handing over; a `fail` or `inconclusive` is yours to fix.
- Tool stdout/exit are captured by the SHELL (`> file 2>&1; echo $? > file.exit`), never transcribed.
- `stdout_sha256` is computed via a tool call (`shasum -a 256 file`), never asserted from memory.
- Snapshots are extracted via `git show <commit>:<path> > snapshot-file`, never copy-pasted.
- The RED stdout and its exit code are captured **at RED**, before the implementation lands — they cannot be reconstructed afterwards (G10).
- A failing gate yields `status: "fail"` AND the file is still written. Do NOT suppress the log to hide a failure — a missing log is `inconclusive` (NEEDS_REWORK), so hiding fails harder than disclosing.

## Verifier rules (qg-verify)

- `qg-verify` exits `0` pass, `1` fail, `2` inconclusive; the producer runs it on its own log
  before handing over, the reviewer runs it again, the lens reports its result.
- Any of the following → `verdict: inconclusive` (never `pass`):
  - the JSON is missing
  - a required field is absent or malformed
  - a referenced file does not exist
  - a `stdout_sha256` does not match the file content
  - a snapshot does not match `git show {commit}:{path}`
  - G8 actual message or completion claim cannot be independently verified with available tools
- Any of the following → `verdict: fail`:
  - a gate has `status: "fail"`
  - `metrics.tests_failed > 0` while `status: "pass"` (internal contradiction)
  - an actual covered commit message violates the shared G8 policy
  - G9 diff shows a line REMOVED or MUTATED in an existing test between RED and GREEN snapshots
  - G10: a cycle records a zero exit code for its RED run
  - `commits_covered[].sha` does not resolve in Git
  - `files_changed` lists a path absent from the actual commit diff
  - a commit made since the DELIVER base is missing from `commits_covered`
- `repo_root_rev` neither `HEAD` nor the parent of an evidence-only `HEAD` → `inconclusive`
  (the log describes an older tree)

## Schema versioning

`$schema: "quality-gates-evidence/v4"` is part of the contract. Bump the version
when adding/removing gates or fields; old logs MUST still be parseable with their
declared version.

- **v4** — G6 is recorded once per mutation scope with a `scope` field (`core`, `boundary`);
  its runner reads the break threshold from the checked-in config, so no `--break-at` flag is
  expected in `command_executed`. Evidence lives in one directory per story.
  `repo_root_rev` may be the parent of the evidence-only commit.

- **v3** — adds gate `G11` (line coverage meets the bar) and restates `G6` as an exit-code attestation rather than a score comparison: the runner's `--break-at` decides, so a log no longer records a number a reader must judge. Removes the `depthTier` reference, which no longer exists.
- **v2** — adds gate `G10` (RED observed) and the three per-cycle fields `red_stdout_ref`, `red_stdout_sha256`, `red_exit_code_ref`; everything a `v1` log declares is unchanged.
