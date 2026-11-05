---
title: "Pull request and review comment"
description: "Each section of the pull request a run opens, its run details comment, the review table and its statuses, and the comment of skraft review --publish."
persona: software-engineer
---

# Pull request and review comment

The description of the pull request a run opens is rendered from the run's journal, section by section; `skraft review --pr <n> --publish` keeps one comment of the same kind.

Why a review goes before human review: [Review before review](../explanation/deep-dive/review-before-review.md).

## The description <!-- #description -->

The description is written in the story's language. What decides shows under a heading; the rest is folded in a `<details>` block whose summary is the heading and what it counts.

| Section | Shown | Written by | Act when |
|---|---|---|---|
| What changes | heading | pr-writer | the text does not match the change |
| Why | heading | pr-writer | the text does not match the story |
| Decisions applied | heading | engine | a locked gate was skipped |
| Consistency matrix | folded | engine | never: information only |
| Tests | folded | engine | never: information only |
| RED evidence | folded, counts the red commits | engine | a red commit was not replayed |
| Quality gates | folded, opens itself when a gate failed | engine | a gate failed |
| Review | folded, opens itself on a finding to fix or to decide | engine | a finding is to fix or to decide |
| Screenshots | folded | engine | never: information only |
| More Domain tests than acceptance tests | heading, only when the Domain rows outnumber the acceptance rows | engine | you want to prune tests |
| Out of scope and limitations | heading | pr-writer | a limit changes your decision |
| Run summary | folded | engine | the status is not the one you expect |
| AI disclosure | folded | engine | never: information only |

### Title and first line <!-- #title-and-link -->

- **Holds**: the title is the pr-writer's summary, else the story's title, else the slug, cut to 72 characters with `…`; the first line is `Refs #<issue>`, `Closes #<issue>` when the pull request targets the default branch. On Azure DevOps the line is `#<issue>`, `Fixes #<issue>` on the default branch.
- **Shown**: first line of the body, above every section.
- **Written by**: the pr-writer agent for the summary; the engine for the line.
- **Read it to**: know which story the pull request answers and whether merging closes it.
- **Act when**: the pull request targets the default branch and the issue must stay open.

### What changes <!-- #what-changes -->

- **Holds**: the pr-writer's text; without a pr-writer step, `Not written: the run has no pr-writer step that wrote what changes.`
- **Shown**: under its heading.
- **Written by**: the pr-writer agent.
- **Read it to**: learn the change before reading the diff.
- **Act when**: the text does not match the diff.

### Why <!-- #why -->

- **Holds**: the pr-writer's text; without a pr-writer step, `Not written: the run has no pr-writer step that wrote why.`
- **Shown**: under its heading.
- **Written by**: the pr-writer agent.
- **Read it to**: judge the change against the story.
- **Act when**: the text does not match the story.

### Decisions applied <!-- #decisions -->

- **Holds**: `- ADR-00N <title> (<path>), ratified in this run`; `- Locked gate <node> skipped, unlocked: <reason>`; else `None recorded: no ADR was ratified and no locked gate was unlocked in this run.`
- **Shown**: under its heading.
- **Written by**: the engine, from the run's journal.
- **Read it to**: see the architecture decisions the code follows and the locked gates somebody skipped.
- **Act when**: a locked gate was skipped and you do not accept the reason.

### Consistency matrix <!-- #consistency-matrix -->

- **Holds**: `From <path> in the tracking folder:` then the consistency matrix DESIGN wrote, as written; else `None recorded: the tracking folder holds no consistency matrix of this run (DESIGN writes it).`
- **Shown**: folded.
- **Written by**: the engine, which copies the DESIGN document.
- **Read it to**: check that the design's pieces agree with each other.
- **Act when**: never: information only.

### Tests <!-- #tests -->

- **Holds**: `From <path> in the tracking folder:` then the test plan DISTILL wrote, as written; else `None recorded: the tracking folder holds no test plan of this run (DISTILL writes it).`
- **Shown**: folded.
- **Written by**: the engine, which copies the DISTILL document.
- **Read it to**: compare what was planned with what the diff tests.
- **Act when**: never: information only.

