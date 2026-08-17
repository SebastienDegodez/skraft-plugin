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
The lens never re-runs anything; it falsifies the attestation against the Git tree.

If a field cannot be falsified from the Git tree alone, the field is mis-designed.

## Where the artifacts live

```
.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/
├── qg-{story}.json                       # the evidence log (this contract)
├── qg-{story}-tests.stdout               # captured tool stdout (referenced by sha256)
├── qg-{story}-tests.exit                 # captured exit code
├── qg-{story}-build.stdout
├── qg-{story}-build.exit
├── qg-{story}-mutation.json              # mutation runner native report
├── qg-{story}-red-{cycle}.stdout         # captured stdout of the RED run (referenced by sha256)
├── qg-{story}-red-{cycle}.exit           # captured exit code of the RED run (non-zero)
└── snapshots/
    ├── red-{cycle}-{test-file-basename}  # test file at RED commit
    └── green-{cycle}-{test-file-basename} # same test file at GREEN commit
```

The producer writes them with the **terminal redirecting output to disk**, never by
transcribing tool output into the JSON manually. The lens reads them in
read-only mode.

## Schema (`qg-{story}.json`)

```json
{
  "$schema": "quality-gates-evidence/v2",
  "story": "string — story identifier (e.g. eligibilite-trottinette)",
  "produced_at": "ISO-8601 UTC timestamp",
  "producer": "software-engineer",
  "tech_adapter": "string — name of the quality-gates-<tech> skill loaded (e.g. quality-gates-dotnet)",
  "repo_root_rev": "string — git rev-parse HEAD at the moment of writing",

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
      "exit_code_ref": "evidence/{date}/qg-{story}-tests.exit",
      "stdout_ref": "evidence/{date}/qg-{story}-tests.stdout",
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
        "red_snapshot_ref": "evidence/{date}/snapshots/red-1-SomeTests.ext",
        "green_snapshot_ref": "evidence/{date}/snapshots/green-1-SomeTests.ext",
        "red_stdout_ref": "evidence/{date}/qg-{story}-red-1.stdout",
        "red_stdout_sha256": "hex sha256 of the RED stdout file",
        "red_exit_code_ref": "evidence/{date}/qg-{story}-red-1.exit"
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
| G6 | Mutation score meets threshold | mutation runner score ≥ depthTier threshold on business logic |
| G7 | No mocks in Domain/Application core | grep-based attestation: zero mocking-framework symbols in those layers |
| G8 | Conventional commit format | every commit in `commits_covered` matches `<type>(<scope>): <subject>` |
| G9 | No test tampering (RED→GREEN integrity) | for every cycle, the test file changed only by ADDITION between RED and GREEN snapshots |
| G10 | RED observed | for every cycle, the test was actually RUN and FAILED before the implementation landed: captured RED stdout hashed by sha256, and a NON-zero exit code recorded — both captured at RED time |

G10 is the one gate whose substrate does NOT live in its own `gates[]` entry: that entry carries
`status` (and `rationale`) only, while the evidence sits in the per-cycle
`test_integrity.cycles[].red_*` fields — so the generic `gates[].exit_code_ref` rule
(content MUST be `0` for `status: "pass"`) does not apply to G10, whose expectation is the
exact inverse.

A gate that is genuinely irrelevant for the story uses `status: "not_applicable"` and
MUST include a `rationale` field explaining why. `not_applicable` is **never** a substitute
for `fail` or for missing evidence.

## Falsification surface (what the lens checks)

Every claim in the JSON resolves to something the lens can verify with `Read`,
`Glob`, `Grep`, or `git` (via the Git tree as a read-only file system):

| Field | How the lens falsifies it |
|-------|---------------------------|
| `repo_root_rev` | reads `.git/HEAD` or asks `git rev-parse HEAD`; must match |
| `commits_covered[].sha` | resolves via Git tree; missing SHA → contradiction |
| `commits_covered[].files_changed` | reads commit object; if a listed file is absent from the diff → contradiction |
| `commits_covered[].subject` | matches `^(feat\|fix\|chore\|refactor\|test\|docs\|build)(\([^)]+\))?: .+$` for G8 |
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

## Producer rules (software-engineer side)

- The JSON is written **once**, at the end of the COMMIT phase, after every commit landed.
- Tool stdout/exit are captured by the SHELL (`> file 2>&1; echo $? > file.exit`), never transcribed.
- `stdout_sha256` is computed via a tool call (`shasum -a 256 file`), never asserted from memory.
- Snapshots are extracted via `git show <commit>:<path> > snapshot-file`, never copy-pasted.
- The RED stdout and its exit code are captured **at RED**, before the implementation lands — they cannot be reconstructed afterwards (G10).
- A failing gate yields `status: "fail"` AND the file is still written. Do NOT suppress the log to hide a failure — the lens treats a missing log as `inconclusive` (NEEDS_REWORK), so hiding fails harder than disclosing.

## Verifier rules (quality-gates-lens side)

- Read-only. No tool execution beyond `Read`, `Glob`, `Grep`, and Git tree reads.
- Any of the following → `verdict: inconclusive` (never `pass`):
  - the JSON is missing
  - a required field is absent or malformed
  - a referenced file does not exist
  - a `stdout_sha256` does not match the file content
  - a snapshot does not match `git show {commit}:{path}`
- Any of the following → `verdict: fail`:
  - a gate has `status: "fail"`
  - `metrics.tests_failed > 0` while `status: "pass"` (internal contradiction)
  - G8 regex fails on any `commits_covered` subject
  - G9 diff shows a line REMOVED or MUTATED in an existing test between RED and GREEN snapshots
  - G10: a cycle records a zero exit code for its RED run
  - `commits_covered[].sha` does not resolve in Git
  - `files_changed` lists a path absent from the actual commit diff

## Schema versioning

`$schema: "quality-gates-evidence/v2"` is part of the contract. Bump the version
when adding/removing gates or fields; old logs MUST still be parseable with their
declared version.

- **v2** — adds gate `G10` (RED observed) and the three per-cycle fields `red_stdout_ref`, `red_stdout_sha256`, `red_exit_code_ref`; everything a `v1` log declares is unchanged.
