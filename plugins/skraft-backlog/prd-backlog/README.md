# prd-backlog

The `skraft-prd-backlog` Copilot CLI dynamic workflow. It decides nothing a script or a human
decides: every check is a function here, every verdict comes from `review-verdict.mjs`.

- `workflow.mjs`: `PRD_BACKLOG_META` and the workflow body (`ctx.step`, `ctx.agent`,
  `ctx.parallel`, `ctx.pause`).
- `prd-inventory.mjs`: the requirement ids of a PRD and the epic of each FR.
- `story-map.mjs`: the normalization of `story-map.json` (what a script fixes instead of the
  slicer), its checks (coverage, ids, milestones, tracer, dependencies, cycles, size warnings) and
  the build order.
- `story.mjs`: the normalization of a story file (the fields the map decides) and its Definition
  of Ready checks.
- `corrections.mjs`: the assisted corrections — the catalogue drawn from the skills, the
  options each blocking finding gets (sized against the ceiling and the floor), the decisions,
  and what an accepted correction does to the story map.
- `review.mjs`: the planning review read story by story — dependency findings sorted against the
  map (dismissed when declared, SLICE proposals when missing), one verdict per story.
- `briefs.mjs`: the prompts of the slicer, the story writer and the four planning lenses.
- `render.mjs`: `story-map.md`, the lens inputs and the GitHub issue bodies.
- `handoff.mjs`: the planned operations and the HVE planning files.
- `publish.mjs`: the idempotent publisher over `gh`.

`canvas/` is the backlog canvas the same extension declares:

- `assess.mjs`: each story's INVEST letters and DoR items, with the evidence behind them (the
  checks of `story.mjs`, the map, the lens findings).
- `store.mjs`: the files the canvas reads, and `review.json` / `published.json` it writes.
- `creation.mjs`: the selection closed over dependencies, its sub-plan, the dry run and the
  creation through `publish.mjs`.
- `controller.mjs`: the actions the panel and the agent share; reviewing and creating are human
  actions.
- `explain.mjs`: the explanation the agent reads.
- `server.mjs`: the loopback server (per-process token, loopback Host, server-sent events).
- `canvas.mjs`: the declaration passed to `createCanvas`.
- `ui/`: the panel (`view.mjs` renders, `app.mjs` wires, `i18n.mjs` words every check in French and
  English).

The Copilot entry is `com.github.copilot/extensions/skraft-prd-backlog/extension.mjs`. Tested
against a simulated `ctx` and a fake `gh` (`tests/skraft-backlog/prd-backlog/`,
`tests/skraft-backlog/canvas/`); the panel runs in a browser under Playwright
(`npx playwright test -c playwright.backlog-canvas.config.mjs`).

## Size: AI-assisted time, ceiling and floor

Points are the time one developer assisted by AI needs, tests included (`EFFORT_SCALE` in
`story-map.mjs`): 1 ≈ 2 h, 2 ≈ ½ day, 3 ≈ 1 day — the ceiling of Small; 5 and 8 stay allowed with a warning
that recommends a split. Small
also holds on scope: one journey, at most one external integration, 3 to 5 criteria.

| Check | Kind | Lifted by |
|---|---|---|
| `criteria-too-many` (> 5) | problem, `correction: true` | a split the human accepts; never a writer retry |
| `effort-split` (5 or 8 points) | warning | a split the human may accept; the story is not held |
| `integrations-many` (> 1 named system) | warning | a split by interface |
| `too-small` (1 point and 3 criteria); map: covers a strict part of another story's | warning | a merge |

A story refused only by `correction` rules is held: the writer is not dispatched again, the
breaker ignores those rules, the canvas offers corrections.

## Corrections: the contract for the canvas UI

The controller (`canvas/controller.mjs`) exposes four actions; the UI renders, the human decides.

| Action | Agent | Input | Returns |
|---|---|---|---|
| `list_corrections` | yes | `{ ids?: string[] }` | `{ stories: StoryCorrections[], session: SessionView }` |
| `decide_correction` | no (human) | `{ id, decision: 'accepted' \| 'refused' \| 'proposed', comment? }` | `{ id, decision, accepted }` |
| `answer_question` | no (human) | `{ story, question, text }` (empty text withdraws) | `{ story, question, answer }` |
| `get_correction_session` | yes | `{}` | `SessionView` |

```ts
type StoryCorrections = { id: string, questions: Question[], findings: Finding[] }
type Question = { id: 'Q1', question: string, why?: string, options?: string[],
  answer?: string, answeredAt?: string,      // folded into the story file by the writer
  draft: string | null,                       // the answer typed in the canvas, not applied yet
  status: 'open' | 'draft' | 'resolved' }
type Finding = { id: string,                  // 'size' | 'check:too-small' | 'map:covered-by' | 'lens:<lens>:<gate>:<hash>' | 'slice:<ids>' | 'question:open'
  source: 'check' | 'lens' | 'map' | 'slice' | 'question', letters: string[], dor: string[],
  message: string, sources?: string[],        // 'size' gathers every "too big" signal: one decision
  options: Option[] }                          // 2 to 4, the last is always 'custom'
type Option = { id: string,                    // '<story>|<finding>|<kind>[:<suffix>]', stable
  kind: 'split-interface' | 'split-workflow' | 'split-happy-path' | 'split-business-rule' | 'defer-nfr' | 'spike'
      | 'merge' | 'declare-dependency' | 'remove-dependency' | 'reframe-value' | 'clarify-ac'
      | 'regroup-criteria' | 'add-examples' | 'answer-questions' | 'rewrite' | 'custom',
  structural: boolean,                          // changes the story map: one per story at a time
  title: string, description: string, plus: string[], minus: string[],   // in the PRD language
  source: string,                               // the skill and reference, or 'hors skill'
  impact: { creates: number, modifies: string[], removes: string[], points: number,
    parts: { title: string, points: number }[],   // the stories a split or merge makes
    floor: boolean, ceiling: boolean, note?: string },
  target?: string, add?: string[], values?: string[],
  status: 'proposed' | 'accepted' | 'refused' | 'applied' | 'failed', decidedAt?: string, comment?: string | null }
type SessionView = { accepted: { id, story, kind, title, comment, at }[], answers: { story, question }[],
  ready: boolean, last: Session | null, run: string }
type Session = { status: 'running' | 'done' | 'failed', startedAt, endedAt?, applied: string[],
  failed: Record<string, string>, touched: string[], verdicts: Record<string, string> }
```

