---
version: 1
slug: "prd-backlog-canvas-ui-index-html"
primary_target: "prd-backlog/canvas/ui/index.html"
related_targets: []
---

## Scope

Backlog canvas of the `skraft-prd-backlog` workflow, in the GitHub Copilot app and VS Code. Mode: Operate.

## Audience and task

A product owner or lead reviews the stories the workflow produced:
- reads why each one fails INVEST or the Definition of Ready, with the evidence;
- marks it reviewed;
- previews the GitHub creation as a dry run, then launches it.

The panel can be narrow (400 to 1600 px) and follows the host's light or dark theme. Light or dark
comes from the scene: a desk, next to the chat, by day or by night.

## Direction contract

THESIS:
- Each story is read as a pre-flight checklist: a named check (challenge), a dotted leader, then the
  value the check found (response).
- This refuses the backlog-dashboard default of score badges, donuts and same-size cards.

OWN-WORLD:
- Grounds: skraft navy `#0f1722` in the dark theme, `#f6f8fb` in the light theme.
- Cyan `#24b5ff` / `#7fd3ff` marks only the line in focus and the primary action.
- Verdicts are colored only in the response text and in a drawn icon: pass in teal, attention in
  amber, fail in coral. There are no filled badges.
- Lato for the challenges, Fira Code for ids, found values and counts.
- Hairline rules. No glass, no gradients, no cards inside cards.

STORY:
- The reviewer lands on Progress: the key figures in one band, the stories by stage in one bar,
  then each epic framed with its review (verdict, attempt, outcome, done-when, findings on the
  epic) and its stories as rows.
- A row opens Review on that story; the story's epic link leads back to the epic's frame.
- In Review, the reviewer sees the flight plan: stories in build order, grouped by milestone, then by epic.
- Each epic head shows its planning-review verdict and attempt, the story verdict counts and one
  cell per story; it folds, and its stories hang from it on a rail.
- Each row has a 14-tick strip: I N V E S T, then DoR 1 to 8.
- The top bar counts every story by verdict.
- They open the first failing story and read the failing line and its evidence.
- They answer its open questions in place (a proposed answer in one click, or their own words), saved
  as drafts the next correction session writes into the story.
- They mark it reviewed from the dock that stays in sight, then move to the next one.
- Finally they launch the creation: a mandatory dry run, then the creation of the closed selection.

FIRST VIEWPORT:
- Top: brand, backlog, the tabs Progress and Review, coverage, verdict board, repository.
- Progress (default): one region over the panel, content capped at 76rem; frames stack in one column.
- Review, left: the flight plan (`clamp(15rem, 30vw, 21rem)`). It stays beside the story in a medium panel
  and becomes a drawer below 640 px; the checklist lines stack when the story column is under 34rem.
- Review, center: the open story's checklist. First its statement and the sticky dock (state, tick index,
  Answer, Mark reviewed), then the six INVEST lines, the eight DoR
  lines and the lens findings, then the story sheet (examples, criteria, tasks, open questions). The epic's review
  is not repeated here: the epic id links to its frame in Progress.
- Bottom: a sticky launch bar holding the count of reviewed stories, the waiting dependencies, the open
  questions and the draft answers, Preview and Create. The primary action sits on the right.

FORM:
- Pre-flight checklist (challenge–response), position 5 of 7 on the ordered list, seed key `baf86d72`.
- Signature interaction: opening a failing line expands its evidence and scrolls the story sheet to
  the passage it accuses, highlighted.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- **Fonts**: Lato and Fira Code are not bundled. Downloading them needed a network approval that
  nobody could give, so the system stacks of the docs site apply.
- **Choices to confirm with the owner**: the structure, the language and the creation granularity
  were inferred (owner unavailable).
