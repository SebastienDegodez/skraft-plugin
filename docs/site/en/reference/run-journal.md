---
layout: doc
lang: en
title: "Tracking folder and journal"
description: "The .copilot-tracking/skraft-plans/ folder: layout, artifacts by phase, active pipeline, the hash-chained, signed events.jsonl journal and each of its events, questions to a human, and every status and code returned."
persona: software-engineer
---

# Tracking folder and journal

> Everything a run knows sits in one repository folder and one hash-chained journal, from which the engine recomputes the state on every read and stores nothing else.

Why an event journal rather than a state file, and what resuming gains from it:
[The event journal]({{ "/en/explanation/event-journal" | relative_url }}).

## Layout {#layout}

The tracking folder lives **in the working copy that starts the run**:

```
.copilot-tracking/skraft-plans/
├── .active-slug                                   active pipeline of the working copy
└── <slug>/
    ├── .lock                                      lease of the session that drives the run
    ├── events.jsonl                               hash-chained, signed journal
    ├── run-report.md, qa-report.md, WORKFLOW.md   reports recomputed after each step
    ├── pull-request.md, issue-progress.md         pull request description, issue comment
    ├── plans/<YYYY-MM-DD>/                         the story's issue, DISCUSS stories
    ├── research/<YYYY-MM-DD>/<slug>-research.md   research document
    ├── details/<YYYY-MM-DD>/                       DESIGN, DISTILL, PUBLISH documents
    ├── features/                                  Gherkin scenarios
    ├── changes/<YYYY-MM-DD>/change-log.md         DELIVER change log
    ├── proposals/<node>-<visit>-g<n>.md            proposal for one file's surviving mutants
    ├── results/
    │   ├── <node>-<visit>-<attempt>.json          result an agent writes for one attempt
    │   ├── <node>-<visit>-<attempt>.documents.json   the tracking folder as that attempt found it
    │   └── loop/                                  briefs, replies and pending.json of the next / record loop
    ├── reviews/<node>-<visit>/                    what the lenses of one review pass read
    │   ├── changes.patch                          changes since the base of the run
    │   ├── changed-files.txt                      paths those changes touch
    │   ├── code.patch, code-files.txt             the same for a blind lens, without docs/adr
    │   ├── context.md                             story, project rules, who wrote which document
    │   ├── components.json                        stack, mocking strategy, contract testing
    │   └── verdict.yaml                           the verdict of the pass, written by the engine
    ├── gates/<component>/<gate>-<n>.log           evidence of each gate run
    └── visuals/<component>/e2e-<n>.log            output of each e2e command of the screenshots publication
```

`results/` and `reviews/` belong to the engine: they are not documents of the run, and a
review never hands them to a lens as one.

`verdict.yaml` is written at the end of each review pass, every text double-quoted:

```yaml
status: "NEEDS_REWORK"          # APPROVED | NEEDS_REWORK | BLOCKED
code: null                      # lens-inconclusive when BLOCKED
summary: "NEEDS_REWORK: 1 reason to address"
findings:                       # the blocker, high and medium findings that count
  - lens: "consistency"
    id: "F2"
    gate: "G1"
    severity: "high"
    location: "docs/adr/adr-001-card-payment.md:3"
    description: "two contexts own payments"
    suggestion: null
notes: []                       # the low findings, same keys
refutations:                    # every check of this pass
  - lens: "consistency"
    finding: "F1"
    verdict: "refuted"          # confirmed | refuted | unverifiable
    reason: "docs/adr/adr-001-card-payment.md:3 names Acme Pay"
    dissent: true               # only when the lens stood alone (Dissent Rule)
reused:                         # the lenses taken over from the previous pass
  - lens: "fitness"
```

The **slug** is the kebab-case name of a pipeline (`checkout-by-card`). One slug = one
pipeline = one folder.

## Artifacts by phase {#artifacts}

A phase's documents go in a subfolder dated `YYYY-MM-DD`; the engine gives the agent the path
of each expected output, and pre-creates it when it has a template. Detail by phase:
[Phases]({{ "/en/reference/phases" | relative_url }}).