### RED evidence <!-- #red-evidence -->

- **Holds**: a table `Commit | Subject | Replay exit code` (`not replayed` without a replay), then `Output excerpts of the replays are not recorded yet.`; without a red commit, `None recorded: no red commit was accepted in this run.`
- **Shown**: folded; the summary reads `RED evidence: N red commits`, never open by itself.
- **Written by**: the engine, from the red commits the journal accepted.
- **Read it to**: see that each test failed before the code that makes it pass.
- **Act when**: a red commit shows `not replayed` and you want proof.

### Quality gates <!-- #quality-gates -->

- **Holds**: a table `Component | Gate | Command | Result | Time | Evidence`; without a gate, `None recorded: no gate ran in this run.`
- **Shown**: folded; the summary reads `Quality gates: [N failed, ]M passed` and the block opens itself when a gate failed.
- **Written by**: the engine, from the gates the journal recorded.
- **Read it to**: see which checks ran, with which command, and how long they took.
- **Act when**: a gate failed.

### Review <!-- #review -->

- **Holds**: per review step, its heading line (`**<review>** · …`) and its table ([Review table](#review-table)); `Every lens of the last pass of each review passed without a finding.` when no lens found anything.
- **Shown**: folded; the summary reads `Review: <counts>` and the block opens itself while a finding is To fix, To decide or Accepted.
- **Written by**: the engine, from the last pass of each review.
- **Read it to**: see what the reviewing lenses found and what the refuter decided.
- **Act when**: a row is To fix or To decide; read an Accepted row before you merge.

### Screenshots <!-- #screenshots -->

- **Holds**: the light and dark captures of a front end the run kept; see [Attach a front end's screenshots](../how-to/attach-screenshots.md).
- **Shown**: folded; the dark captures are folded again.
- **Written by**: the engine, from what the last visuals step recorded.
- **Read it to**: judge the screens without running the application.
- **Act when**: a screen does not match what the story asked.

### More Domain tests than acceptance tests <!-- #domain-heavy -->

- **Holds**: `The test plans count <n> Domain rows against <m> acceptance rows (Application and E2E).` and the suggestion to run `/skraft:prune-tests`.
- **Shown**: under its heading, only when the test plans count more Domain rows than acceptance rows; otherwise the suggestion sits in the Run summary.
- **Written by**: the engine, from the test plans.
- **Read it to**: spot tests that may kill no mutant on their own.
- **Act when**: you want to prune: the developer runs the command on a component and decides each test.

### Out of scope and limitations <!-- #out-of-scope -->

- **Holds**: the pr-writer's text; without a pr-writer step, `Not written: the run has no pr-writer step that wrote what is out of scope.`
- **Shown**: under its heading.
- **Written by**: the pr-writer agent.
- **Read it to**: know what the pull request leaves undone on purpose.
- **Act when**: a limit changes your decision to merge.

### Run summary <!-- #run-summary -->

- **Holds**: the run's status, the run report table, and the `/skraft:prune-tests` line when the Domain-heavy section does not already show it.
- **Shown**: folded.
- **Written by**: the engine, from the journal.
- **Read it to**: see how the run ended and what it cost.
- **Act when**: the status is not the one you expect.

### AI disclosure <!-- #ai-disclosure -->

- **Holds**: the model families and the models the host named; that What changes, Why and Out of scope were written by the pr-writer agent and every other section rendered by the engine from the run's journal; that a human reviews it before it merges.
- **Shown**: folded.
- **Written by**: the engine.
- **Read it to**: know which models prepared the pull request.
- **Act when**: never: information only.

## Run details comment <!-- #run-details -->

Past the forge's body limit, the body keeps the sections shown under a heading and those open, plus a pointer line. The folded sections go to comments titled `skraft · run details` (`skraft · détails du run` for a French story), numbered `k/n` when one is not enough. A section too long for a comment is cut with the `cut` text of the description's words, which sends to `pull-request.md` in the tracking folder: it keeps the whole description. `skraft publish` restores the comments.

## Review table <!-- #review-table -->

The counts line reads like `Review: 2 to fix, 1 note, 13 refuted`. Each review step opens on a heading line, `**<review>** · <n> passes · lenses <model> · refuter <model>`, so that two runs compare: the model is the one the host named on the agent's last answer, else the family it was assigned; lenses on different models each show theirs (`test-integrity: sonnet; cold-reader: haiku`); `-` when no agent answered. Then the table with the columns `Status | Severity | Lens | Location | Finding | Why`. Rows are grouped To fix, To decide, Accepted, then Note; the Refuted rows are folded under their count. The Lens cell reads `<lens> · <gate> <name> (<id>)` for every lens that found the same line with the same severity and status, like `consistency · G1 Every structural commitment has an ADR (F3)`: the name is the one the Name column of the lens's gate table gives; without one (a journal written before the column, a lens of the repository without it) the cell reads `<lens> · <gate> (<id>)`. A finding without a location shows `-`. The finding, and the refuter's reason on a To fix row, are cut at 100 characters with `…`; the reason is whole on a To decide row and in the folded Refuted rows, where it is read to judge the refuter; `verdict.yaml` keeps everything whole.

### Statuses <!-- #statuses -->

| Status | Counts toward the verdict | What you do |
|---|---|---|
| To fix | yes | fix it, or answer it in the pull request |
| To decide | no | decide: one lens alone found it and the refuter refuted it |
| Accepted | no | a human accepted it as it stands when the review reached its loop ceiling; read it before you merge |
| Note | no | fix it if cheap; never blocks |
| Refuted | no | read the reason only if you disagree |

### From finding to status <!-- #finding-to-status -->

The refuter checks each finding, of any severity and whatever its lens answered; its answer and two facts give the status. A finding that would be To fix and that a human accepted at the review's ceiling (`review-ceiling`, `ACCEPT`) is Accepted, its Why column `a human accepted it as it stands at the review's ceiling`.

| Line | Refuter's answer | One lens alone, others passed | Status | Why column |
|---|---|---|---|---|
| unchanged since pass N, the finding new there | not asked | — | Note | `new on a line unchanged since pass N` |
| changed | `confirmed` | — | To fix | `confirmed: <reason>` |
| changed | `unverifiable`, or its check unreadable twice | — | To fix | `not verified: <reason>` |
| changed | `refuted` | yes | To decide | `one lens alone, against the lenses that passed; refuted: <reason>` |
| changed | `refuted` | no | Refuted | `<reason>` |
| same place as a finding refuted on pass N | not asked again | — | Refuted | `<reason> (refuted on pass N)` |

A low finding counts like any other: To fix while the refuter does not refute it, whether its lens answered `fail` or `pass`.

How the refuter works and how a later pass reuses it: [Refutation](./gates.md#refutation), [Incremental re-review](./gates.md#incremental).

## Review comment <!-- #review-comment -->

`skraft review --pr <n> --publish` keeps one comment on the pull request, in its language:

1. the heading `### skraft review · #<n> — <STATUS> (pass N)`;
2. the counts line, or the verdict's summary when the status is BLOCKED or no finding exists;
3. the heading line, which names the review `Review` rather than its node, and the table of the [Review table](#review-table);
4. the visible marker `skraft-review pr=<n>`, which finds the comment again.

The comment is rewritten at every pass; on Azure Repos it is a thread created Closed. Steps and consent: [Review a pull request with skraft](../how-to/review-a-pull-request.md).

## See also <!-- #see-also -->

- [Publish a run's pull request](../how-to/publish-pull-request.md)
- [Review a pull request with skraft](../how-to/review-a-pull-request.md)
- [Gates: review](./gates.md#review-run)
- [Tracking folder and journal](./run-journal.md)
- [Issue comments](./issue-comments.md)
