# v1 → v2 non-regression harness

Compares a pipeline run of the v1 plugin (branch `main`) with a run of the v2 engine
(`integration/v2-next` and lot branches) on the same fixture. A lot PR that degrades a
criterion without a written waiver is blocked.

A **run** is one pipeline run on one fixture. Its output is the tracking folder
`.copilot-tracking/skraft-plans/<slug>/`. The harness reads two such folders, turns each
into a `RunSummary`, compares them and renders a Markdown table for the PR comment.

| File | Role |
| --- | --- |
| `summary.mjs` | Pure. v1 folder content or v2 event list → `RunSummary`; maps v2 gates onto v1 ids. |
| `compare.mjs` | Pure. Two summaries → findings `{criterion, v1, v2, severity}`. |
| `report.mjs` | Pure. Waivers, exit code, Markdown table. |
| `tracking-folder.mjs` | IO. Reads a tracking folder, detects v1 or v2 by its content. |
| `cli.mjs` | Entry point. `compare` and `prepare-v1`. |

Tests: `node --test "tests/regression/**/*.test.mjs"` (`npm run test:regression`).

## Commands

```sh
node eng/regression/cli.mjs compare --v1 <trackingDir> --v2 <trackingDir> \
  [--fixture payment] [--waivers eng/regression/regression-waivers.json] [--out report.md] \
  [--json] [--duration-pct 25] [--cost-pct 25]

node eng/regression/cli.mjs prepare-v1 --dir <worktreePath> [--ref main]
```

- `compare` exits `0` when no unwaived regression remains, `1` otherwise, `2` on a usage or
  input error (missing folder, unreadable `events.jsonl`, waiver without a reason).
  `--fixture` defaults to the basename of `--v1` and selects the waivers that apply.
  `--json` prints the raw findings instead of Markdown.
- `prepare-v1` runs `git worktree add --detach <dir> <ref>`. It refuses an existing `<dir>`.
  Remove the worktree afterwards with `git worktree remove <dir>`.

## RunSummary

```js
{
  phasesReached: ['RESEARCH', 'DESIGN'],          // phases closed, in closing order
  verdicts: { DESIGN: ['NEEDS_REWORK', 'APPROVED'] }, // review verdicts per phase, in order
  gates: [{ component: 'refund', gate: 'G1', status: 'pass' }], // last status per component/gate
  artefacts: ['design/architecture.md'],          // relative, '/'-separated, dates → {date}
  durationMs: 7200000,                            // null when unknown
  cost: 1.2,                                      // null when unknown (v1 never records it)
  retries: 1,
  status: 'completed',                            // 'completed' | 'incomplete' | run.finished status
}
```

Artefacts exclude bookkeeping: `state.json`, `events.jsonl`, `execution-log.json[l]` and its
backups, archived invalid states (`state.json.invalid.*`), the v1 report queue (`reporting/`, including `pending.json` and `abandoned/`), `.active-slug`, everything under `reviews/` and `evidence/` (those are compared as
verdicts and gates). Date segments `YYYY-MM-DD` are replaced by `{date}` so two runs on
different days compare.

### v1 source (read-only, as `main` writes it)

- `state.json`: `phasesCompleted` → `phasesReached`; `currentPhase === 'DONE'` → `completed`;
  `retryCount` + `reworkCount` summed → `retries`; `phaseHistory[*].startedAt/completedAt`
  span → `durationMs`.
- `reviews/{date}/{phase}-review-{N}.md`: the top-level `verdict:` (or `status:`) line,
  unindented, `APPROVED | NEEDS_REWORK | REJECTED`, ordered by date then `N`. A phase without
  a review file falls back to `state.verdicts` (`CHANGES_REQUESTED` → `NEEDS_REWORK`).
- `evidence/{date}/{story}/qg-{story}.json` (contract v4): `gates[].id/status`, component =
  `story`.
- `execution-log.json` is bookkeeping only.

### v2 source: `events.jsonl` (contract since lot 3, review events since lot 4)

One JSON object per line, UTF-8, `\n` or `\r\n`. Blank lines are skipped. A line that is not
JSON makes `compare` exit 2. Every event carries `type`, `at` (ISO-8601 UTC) and `prev`
(lowercase hex SHA-256 of the UTF-8 bytes of the previous line, without its line ending;
`null` on the first); the harness does **not** verify the chain, the engine does.
Unknown `type` values and missing payload fields are ignored.