| Phase | Artifact | Path |
| --- | --- | --- |
| DISCOVER (skraft-backlog) | triage report, sprint proposal | `research/{date}/triage-{date}.md`, `research/{date}/sprint-proposal.md` |
| DISCUSS (skraft-backlog) | stories, acceptance-criteria drafts | `plans/{date}/stories-{milestone}.md`, `plans/{date}/ac-draft-{story}.md` |
| RESEARCH | research document | `research/{date}/{slug}-research.md` |
| DESIGN | context map, event model, diagrams, contracts, consistency matrix, supersession plan | `details/{date}/context-map.md`, `event-model-{story}.md`, `diagrams-{story}.md`, `contracts-{story}.md`, `consistency-matrix-{story}.md`, `supersession-plan-{story}.md`; `details/{date}/structural-scan.json` (written by the engine) |
| DESIGN | ADRs (in the repository, outside the tracking folder) | `docs/adr/adr-{nnn}-{subject}.md`, `docs/adr/decisions-index.md`, `docs/adr/supersessions.md` |
| DISTILL | test plan, implementation plan | `details/{date}/test-plan-{slug}.md`, `details/{date}/impl-plan-{story}.md` |
| DISTILL | executable Gherkin scenarios | `features/{context}-{feature}.feature` |
| DELIVER | change log | `changes/{date}/change-log.md` |
| DELIVER | proposals for surviving mutants | `proposals/kill_proposal-{visit}-g{n}.md` |
| DELIVER | evidence of each gate; output of the e2e commands | `gates/{component}/{gate}-{n}.log`; `visuals/{component}/e2e-{n}.log` |
| PUBLISH | pull request prose and description | `details/{date}/pull-request-prose-{slug}.md`, `pull-request.md` |
| DESIGN, DISTILL, DELIVER reviews | the lenses' inputs and the verdict the engine writes | `reviews/{node}-{visit}/` |
| whole run | journal, reports recomputed after each step | `events.jsonl`, `run-report.md`, `qa-report.md`, `WORKFLOW.md`, `issue-progress.md` |

Lenses write no file: they return findings, and the engine writes
`reviews/{node}-{visit}/verdict.yaml`.

## What is never rewritten {#append-only}