Rules the controller enforces: accepting an option withdraws the other accepted option of the
same finding; a story takes one structural correction at a time; `custom` needs a comment (it is
the instruction); an applied decision cannot change. Splits never offer a part under half a day
(`SLICE_FLOOR_HOURS`) nor above one day.

Files, next to the backlog: `corrections.json` — `{ version, decisions: { [optionId]: Decision },
session, stories }` (`stories` is the last snapshot of the proposals, rewritten by the workflow
and on each decision); `answers.json` — `{ version, stories: { [id]: { [qid]: { text, at } } } }`.

The correction session is the workflow run with `corrections: true` (`get_correction_session.run`
says so): no story-map pause; the slicer names the parts of each accepted split
(`corrections/<id>.split.json`, checked by `splitProblems`), the code moves the stories
(`applySplit`, `applyMerge`, `applyDependency`) and checks the map; the touched stories — and the
stories with draft answers — are written with what each correction says; only they are reviewed,
the others keep their verdict (`reviews/<epic>/stories.json`, by file fingerprint). Without an
accepted decision or a draft answer the run is refused and nothing changes.

## Progress: what the canvas shows while a run works

The workflow keeps `progress.json` next to the backlog, written after every step (one write at a
time, through a temporary file):

```ts
type Progress = { version: 1,
  run: { startedAt, endedAt?, phase: 'SLICE' | 'CORRECT' | 'ELABORATE' | 'REVIEW' | 'HANDOFF' | 'PUBLISH' | …,
    status: 'running' | 'paused' | 'blocked' | 'refused' | 'waiting-review' | 'published' | 'simulated', detail?, mode: 'full' | 'corrections' },
  stories: { [id]: { step: 'writing' | 'written' | 'refused' | 'held' | 'reviewing' | 'rework' | 'approved' | 'splitting', attempt?, at } } }
```

Every review file records the fingerprint of each story file it judged (`fingerprints`). The
canvas drops a lens finding made on a version of the file that has changed since (a correction,
a rework, a split): `assessment.stories[].staleFindings` counts them. The assessment carries
`run` (the run in progress or the last one) and `stories[].progress`; `get_state` returns both.

## Framing (FRAME): questions before the first slice

When no story map passes yet, the run asks before it cuts (`framing.mjs`): the code asks what the
PRD shows (several channels in one epic, milestones, epics past 12 FRs, where the NFRs go) and
the slicer adds up to 5 questions only a reader sees (MVP scope, tracer, order). They are written
to `framing.json` — `{ version, questions: [{ id, source: 'prd' | 'slicer', question, why?,
options, recommended, epic? }], answers: { [id]: { text, at } } }` — and the run pauses
(`framing-answered`). An unanswered question takes its recommendation. `approve: true` asks the
PRD questions only and does not pause; `frame: false` skips framing.

| Action | Agent | Input | Returns |
|---|---|---|---|
| `list_framing` | yes | `{}` | `{ slug, questions: [{ …, answer, answeredAt }], open, resume }` |
| `answer_framing` | no (human) | `{ id, text }` (empty withdraws) | same as `list_framing` |

The canvas lists a backlog as soon as `framing.json` exists, before any story map.

## Epic by epic: create as each epic is ready

As soon as an epic is reviewed, the workflow rewrites `plan.json` with its ready stories (the
stories of the epics still under way are held as "in progress"), so the canvas can review and
create that epic while the others are still elaborated. A run removes `plan.json` when its review
starts; the handoff writes the full plan at the end. The final publication finds the issues the
canvas created by their marker and creates nothing twice.

| Action | Agent | Input | Returns |
|---|---|---|---|
| `review_epic` | no (human) | `{ epic, reviewed? }` | `{ epic, reviewed: ids, counts }` |
| `preview_epic` | yes | `{ epic }` | the dry run of the epic's reviewed stories (closed over what they wait on); `create_issues` creates it |

To elaborate one epic per run, pass `epics: ['EP-001']`.

## Agent memoization

The dynamic-workflow runtime replays an agent whose brief it already saw in the same run journal.
Every brief ends with `Pass: <salt>`: a resume of the same run keeps the salt (it is journalled
with `ctx.step('pass-v1')`), so a resumed run runs no agent twice; a correction session salts its
briefs with its accepted decisions and answers (id and time), so a decision taken again makes a
new brief and the writer runs again.