| `type` | Payload read | Effect on the summary |
| --- | --- | --- |
| `run.started` | `at` (first one), `slug` (first non-empty) | duration start; `slug` is the component of every v2 gate (`unknown` when absent). `workflow` (`skraft` or the repo `.dot` path), `artifacts`, `start`, `unlocked` and `base` not read. |
| `step.started` | `step`, `lenses`, `phase` | a second `step.started` with the same `step` counts one retry, whatever its `visit` and `attempt`: a new visit after a failed gate and a retry both count one. One with a `lenses` list (lot 4) opens a **review step** of `phase`; see the retry rule for reviews below. `agent`, `gates`, `outputs`, `missing`, `feedback`, `sentBy` (`gate` or `review` on an agent the run sent back), `heads` not read. |
| `step.recorded` | `cost` (number); on a review step `outcome`, `code` | `cost` summed into `cost` (a review's `cost` already holds its lenses and refuter). On a review step, appended to `verdicts[phase]`: `approved` → `APPROVED`, `needs-rework` → `NEEDS_REWORK` (also with code `loop-ceiling`: past `max_visits`), `needs-rework` with code `review-rejected` (no NEEDS_REWORK edge) → `REJECTED`; `blocked` (code `lens-unreadable`) is no verdict. `visit`, `attempt`, other `outcome` values (`done`, `failed`, `pass`, `fail`, `skipped`), `missing`, `failures`, `next`, `reason`, `durationMs`, `replayMs` not read. |
| `gate.ran` | `component`, `gate`, `status` | last status per config `component`/`gate` command wins, then mapped onto v1 ids (see below). `scope`, `command`, `failure`, `exitCode`, `durationMs`, `evidence` not read. |
| `commits.checked` | `step`, `commits[].verdict`, `commits[].replay` | only the last check of each `step` counts; gives G8 and G10 (see below). |
| `review.lens` | `step`, `visit`, `lens`, `verdict`, `findings[].id`, `findings[].gate`, `findings[].severity` | lot 4, one per lens and pass (`reused: true` when kept from the last pass). Each finding carries the `gate` of its lens's table (`G7`, `M2`…). The last `test-integrity` one on a DELIVER review step gives G7 and G9 (see below). `agent`, `fingerprint`, `findings[].location/description/suggestion`, `cost`, `reused` not read. |
| `review.refuted` | `step`, `visit`, `lens`, `finding`, `verdict` | lot 4, one per blocker or high finding checked. `refuted` drops that finding from G7/G9; `confirmed` and `unverifiable` keep it. `reason`, `cost` not read. |
| `review.cost` | `step`, `visit`, `cost` | lot 4, the cost of a batch of lenses or checks when the host tells it only for the batch (the Claude Code mod). Not read: the review's `step.recorded` `cost` already holds it. |
| `decision.recorded`, `tdd.replay-slow` | — | not compared. |
| `phase.closed` | `phase` | appended once to `phasesReached`, including `skipped: 'from-artifacts'` (phase reached before the run started). |
| `run.finished` | `at`, `status` | duration end; `status` copied (`completed` when every phase closed, else `blocked`). `code` not read. |
| `run.stopped` | — | not compared: the host or the machine stopped the run (`agent-unavailable`, `agent-failed`, `environment`, `no-components`); the next run resumes the open step. |

Gate mapping, per run slug:

| v2 source | v1 id | Rule |
| --- | --- | --- |
| `gate.ran` `build` | G3 | |
| `gate.ran` `format`, `lint` | G4 | |
| `gate.ran` `test` | G1 and G2 | |
| `gate.ran` `architecture` | G5 | |
| `gate.ran` `mutation` | G6 | |
| `gate.ran` `coverage` | G11 | |
| `gate.ran` `none` or unknown | — | dropped |
| `commits.checked` | G8 | `fail` if a verdict is `not-conventional`, else `pass`; absent when no commit was checked |
| `commits.checked` | G10 | `fail` if a verdict is `not-red` or `green-without-red`; `pass` when a commit has a `replay` and none failed; absent otherwise |
| `review.lens` `test-integrity` | G7, G9 | last one on a DELIVER review step, each id from the findings whose `gate` names it (a finding whose `gate` is neither `G7` nor `G9` counts against both): `inconclusive` if the lens verdict is; `fail` if such a `blocker`, `high` or `medium` finding is not `refuted` in the same step and visit, or the lens failed without any blocker, high or medium finding; else `pass` (low findings do not count), as the engine counts them for the review verdict; absent when the lens never ran there |

Several config components and commands map onto one `slug/id`: each keeps its last status,
then the id is `fail` if any is `fail`, else `pass`.

The v1 side reads G7 and G9 from `qg-{story}.json`, where they attest no mocks in the core and
no test tampering (RED→GREEN); the v1 `test-integrity` lens of `software-engineer-reviewer`
checks the same two ids at blocker severity, as test theater and the Iron Rule. In v2 the same lens runs in the DELIVER review
(`deliver_review` in the default workflow) and puts the id in each finding's `gate` field, so a
G7 finding fails G7 alone and a G9 finding G9 alone. A workflow whose DELIVER review drops the lens leaves G7/G9 absent: a regression
against a v1 `pass`.

Review steps (lot 4) and retries:

- A review step's verdicts go to the phase its `step.started` carries (`design_review` →
  `DESIGN`, `distill_review` → `DISTILL`, `deliver_review` → `DELIVER` in the default
  workflow), one per pass, in order; the comparison reads the last one.