| Item | Rule |
| --- | --- |
| `events.jsonl` | lines are only ever appended; an edited line breaks the chain or the signature, which the engine sees on its next read |
| run state | recomputed from the journal on each read; no state file is written |
| ADR not on the base branch yet | fixed in place, stays `Proposed`; no history of drafts ([Unpublished ADRs](#unpublished-adrs)) |
| published ADR | never edited; the new ADR carries `**Supersedes:** ADR-MMM` and a row is appended to `docs/adr/supersessions.md`, which the engine checks at the end of each DESIGN attempt |

## `.active-slug` {#active-slug}

| Rule | Detail |
| --- | --- |
| Content | the slug followed by a line break, written by `skraft init <slug>` (and by Init in the mod and the workflow) |
| Reading | blanks trimmed; content that is not kebab-case means "no active pipeline" |
| Mandatory | every command that acts on a run reads this file; the engine never guesses a slug |
| Scope | one working copy; a Git worktree therefore has its own |

## `events.jsonl` {#events-jsonl}

One JSON object per line, in UTF-8. Blank lines are skipped; `\n` and `\r\n` are both
accepted. Every event carries three shared fields:

| Field | Content |
| --- | --- |
| `type` | event type (table below) |
| `at` | ISO-8601 instant in UTC |
| `prev` | lowercase hex SHA-256 of the previous line (its UTF-8 bytes, without the line break); `null` on the first line |

```mermaid
flowchart LR
    L1["line 1<br/>run.started<br/>prev: null"] -->|sha256| L2["line 2<br/>step.started<br/>prev: h1"]
    L2 -->|sha256| L3["line 3<br/>step.recorded<br/>prev: h2"]
    L3 -->|sha256| L4["line 4<br/>phase.closed<br/>prev: h3"]
    L4 -->|sha256| L5["line 5<br/>run.finished<br/>prev: h4"]
```

**Chain check.** Each time it opens the journal, the engine checks every line. The first
break gives `journal-tampered` with this message:
`journal tampered: events.jsonl line N <detail>; restore the file or start a new slug`.

| `<detail>` | Cause |
| --- | --- |
| `is not JSON` | the line is not a JSON object |
| `does not open the chain` | line 1 has a non-null `prev` |
| `does not chain to line N-1` | `prev` is not the fingerprint of the previous line |


**Signature.** Each line ends with a `"sig"` field: the HMAC of the line without that field,
under the run's key. The first line names that key by `keyId`; the key is kept in
`~/.skraft/journal-keys/<keyId>.key` on the machine that started the run. A `journal.adopted`
line, written by `skraft journal adopt`, names a new key the following lines are signed under;
the lines before it stay unverified.

| `<detail>` (continued) | Cause |
| --- | --- |
| `names no signing key` | the first line names no key |
| `is not signed` | the line carries no `sig` |
| `does not carry the signature of the run's key` | `sig` is not the line's HMAC under the run's key |
| `is an adoption that does not follow the lines before it` | a `journal.adopted` line that does not follow the lines before it |

Without the key on this machine, or for a journal written before signing: code
`journal-unverifiable` (`journal unverifiable: the key that signed events.jsonl is not in
~/.skraft/journal-keys on this machine …`); `skraft journal adopt` adopts it. With no home
folder (`HOME`, `USERPROFILE`): `journal-unverifiable`, `journal unverifiable: the environment
names no home folder …`.

**Concurrent writes.** Before each append, the engine reads the journal again. If another
write arrived since it was opened, it stops with `journal-changed`:
`<slug>: another run wrote events.jsonl meanwhile; run again once it stops`.

## Events {#events}

| `type` | Written by | Fields |
| --- | --- | --- |
| `run.started` | Init, at the first init of the slug | `slug`; `story` (`{ issue, title }` or `null`); `workflow` (`skraft`); `base` (list, see below) |
| `step.started` | the pipeline, before starting an agent | `step` (`research`); `phase` (`RESEARCH`); `agent` (`solution-researcher`); `attempt` (1, 2…); `outputs` (expected paths, relative to the slug folder); `missing` (paths missing at the previous attempt, empty on the first); `assignment`: what the agent runs on — `family`, `tier`, `source` (`agent`, `workflow`, `type`, `default`, `escalation`, `host`) and, per host, `model` (list or null), `effort` (or null) and the `source` of each; a resumed attempt runs on it again, whatever the configuration says since; `host` (`claude-code`, `copilot`): the host that starts the agent, whose `model` and `effort` it runs on (no model: the host chooses). The `/workflows` log, the Observe view (`agents`) and `run-report.md` (`## Agents`) show each agent's family, tier, model on that host (or `model chosen by the host`) and effort, then the model the host says it ran on once it answers. On an ask node, `question` (the question kind) instead of `agent` |
| `step.recorded` | the pipeline, after the agent | `step`; `attempt`; `outcome` (`outputs-complete` or `missing-outputs`; on an ask node `answered`, or `skipped` when no human was needed, with `answer`; `aborted`, code `environment`, after an `ABORT`); `missing`; `durationMs`; `cost` (absent when the host reports none); `model` (the model the agent ran on, null for the session's; absent on a resume that did not start it); `ceiling` on a step no edge leads on from: the node the edge at its `max_visits` leads to (`loop-ceiling`), the one a human's instruction runs again, `null` when no edge leads on |
| `question.asked` | the pipeline, when it puts a question to a human | `key` (`adr-1`, `gates-1`), the node that asks the question then its rank among that node's questions in the run; `kind` (`publish-consent`, `adr-ratification`, `reporting-consent`, `mutation-plan`, `environment`, `blocked`); `text`; `options`; `refusals`; `header`; `step`; `visit`; `subjects` (the ADRs to ratify, otherwise empty) |
| `question.answered` | the host's dialog, or `skraft decide` | `key`; `answer` (for a `blocked` question, the human's instruction as they wrote it, on one line, or `STOP`); `reason` (`null` without one); `by` (`host`, `decide`, `host-confirmed` or `cli-tty`) |
| `phase.closed` | the pipeline | `phase` |
| `run.finished` | the pipeline | `status` (`completed` when the last phase is closed, `blocked` when the run stops); `code` (with `blocked`); `reason` (`<PHASE> closed` with `completed`) |
| `run.stopped` | the pipeline, when the agent does not start or stops, or a lens answers twice without a readable verdict | `code` (`agent-unavailable`, `agent-failed` or `lens-unreadable`); `reason`. Never written when the machine cannot run a step: the engine asks the `environment` question instead |
| `review.lens` | a review node, once per lens, and once per pass for each of the engine's own checks that finds something | `step`; `visit`; `lens` (`consistency`; `test-integrity#patch` for the engine's G9 findings, `testability#layout` for its G11 findings, which carry no `fingerprint`); `agent` (`consistency-lens`); `model` (the model it ran on, `claude-haiku-5.5`; null for the session's); `fingerprint` (hash of the lens's inputs); `verdict` (`pass`, `fail` or `inconclusive`); `findings` (`{ id, gate, severity, location, description, suggestion }`, `gate` being the id of the lens's table: `G7`, `M2`…); `cost` (absent when unknown); `reused` (`true` when kept from the previous pass: same inputs, nothing found) |
| `review.refuted` | a review node, once per blocker, high or medium finding checked by `finding-refuter`; findings of several lenses at one line, checked in one call, give one each with its own verdict, its `cost` on the first | `step`; `visit`; `lens`; `finding` (its id); `verdict` (`confirmed`, `refuted` or `unverifiable`); `reason`; `dissent` (`true` when the finding's lens alone found what sends the work back, and the refuter judged it with every input of the review); `model`; `cost` |
| `review.cost` | a review node, once per batch the host costs as a whole (the Claude Code mod) | `step`; `visit`; `cost` |
| `gate.ran` | `skraft gate`, once per gate | `component`; `gate` (`build`… or `none`); `scope` (`touched` or `all`); `command` (`null` for `none`); `status` (`pass` or `fail`); `failure` (`environment`, `deterministic` or `null`); `exitCode` (`null` when nothing ran); `durationMs`; `evidence` (path relative to the slug folder, `null` for `none`) |
| `commits.checked` | the pipeline, after an attempt of an agent step that made commits | `step`; `visit`; `attempt`; `commits`, each `{ repository, sha, subject, kind, verdict, replay }`: `kind` (`red`, `green`, `refactor`, `other`, `invalid`), `verdict` (`ok`, `not-conventional`, `issue-reference-missing`, `issue-closed`, `issue-not-in-story`, `green-without-red`, `not-red`, `no-component`), `replay` (`{ component, command, exitCode, durationMs }` of the replay the commit reports, `null` when it was not replayed); `settled` (`false` when the machine stopped the check, an `environment` question asked: its verdicts are those before the replays it could not run, so neither a later attempt nor the reports take them as final, and the attempt after `RETRY` replays its red commits again). `settled` is absent from a check that ran to its end, and from journals written before the field existed: absent means settled |
| `tdd.replay-slow` | the pipeline, once per phase, with `tdd.replay` at `all` | `phase`; `replayMs`; `phaseMs` |
| `visuals.recorded` | the `playwright-visuals` node | `step`; `visit`; each front end's screenshots |
| `publish.requested` | `skraft publish` | `by` (`skraft publish`); `consent` (`publish.pullRequest` when the command ran) |
| `pull-request.opened` | the `publish` node or `skraft publish` | `number`; `url`; `base`; `head`; `draft`; `bodyHash` |
| `pull-request.updated` | the `publish` node or `skraft publish` | `number`; `url`; `bodyHash` |
| `issue.commented`, `issue.comment-skipped` | the run, at each transition it reports on the story's issue | `issue`; `kind`; `phase`; `step`; `event`; `url` (commented) or `reason` (skipped); `via` (`mcp`, `gh` or `az`) and `fallback` when a host MCP server was offered |
| `journal.adopted` | `skraft journal adopt` | `keyId` (the new key); `previousKeyId`; `unverified` (how many earlier lines stay unverified) |

Each entry of `run.started.base`: `{ component, root, repository, ref, source, sha }`.
`component` is `null` for the working copy; `ref` is the ref actually used (`main` or
`origin/main`); `source` is `flag`, `component`, `config` or `default`. How it is computed:
[skraft-config.json]({{ "/en/reference/skraft-config" | relative_url }}).

The cost comes from the host: the Claude Code mod journals the session's cost difference in
USD; the Copilot workflow reports none (Copilot counts in credits, not USD). That difference
includes anything else exchanged in the session while the agent ran, so the panel and the
report show it as approximate (`~$0.42`) with a note.

A review node's `step.started` carries `lenses` instead of `agent`, `assignments` (each lens agent's assignment) and `refuter` (the refuter's, by the tier it escalates to: `standard`, `frontier`), which a resumed review replays, and `host`; each `review.lens` and `review.refuted` carries the `assignment` it ran on; its `step.recorded` has
`outcome` `approved`, `needs-rework` or `blocked` (`code` `lens-inconclusive` when a lens answered
`inconclusive` or failed with no blocker, high or medium finding: the run asks the `blocked`
question about the review node; `reason` names each such lens and what it noted),
`failures` (the findings that count, which the next brief of
the phase agent lists) and `cost` (its lenses, checks and batches of this pass, resumed or not). A step the run was sent back into, by the gates, a review or a human's refusal, has `sentBy`
(`gate`, `review` or `ask`) on its `step.started`; a step nothing sent back has none. A human's
instruction to a `blocked` question opens the node's next pass with `sentBy` `ask` and the
instruction as its `feedback`; a review node's `step.started` carries `feedback` too, which each
lens of that pass reads when `sentBy` is `ask`.
An agent's `step.recorded` lists in `documents` the files of the tracking folder its attempt
created or changed (the engine's own files left out), and for the solution architect the
`details/<date>/structural-scan.json` the engine wrote before the attempt; a review gives each lens these documents
by phase, and writes `reviews/<node>-<visit>/context.md`: the story, the project rule files
found (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `.github/copilot-instructions.md`,
`docs/adr/decisions-index.md`) and which agent wrote which document.

## Questions to a human {#human-questions}

A question is asked once and journaled (`question.asked`); its answer is journaled
(`question.answered`), then acted on. With no answer the run **waits** (fail closed): nothing
more is journaled, and starting the run again asks the same question, with the same key,
without starting an agent again. A run interrupted at any decision point resumes the same
way.

| Question | Key | Asked when | Answer acted on |
| --- | --- | --- | --- |
| `adr-ratification` | `<node>-<n>` (`adr-1`) | an ADR `docs/adr/adr-NNN-*.md` is `Proposed`; none: `step.recorded` `skipped`, reason `no Proposed ADR to ratify` | `RATIFIED`: each ADR set to `Accepted` (`status: Accepted`, `ratified_by: "human YYYY-MM-DD"`, the `**Status:**` line, its row in `docs/adr/decisions-index.md` when present), committed alone as `docs(adr): ratify ADR-001, ADR-002`. `REJECTED`: DESIGN runs again with the reason |
| `publish-consent` | `<node>-<n>` | `publish.pullRequest` is not set in `skraft-config.json`, or was set for an earlier version of the question; otherwise: `step.recorded` `skipped`, the answer as set, nothing written | the answer written as `"publish": { "pullRequest": true\|false }` with its `questionVersions` |
| `reporting-consent` | `<node>-<n>` | `publish.visuals` is not set in `skraft-config.json` and a component is a front end (stack `react`, or `commands.e2e`); none: `step.recorded` `skipped`, answer `DECLINED`, nothing written | the answer written as `"publish": { "visuals": true\|false }`, and kept for the rest of the run: a loop back through the node does not ask again |
| `mutation-plan` | `<node>-<n>` (`mutation_plan-1`) | the mutation gate failed and `kill_proposal` wrote its proposals | `APPLY`: `kill_mutants` applies the proposals; an instruction: `kill_mutants` gets it with the proposals it departs from; `STOP`: `run.finished` `blocked`, code `stopped` |
| `environment` | `<node>-<n>`, the node that cannot run (`gates-1`) | a step cannot run on this machine | `RETRY`: the same step is checked or run again, its agent only if its outputs were still missing; `ABORT`: run blocked |
| `blocked` | `<node>-<n>`, the node an instruction runs again (`design-1`) | an agent answered `blocked` (the agent's node), a loop reached its `max_visits` (the node its capped edge leads back to), a lens answered `inconclusive` (the review node) | an instruction: the same run enters that node on a new pass, the instruction as its `feedback` (`sentBy` `ask`), and no edge into the node counts as taken any more; `STOP`: `run.finished` `blocked` with the block's code and reason, nothing else |

The `environment` question reads `<node> cannot run on this machine: <reason>. Fix it, then
RETRY; or ABORT the run.` It is asked when a gate program is not found, a red commit cannot be
replayed, a component has no test command, Git fails, `docs/adr` exists but cannot be listed
(`docs/adr cannot be listed: Git or the file system refused to read it`, a fixed text that never
carries the error's own; the ratification is then never skipped), or Git refuses
the ratification commit. The step stays open. The same failure after a `RETRY` asks a new
question (`gates-2`). After a `RETRY` given in a host dialog, the engine reads
`skraft-config.json` again; when it is invalid, the run stops with `config-invalid` before it
runs anything, journaling nothing: once the file is fixed, starting the run again resumes the
open step.

## Unpublished ADRs {#unpublished-adrs}

An ADR is **published** when the run's base holds the file. After each agent attempt, every
ADR the attempt changed that is not published must:

- have the status `Proposed` (only the engine sets `Accepted`; changing an ADR ratified in this
  run means setting it back to `Proposed`, and it is asked again);
- carry no `amended_by`, `amended_in_place` or `superseded_by` header field;
- have no history section (`## History`, `## Historique`);
- not `supersedes` or `amends` another unpublished ADR, whether the link sits in the header or
  on a `**Supersedes:** ADR-MMM` line: edit that one in place instead.

A published ADR is still superseded or amended the usual way. A breach refuses the attempt
with the failure code `adr-lifecycle` and one line per breach, for example
`docs/adr/adr-002-x.md supersedes ADR-001, which is not on the default branch yet: edit
docs/adr/adr-001-y.md in place instead`. The agent retries with those lines.

## Research document {#research-document}

| Rule | Detail |
| --- | --- |
| Path | `<slug>/research/<YYYY-MM-DD>/<slug>-research.md`; the date is the UTC day of the first attempt, reused by the retry |
| Pre-creation | before the attempt, the engine writes it from the plugin's `research.template.md` template when it does not exist |
| Filled | the file exists, is not empty, differs from the template and holds no {% raw %}`{{…}}`{% endraw %} any more |
| Retry | not filled: the next attempt, with the list of missing paths, up to `max_attempts` (3 by default) |
| Stop | not filled after the last attempt: `run.finished` `blocked`, code `missing-outputs` |
| Resume | an open attempt whose outputs are already filled is recorded without restarting the agent |

## Gate evidence {#gate-evidence}

Each gate run writes `<slug>/gates/<component>/<gate>-<n>.log`, where `<n>` is 1 plus the
number of `gate.ran` already journaled for that component and gate. Format:

```
$ <command run>
cwd: <component root>
result: pass: exited 0
--- stdout
<standard output>
--- stderr
<error output>
```

The first line shows the command as it started: `{baseSha}` substituted, Python interpreter
chosen, quoted so that it reads back as the same arguments. The `command` field of `gate.ran`
keeps the line written in `skraft-config.json`.

On failure, the `result` line reads `fail (<class>): <reason>`. The `stdout` and `stderr`
sections are missing when nothing ran (line refused). A component with no
gate command writes no evidence.

## Statuses and codes {#statuses-and-codes}

The commands, the mod and the workflow return a **status** and, when they stop, a **code**:
`refused` (nothing was done), `blocked` (the run cannot move on), `waiting` (the run waits
for a human's answer), `done`.

| Status | Code | When | Typical message | Action |
| --- | --- | --- | --- | --- |
| `refused` | `invalid-slug` | slug not in kebab-case | `slug must be kebab-case, got "<slug>"` | pick a kebab-case slug |
| `refused` | `invalid-base` | `--base` is not a git ref | `--base must be a git ref: text with no blank that does not start with -` (the value is never echoed) | pass a ref with no blank and no leading `-` |
| `refused` | `config-invalid` | invalid `skraft-config.json` | `skraft-config.json is invalid: <every error>` | fix each listed error |
| `refused` | `base-unresolved` | no merge base with the ref in a repository | `… has no merge base with <ref>; set baseBranch in skraft-config.json or pass --base <ref>` | set `baseBranch` or pass `--base` |
| `refused` | `source-control-unavailable` | Git does not start while the config lists components | `<error>; the components of skraft-config.json need Git for their base` | install Git, put it on the PATH |
| `refused` | `no-active-pipeline` | no valid `.active-slug` | `no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug` | `skraft init <slug>` or `/skraft <slug>` |
| `refused` | `slug-mismatch` | the call names a slug other than the active pipeline | `the active pipeline of this working copy is <active>, not <requested>; switch with an explicit init` | explicit init of the wanted slug |
| `refused` | `not-initialised` | the active slug has no journal | `<slug> has no journal (events.jsonl); start it with an explicit init` | explicit init of the slug |
| `refused` | `pipeline-locked` | another session drives the pipeline (`.lock` renewed less than 2 min ago) | `<slug> is driven by another session (started …, last seen …); let it finish or stop it, or run again after … if that session is gone` | wait for the other session to end, or for it to expire |
| `refused` | `lock-unavailable` | the session cannot write `.lock` | `<slug>: this session cannot write the pipeline's lock file (.copilot-tracking/skraft-plans/<slug>/.lock); …` | make the tracking folder writable |
| `refused` | `journal-unverifiable` | this machine cannot verify the journal's signature | `journal unverifiable: …` | restore the key, or `skraft journal adopt` |
| `blocked` | `lock-lost` | the session lost the lease during the run | `<slug>: this session no longer holds the pipeline's lease …; this run stops here and writes nothing more` | run again once the other session ends |
| `refused` | `no-components` | `skraft gate` with no component | `skraft-config.json lists no component; run skraft init to detect them` | `skraft init` |
| `blocked` | `journal-tampered` | broken chain | `journal tampered: events.jsonl line N …; restore the file or start a new slug` | restore the file or start a new slug |
| `blocked` | `journal-changed` | another run writes during this one | `<slug>: another run wrote events.jsonl meanwhile; run again once it stops` | wait for the other run to end, run again |
| `blocked` | `missing-outputs` | outputs missing after the last attempt | `solution-researcher left required outputs missing after 3 attempts: <paths>` | a resume returns the same block; fix the cause and start a new slug |
| `blocked` | `design-records` | the solution architect's DESIGN records still fail after its last attempt: no consistency matrix whose `consistency-gate` reads `PASS` (G10), an ADR named `*-rejected.md`, `*-accepted.md`, `*-deprecated.md` or `*-superseded.md` (G14), a `**Supersedes:**` line without its row in `docs/adr/supersessions.md` (G2, G12) | `solution-architect still failed after 3 attempts: <each record at fault>` | write the record, then start a new slug |
| `blocked` | `agent-blocked` | the agent answered `blocked`, and a human answered `STOP` to the `blocked` question | `<agent> is blocked: <summary>` | final: a new run of the slug stays blocked |
| `blocked` | `agent-unavailable` | the host cannot start the agent | Claude Code: `skraft:solution-researcher could not be started: …`; Copilot: `agent "solution-researcher" is not available in this Copilot session (agents: …); install or enable the skraft plugin, or pass agentIds` | install or enable the plugin, then resume; the attempt is not consumed |
| `blocked` | `agent-failed` | the agent stops without finishing and its outputs are missing | `<agent> stopped without finishing: <error>` | resume: the step stays open and the same attempt restarts |
| `blocked` | `review-rejected` | a review answers `NEEDS_REWORK` and its node has no `NEEDS_REWORK` edge | `<node> asked for rework and the workflow has no NEEDS_REWORK edge out of it; <findings>` | fix the findings in a new slug, or add the edge to the workflow |
| `blocked` | `lens-inconclusive` | a lens answered `inconclusive` (a lens answering `fail` with low findings only passes, its findings noted) | `<lens>: inconclusive: <notes>`, one per lens, separated by `; ` | asked first as the `blocked` question; after `STOP`, final: a new run of the slug stays blocked |
| `blocked` | `lens-unreadable` | a lens answered twice without a readable verdict (`run.stopped`) | `<lens>-lens answered 2 times without a readable verdict: <error>` | resume: the lenses this pass already journaled are kept, the unreadable ones are asked again |
| `blocked` | `loop-ceiling` | a refusal or a failure would take an edge past its `max_visits`, and a human answered `STOP` to the `blocked` question | `<from> -> <to> was already taken N times, its max_visits` | final: a new run of the slug stays blocked |
| `blocked` | `stopped` | a human answered `STOP` to the `mutation-plan` question | `a human stopped the run at <node>; the proposals are in <paths>` | final |
| `blocked` | `environment` | a human answered `ABORT` | `aborted by a human: <question>` | fix the machine, start a new slug |
| `waiting` | `publish-consent`, `adr-ratification`, `reporting-consent`, `mutation-plan`, `environment` | a question has no answer | `<question> Answer with skraft decide <key> <A>\|<B>`, plus ` (a refusal with its reason)` when the question has a refusal | answer with `skraft decide`, `/skraft decide` or `skraft_decide` |
| `waiting` | `blocked` | an agent answered `blocked`, a loop reached its `max_visits` or a lens answered `inconclusive`, and nobody answered the `blocked` question yet | `<question> Answer with skraft decide <key> "<instruction>"\|STOP.` | answer with an instruction, which runs the node again in the same run, or `STOP` |
| `done` | — | the workflow's last phase is closed | `<PHASE> closed` (`PUBLISH closed` with the plugin's workflow) | — |

Gates also have their own `passed` and `failed` statuses:
[The skraft command line]({{ "/en/reference/cli" | relative_url }}).

## `skraft status` statuses {#status-values}

| Status | Condition | `reason` |
| --- | --- | --- |
| `idle` | no active pipeline | the `no-active-pipeline` message |
| `not-initialised` | the active slug has no event | `<slug> has no journal (events.jsonl)` |
| `tampered` | the chain is broken (exit code 1) | the `journal-tampered` message |
| `running` | journal open, run neither finished nor stopped; it is also the status right after `skraft init <slug>`, before the host starts anything | empty |
| `waiting` | a question asked and not answered | the question text |
| `done` | `run.finished` with a status other than `blocked` | the `run.finished` reason |
| `blocked` | `run.finished` `blocked`, or last event `run.stopped` | the event's reason |

A `step.started` or a `phase.closed` written after a `run.finished` reopens the run.

## Pitfalls & anti-patterns

- **Fixing `events.jsonl` by hand**: the chain breaks and the run is `tampered`. Start a new
  slug.
- **Guessing the slug**: a host or an agent never picks the slug; only an explicit init
  changes `.active-slug`.
- **Running two runs on the same slug**: the second one stops with `journal-changed`.
- **Setting an ADR to `Accepted` yourself in a run**: the attempt is refused
  (`adr-lifecycle`). Ratify it by answering the question.

## Going further {#see-also}

- [Phases]({{ "/en/reference/phases" | relative_url }})
- [Hosts]({{ "/en/reference/hosts" | relative_url }})
- [Resume or unblock a run]({{ "/en/how-to/resume-a-run" | relative_url }})
- [Run the gates and read their evidence]({{ "/en/how-to/run-gates" | relative_url }})
- [The skraft command line]({{ "/en/reference/cli" | relative_url }})
- [skraft-config.json]({{ "/en/reference/skraft-config" | relative_url }})
- [The event journal (hash-chained)]({{ "/en/explanation/event-journal" | relative_url }})
- [Guardrails: zero hooks, checks in the engine]({{ "/en/explanation/guardrails" | relative_url }})

Terms to know: **slug**, **journal**, **active pipeline**, **gate** — see the
[glossary]({{ "/en/reference/glossary" | relative_url }}).
