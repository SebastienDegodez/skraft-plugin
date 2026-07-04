---
name: quality-gates-evidence-contract
description: Use when producing or verifying the structured evidence log that attests quality gates (tests, build, mutation, commits, RED/GREEN integrity). Tech-agnostic schema. The evidence JSON and its markdown report are emitted by the bundled `scripts/qg-evidence.mjs` tool — never assembled by hand. Loaded by software-engineer (writer) at COMMIT phase and by quality-gates-lens (reader) during review.
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
├── qg-manifest.json                      # LLM-authored parameters for the bundled tool
├── qg-{story}.json                       # the evidence log (this contract) — TOOL-EMITTED
├── qg-{story}.md                         # markdown report — TOOL-EMITTED, derived view
├── qg-{story}-tests.stdout               # captured tool stdout (referenced by sha256)
├── qg-{story}-tests.exit                 # captured exit code
├── qg-{story}-build.stdout
├── qg-{story}-build.exit
├── qg-{story}-mutation.json              # mutation runner native report
└── snapshots/
    ├── red-{cycle}-{test-file-basename}  # test file at RED commit (git show)
    └── green-{cycle}-{test-file-basename} # same test file at GREEN commit (git show)
```

The producer captures raw outputs with the **terminal redirecting output to disk**,
then the bundled tool assembles the JSON and renders the markdown. Nothing in
`qg-{story}.json` or `qg-{story}.md` is ever typed by the LLM. The lens reads them
in read-only mode.

## Bundled tool (`scripts/qg-evidence.mjs`)

Deterministic assembler + renderer. Node >= 18, zero dependencies, non-interactive.
Structured JSON envelope on stdout, diagnostics on stderr. `--help` prints the full
contract.

```bash
# 1. after capturing all raw gate outputs, write qg-manifest.json (parameters only)
# 2. assemble — recomputes every fact (sha256, exit codes, TRX/Stryker metrics,
#    git rev/log, RED/GREEN snapshots via git show) and writes qg-{story}.json
node <skill-dir>/scripts/qg-evidence.mjs assemble --manifest "$EV/qg-manifest.json"
# 3. render — emits qg-{story}.md from the JSON (refuses non-conforming input)
node <skill-dir>/scripts/qg-evidence.mjs render --input "$EV/qg-{story}.json"
```

Exit codes: `0` ok · `1` contradiction (evidence cannot be truthfully produced —
missing ref, unparsable metrics, unresolvable commit; no JSON is written) · `2` bad
usage. A **failing gate is NOT a contradiction**: `status: "fail"` yields a valid
log and exit `0` — failure is evidence, hiding it is the violation.

### `qg-manifest.json` (the only LLM-authored file)

```json
{
  "story": "eligibilite-trottinette",
  "projectSlug": "demo",
  "date": "YYYY-MM-DD",
  "tech_adapter": "quality-gates-dotnet",
  "commit_range": "<baseline-sha>..HEAD",
  "gates": [
    { "id": "G2", "command_executed": "…verbatim…",
      "stdout": "qg-tests.stdout", "exit": "qg-tests.exit",
      "metrics_source": { "type": "trx", "path": "qg-tests.trx" } },
    { "id": "G6", "command_executed": "…",
      "stdout": "qg-mutation.stdout", "exit": "qg-mutation.exit",
      "metrics_source": { "type": "stryker-json", "path": "qg-mutation.json" },
      "threshold": 90 },
    { "id": "G5", "status": "not_applicable", "rationale": "why" }
  ],
  "cycles": [
    { "cycle": 1, "behavior": "…", "test_files": ["tests/SomeTests.cs"],
      "red_commit": "sha", "green_commit": "sha" }
  ]
}
```

The manifest carries **intent only** (which gates, which files, which commits).
Every fact — hashes, exit codes, metrics, subjects, snapshots — is recomputed by
the tool from disk and Git; pre-computed values in the manifest are ignored.

### `qg-{story}.md` is a derived view

The markdown report exists for humans. It is **never authoritative**: the lens
falsifies `qg-{story}.json` only and MUST NOT read the markdown as evidence.

## Schema (`qg-{story}.json`)

```json
{
  "$schema": "quality-gates-evidence/v1",
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
        "green_snapshot_ref": "evidence/{date}/snapshots/green-1-SomeTests.ext"
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

## Producer rules (software-engineer side)

- The JSON is written **once**, at the end of the COMMIT phase, after every commit landed — by `qg-evidence assemble`, never by hand. Hand-assembling the JSON is a contract violation even if the content happens to be correct.
- Tool stdout/exit are captured by the SHELL (`> file 2>&1; echo $? > file.exit`), never transcribed.
- `stdout_sha256`, metrics, `repo_root_rev`, `commits_covered` and RED/GREEN snapshots are all computed by the bundled tool from disk and Git, never asserted from memory.
- The markdown report is emitted by `qg-evidence render`, never written as prose.
- A failing gate yields `status: "fail"` AND the file is still written. Do NOT suppress the log to hide a failure — the lens treats a missing log as `inconclusive` (NEEDS_REWORK), so hiding fails harder than disclosing.
- If `assemble` exits `1` (contradiction), fix the INPUTS (capture the missing file, correct the manifest) and re-run. Never work around the tool by writing the JSON yourself.

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
  - `commits_covered[].sha` does not resolve in Git
  - `files_changed` lists a path absent from the actual commit diff

## Schema versioning

`$schema: "quality-gates-evidence/v1"` is part of the contract. Bump the version
when adding/removing gates or fields; old logs MUST still be parseable with their
declared version.