- Each review pass beyond the first counts one retry. After a `NEEDS_REWORK`, the steps the run
  goes back through (the agent with `sentBy: 'review'`, the gates after it) count nothing on
  their first start before the review's next pass, so one rework counts one retry, as v1
  `reworkCount` did. A gate failure inside that rework still counts as above.
- `review.decided`, planned before lot 4, is not emitted: the verdict is on `step.recorded`.
  Review files the engine writes under `reviews/<step>-<visit>/` are bookkeeping.

Rules a v2 run must honour so v1 and v2 compare:

- Phase names are the v1 ones, upper case: `RESEARCH`, `DESIGN`, `DISTILL`, `DELIVER`.
- `run.finished.status` is `completed` only when every phase closed.
- A retry or a new visit re-emits `step.started` with the same `step` id.
- A review step's `step.started` carries `phase` and `lenses`; the DELIVER review keeps the
  lens named `test-integrity`.
- `step.recorded.cost` is a number in one unit for the whole run (USD recommended).
- `run.started.slug` is the story slug v1 uses in `qg-{story}.json`.
- Phase artefacts stay at the v1 paths under the tracking folder.

## Criteria

| Criterion | Regression | Improvement |
| --- | --- | --- |
| `status` | v1 `completed`, v2 anything else | the reverse |
| `phases` | v2 misses a phase v1 closed | v2 closes a phase v1 did not |
| `verdict <PHASE>` | final v1 `APPROVED`, final v2 `NEEDS_REWORK`, `REJECTED` or absent | the reverse |
| `gate <component>/<gate>` | v1 `pass`, v2 `fail` or absent | v1 `fail`, v2 `pass` |
| `artefact <path>` | present in v1, missing in v2 | — (new artefact = info) |
| `duration`, `cost` | v2 > v1 + 25 % (`--duration-pct`, `--cost-pct`) | v2 < v1 − 25 % |
| `retries` | v2 > v1 | v2 < v1 |

Unknown values on either side (v1 `cost` is always unknown) are `info`, never a regression.

## Capturing the v1 reference

The reference needs real model runs, so it is captured on a developer host, not in CI.

1. `node eng/regression/cli.mjs prepare-v1 --dir ../skraft-v1 --ref main`
2. For each fixture, copy the fixture project to a scratch folder, install the v1 plugin from
   `../skraft-v1` (`claude --plugin-dir ../skraft-v1/plugins/skraft-framework` or the
   Copilot CLI equivalent), and run the pipeline RESEARCH → DELIVER to completion.
3. Copy the resulting `.copilot-tracking/skraft-plans/<slug>/` to
   `eng/regression/baseline/<fixture>/`, then commit it with the `main` SHA it came from in
   the commit message. Drop `*.stdout`, snapshots and other bulky evidence files; keep
   `state.json`, `reviews/`, `qg-*.json` and phase artefacts.
4. `git worktree remove ../skraft-v1`.

Refresh the reference when `main` changes the pipeline output.

Fixtures:

| Fixture | Stack |
| --- | --- |
| `payment` | .NET |
| `payment-spring` | Java Spring |
| `payment-fastapi` | Python FastAPI |
| `react` | React |
| `multi-repo` | .NET + React, two repositories |

Then, for a lot branch: run the v2 engine on the same fixture and
`compare --v1 eng/regression/baseline/<fixture> --v2 <v2 tracking folder> --fixture <fixture>`.

## Waivers

`eng/regression/regression-waivers.json`:

```json
[
  { "criterion": "phases", "fixture": "payment", "reason": "lot 1 delivers RESEARCH only (#212)" }
]
```

- `criterion` is the exact text of the report's first column; `fixture` the `--fixture` name.
- `reason` is mandatory and non-empty; it states why the degradation is accepted and links
  the issue or lot that removes it.
- A waiver applies to one criterion on one fixture. Remove it in the PR that lifts the
  degradation. The report keeps waived rows visible with their reason.
