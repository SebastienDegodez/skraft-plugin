---
title: "Issue comments"
description: "The two comments skraft keeps on a story's issue: the run's progress comment and the refinement proposal, each part and when to act."
---

# Issue comments

skraft writes two comments on a story's issue, each in the issue's own thread: the progress of a run and a refinement proposal. This page lists each part, what it holds and when to act on it.

Why a comment and never a rewritten issue: [The backlog: from idea to ready story](../explanation/backlog.md).

## Progress comment <!-- #progress -->

One comment per run, on the story's issue. The run finds it again by a hidden marker, `<!-- skraft:issue-progress slug=<slug> -->`, and rewrites it at each phase it closes, each review that sends the work back, and the run's end. Only its first post notifies; a rewrite notifies nobody. It is written in the story's language, and its last body is kept in `issue-progress.md` of the tracking folder. It is posted only once you consented to publish ([Publish a run's pull request](../how-to/publish-pull-request.md)).

### Heading <!-- #progress-heading -->

- **Holds**: `### skraft · <slug> — <phase> closed`, `— <step> asked for rework`, or `— run <status>`. Once the run ended, a status line follows, with the stopping code in brackets.
- **Read it to**: know which transition the comment tells, without opening it.
- **Act when**: the heading says a review asked for rework (the run continues alone) or the run ended with a stopping code (look the code up in [Run journal](./run-journal.md)).

### Phases <!-- #progress-phases -->

- **Holds**: one checkbox per workflow phase: `[x]` closed, `— in progress` for the phase running, `— stopped here` once the run ended on it. While the run goes on, `Next: <phase>.` names the next one.
- **Read it to**: see how far the run is.
- **Act when**: a phase reads `stopped here`: the run needs you to resume it.

### Facts <!-- #progress-facts -->

- **Holds**: `Reviews: <step> <outcome> (N passes), ...` or `Reviews: none yet.`; `Quality gates:` with one line per gate, `<component>/<gate> <status>[, N surviving mutants] · <evidence>`; `Pull request: <url>[ (updated)]`; `Total: N attempts, N retries, <time>, cost <cost>`, followed by a note that the cost is approximate; where the run report and the evidence are, in the working copy under the run's tracking folder.
- **Read it to**: judge the run without opening the pull request: which reviews passed and how many passes they took, which gates are green, what the run cost.
- **Act when**: a gate is not green or has surviving mutants, or a review took several passes. The pull request is described in [Pull request and review comment](./pull-request.md).

### Steps <!-- #progress-steps -->

- **Holds**: a folded `Steps` table, `Phase | Step | Visits | Attempts | Retries | Time | Cost | Outcome`, one row per step.
- **Read it to**: find the step that took the retries or the time.
- **Act when**: a step shows many retries or an outcome other than a pass.

## Refinement proposal <!-- #refinement -->

One comment, posted by `/skraft-refine` or by the gh-aw workflow, on the issue it refines ([Refine a backlog issue](../how-to/refine-backlog.md)). The section titles below are those of the English comment.

### Header <!-- #refinement-header -->

- **Holds**: the readiness in the title (ready or needs refinement), `Size` in points with team-days, `Type`, `Priority` with its reason, `Definition of Ready` as n/8, and the size rationale in italics.
- **Read it to**: decide in one glance whether the issue can enter a sprint.
- **Act when**: the title says needs refinement, or the size is larger than your sprint takes.

### What blocks it <!-- #refinement-blockers -->

- **Holds**: `What keeps it from being ready`, the Definition of Ready items that fail, each with its note; `Problems in the current acceptance criteria`, each current criterion quoted with its defect (vague, technical, not testable).
- **Read it to**: know what to fix in the issue itself.
- **Act when**: always when the issue is not ready: answer the open questions or edit the criteria, then comment `/skraft-refine`.

![Refinement comment on issue #5 of the demo repository: "What keeps it from being ready": the failing Definition of Ready items, each with its note](/img/screenshots/en/github-refine-blockers.png)

### Proposed story <!-- #refinement-story -->

- **Holds**: the story in `As a... I want... so that...` form; `Domain examples`, numbered; `Proposed acceptance criteria`, each `AC<n> — <title> (from example n)` with its Given / When / Then.
- **Read it to**: review the story the refinement proposes, and see which example each criterion comes from.
- **Act when**: you accept it (copy it into the issue) or the persona, an example or a criterion is wrong.

![Refinement comment on issue #5 of the demo repository: The proposed story, its domain examples and its first acceptance criteria in Given / When / Then](/img/screenshots/en/github-refine-story.png)

### Definition of Ready and INVEST <!-- #refinement-dor -->

- **Holds**: a folded table of the 8 Definition of Ready items and one of the 6 INVEST criteria, each with its state and note.
- **Read it to**: see every item that failed, not only the first ones listed under the blockers.
- **Act when**: an item fails that the blockers section did not make you act on.

![Refinement comment on issue #5 of the demo repository: The unfolded table of the 8 Definition of Ready items, each with its state and note](/img/screenshots/en/github-refine-dor.png)

### References <!-- #refinement-references -->

- **Holds**: `Reference documents`, the PRD or BRD the proposal was checked against, or a candidate to link; `Gaps against the document`, where the issue and the document disagree; `Related issues`, with each link kind (duplicate, related).
- **Read it to**: spot a document the issue contradicts, and a duplicate before you start.
- **Act when**: a gap is listed, a candidate document is waiting to be linked, or an issue is marked as a duplicate.

![Refinement comment on issue #5 of the demo repository: Reference documents, gaps against the PRD and related issues](/img/screenshots/en/github-refine-references.png)

### Review <!-- #refinement-review -->

- **Holds**: a folded `Review` with the verdict of the three planning lenses and the number of attempts; when the verdict is not approved, the unresolved review points.
- **Read it to**: know how far to trust the proposal.
- **Act when**: the verdict is rejected: its points are decisions only the business can make.

### Footer and marker <!-- #refinement-marker -->

- **Holds**: the plugin version, how to ask again (`/skraft-refine`, or `--force` to redo it unchanged), and the marker `skraft-refine v=<version> hash=<fingerprint>`.
- **Read it to**: tell which version produced the comment. The marker is what makes a run skip an issue whose title, body and plugin version are unchanged.
- **Act when**: you edited the issue: comment `/skraft-refine` to get a new proposal.

## See also <!-- #see-also -->

- [Refine a backlog issue](../how-to/refine-backlog.md)
- [Publish a run's pull request](../how-to/publish-pull-request.md)
- [Pull request and review comment](./pull-request.md)
- [The DISCUSS gates](./gates.md#discuss)
