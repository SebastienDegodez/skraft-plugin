# Research: Mikado Method — Brownfield Analysis & AI-Agent Driving

## Research Topics / Questions

1. METHOD CORE: the Mikado Method loop in precise terms (goal → naive change/experiment → observe breakage → record prerequisites as graph nodes → REVERT → recurse on leaves → implement bottom-up). Quote canonical steps.
2. ARTIFACT: exact shape of the "Mikado Graph"/"Mikado tree" — nodes, edges, leaves; persistence format (markdown checklist / mermaid / DOT / other). Concrete example.
3. REVERT DISCIPLINE: why revert after each failed experiment; how handled when an AI agent edits (git stash/reset? worktree?).
4. AI-AGENT MAPPING (wellaged.dev): how the author runs the loop with an agent — single agent vs orchestrator+workers, prerequisite discovery/drive-to-terminal, graph persistence between iterations. Quotes.
5. RELEVANCE TO BROWNFIELD DISCOVERY / PRD EXTRACTION: repurpose dependency-graph-building as an ANALYSIS technique feeding a PRD. What nodes/edges represent when goal = "understand & document this system".
6. FIT WITH RECONCILIATION-LOOP / drive-to-terminal-state agent pattern: does experiment→discover prereqs→revert→recurse-until-leaves-green map onto queue-of-items-driven-to-terminal-state orchestration?

## Sources

- S1: https://mikadomethod.info — canonical method site
- S2: https://github.com/chaabani-anis/mikado-method — repo (README/docs/examples, artifact structure, tooling, file formats)
- S3: https://wellaged.dev/posts/mikado-method-ai-agents/ — load-bearing source: Mikado Method WITH AI agents

## Findings

### Source status

- S1 mikadomethod.info — FETCHED. Marketing/overview site + tool.html. Confirms purpose and the "Mikado Graph = map" framing, but does NOT publish an explicit numbered loop. The canonical step-by-step articulation lives in the book (Ellnestam & Brolund, Manning 2014); S3 restates it from the book's Chapter 1.
- S2 github.com/chaabani-anis/mikado-method — FETCHED (README, SKILL.md, EXAMPLE.md, sample.mikado.md, validate-mikado.sh, install.sh, CHANGELOG.md). An agent-skill implementation with a concrete rail-notation graph format + a bash validator. NOT the tool referenced by S3.
- S3 wellaged.dev — FETCHED in full. Load-bearing. Also names its own tooling repo: github.com/vordimous/mikado-skills.
- BONUS: github.com/vordimous/mikado-skills — FETCHED (README, docs/method.md, docs/session-rhythm.md, plugins/mikado/skills/{mikado,mikado-loop,mikado-mr}/SKILL.md, examples/worked-goal/remove-redisson.md). This IS the tooling S3 describes; it answers topics 4 and 6 directly with real skill/orchestrator snippets.

---

### 1. METHOD CORE LOOP

The canonical site frames the *why*, not the steps:

> "The Mikado Method is a process for surfacing hard-to-see dependencies in a codebase. It is very useful when you are trying to change a codebase, eliminate technical debt and get things done while keeping focus on creating business value." — S1 mikadomethod.info

> "The Mikado Graph will be your map to guide you in restructurings that take days or weeks." / "The Mikado Method helps you divide almost any problem into small, conquerable piece-meals." — S1 mikadomethod.info

The precise loop (S3, restating the book's four primitives):

> "The method has four primitives.
> **Set a goal.** Write down what you want the system to do or be when you are finished. Be concrete. ‘Admin services are in a separate package deployable without customer services’ is a goal. ‘Improve the architecture’ is not.
> **Experiment naively.** Try to implement the goal right now, without analyzing all the consequences first. Make the change. Run the compiler. Run the tests. See what breaks.
> **Visualize.** Whatever breaks is a prerequisite: something that must be true before your goal is achievable. Write it down as a node in a graph, with an arrow pointing toward the goal it unblocks. The graph is the artifact. It is the only thing that survives the next step.
> **Undo.** Revert every breaking change. Return to the last known working state. Start over on a prerequisite node, not the goal." — S3 wellaged.dev

> "You repeat this loop for each prerequisite, and each prerequisite's prerequisites, until you reach leaf nodes that can be implemented cleanly without breaking anything. Then you work back up the tree, committing at each step, always keeping the codebase green." — S3 wellaged.dev

Tooling restatements (identical shape, 6 numbered steps):

> "1. State a concrete goal. 2. Attempt it the most obvious way, in an isolated worktree. 3. Whatever breaks reveals prerequisites. 4. Discard the experiment. Record prerequisites in a graph. 5. Pick a leaf prerequisite. Implement it on the real branch. Commit. 6. Repeat 2-5 until the goal can be implemented cleanly." — vordimous/mikado-skills docs/method.md

The chaabani-anis skill compresses it to a cycle diagram:

> "Experiment in real files → failure → capture prereqs → update tree → commit tree → validate ↑ └─ git checkout -- . ─┘" — S2 chaabani-anis SKILL.md ("Core Cycle")

**Leaf-first / bottom-up invariant** (S2, Rule 4):

> "Every child node is a **prerequisite** of its parent — it must be implemented **before** the parent. Read: ‘To complete [Parent], [Child] must exist first.’ The deeper the node, the earlier it is implemented. Leaves (deepest) always go first." — S2 chaabani-anis SKILL.md

Concrete execution order from the worked example:

> "Full execution order: `{N5}`, `{N8}` → `{N6}`, `{N7}` → `{N3}`, `{N4}` → `{N1}` → `{N2}`." — S2 chaabani-anis EXAMPLE.md

---

### 2. THE MIKADO GRAPH ARTIFACT

**Shape.** A directed *acyclic* graph (drawn/stored as a tree with cross-links): one **goal node** (root, business-value framed), **prerequisite nodes** (interior), edges = "is-prerequisite-of" pointing toward the goal, and **leaves** = deepest nodes with no unimplemented children (implemented first). Cross-links (`requires:`) make it a DAG rather than a pure tree (shared prerequisites are single nodes).

The graph — not the code — is the deliverable:

> "The graph is the artifact. It is the only thing that survives the next step." — S3 wellaged.dev
> "The prerequisite graph is the artifact. Experiment code is throwaway." — vordimous/mikado-skills SKILL.md

**Persistence format — three real variants observed:**

(a) **Pen & paper / whiteboard** (canonical default):
> "The Mikado Method is very low key. It requires no tool or upfront investment... Use a pen and paper, or a whiteboard, and just go." — S1 mikadomethod.info
> "To help keeping track of the changes to be made, you create a Mikado Graph, the map to your restructuring journey. We prefer using pen&paper for drawing the Mikado Graph..." — S1 tool.html

(b) **Markdown "rail notation" checklist** (S2 chaabani-anis) — stored at `docs/mikado/<goal>.mikado.md`, graph wrapped in a ` ```text ` fence; depth = leading `│ ` rails; `[ ]`/`[x]` state; `{Nid}` IDs; `requires:` DAG cross-refs; `[discovered-by: <sha>]` + `[parent-error: <file:line: msg>]` traceability. Concrete example:

```text
[ ] Goal: Invoices can be issued without the billing logic knowing how customers are notified, so billing tests run without an SMTP server
│ [ ] {N1} Replace direct SmtpClient calls in BillingService with NotificationGateway calls
│   [discovered-by: a1b2c3d]
│   [parent-error: src/services/BillingService.ts:11: TS2304 Cannot find name 'NotificationGateway']
│ │ [ ] {N3} Update BillingService constructor to accept NotificationGateway
│ │   requires: {N5}
│ │ │ [ ] {N5} Create NotificationGateway interface (notifyInvoiceIssued + notifyPaymentOverdue)
```
— S2 chaabani-anis EXAMPLE.md / sample.mikado.md. A `validate-mikado.sh` (8-pass) enforces it: parsing, traceability annotations present, `requires:` resolution, **cycle detection**, child-SHA ≥ parent-SHA, orphan detection, golden-master gate, true-leaf enumeration.

(c) **Mermaid `graph TD`** (vordimous/mikado-skills) — stored at `.mikado/<slug>.md`, goal as `G((Goal: ...))`, prereqs `P1`, `P1a`, `P2`…, with `classDef` colour-coding **observed vs anticipated** prerequisites:

```mermaid
graph TD
  G((Goal: <short restatement>))
  classDef observed fill:#2e7d32,stroke:#66bb6a,...
  classDef anticipated fill:#e65100,stroke:#ff9800,...,stroke-dasharray:5 5
  class P1,P2 observed
  class P3 anticipated
```
> "Legend: solid green = observed failure in naive experiment; dashed orange = anticipated, confirmed by re-experiment after the observed leaves landed." — vordimous/mikado-skills examples/worked-goal/remove-redisson.md

No DOT/Graphviz variant was found in these sources. Both agent skills also carry sidecar sections in the same file: goal statement, acceptance criteria, status, testing plan (fast/targeted/regression tiers), notes/open-questions, and a checked-off prerequisite list with file paths.

---

### 3. REVERT DISCIPLINE

**Why revert.** The naive experiment is a *sensor*, not a draft; its output is the list of failures, not the code.

> "the undo step is not waste. The code you wrote and reverted taught you something. The graph holds that knowledge. Nothing was lost except the broken code, which was never going to ship anyway." — S3 wellaged.dev
> "Revert is free. The naive experiment is a sensor, not a draft." — vordimous/mikado-skills (ethos preamble)

**The AI-agent cost inversion** (the load-bearing insight):

> "The critical inversion is in the undo step. For a human developer, reverting code is emotionally and temporally costly... For an AI agent, discarding a branch costs nothing. The agent has no attachment to what it wrote. The tokens were cheap. The wall-clock time was seconds. There is no emotional overhead to reverting. There is no sunk cost fallacy to fight." — S3 wellaged.dev

> "This applies to the exploration phase specifically. The naive experiment is throwaway. The leaf implementations — the actual commits that build up the goal — are kept and shipped." — S3 wellaged.dev

**How revert is done mechanically — two concrete techniques:**

- **`git checkout -- .` (never stash)** — chaabani-anis. Note the ordering trap: commit the *tree file* first, because it is tracked.
> "8. `git add docs/mikado/<goal>.mikado.md && git commit -m ‘mikado-graph: ...’` — commit the tree **before** reverting: `.mikado.md` is tracked, so `git checkout -- .` would discard uncommitted node additions along with the code. 9. `git checkout -- .` — revert all code. **Never `git stash`.** 10. `git status` — confirm zero modified production files." — S2 chaabani-anis SKILL.md
- **git worktree (EnterWorktree/ExitWorktree)** — vordimous/mikado-skills runs the naive experiment in a throwaway sibling worktree so the main checkout is never dirtied.
> "1. `EnterWorktree`. Creates an isolated worktree off the current branch. 2. Inside the worktree, attempt the goal the most obvious way... The experiment is a sensor, not an implementation. 3. Run the regression tier... Capture ALL failures... 4. Do NOT attempt to fix anything. Collect signal only. 5. `ExitWorktree`. Discards all changes." — vordimous/mikado-skills SKILL.md Phase 2

> "Skipping reverts. ‘I'll just keep this working code and clean up later’ is how merges become disasters. The method's value comes from always returning to a known-good state between leaves." — vordimous/mikado-skills (common failure modes)

---

### 4. AI-AGENT MAPPING (S3 + its tooling)

**The mapping table** (verbatim, S3 wellaged.dev):

| Mikado | Agent workflow |
|---|---|
| Goal | The spec or user story given to the agent |
| Naive implementation | Let the agent attempt the change without scaffolding |
| Errors surface prerequisites | Test and compile failures reveal what the agent needs first |
| Visualize the graph | Human captures failures as structured prerequisite tasks |
| Undo | Discard the agent's branch; cost is near zero |
| Work the leaf nodes first | Give the agent atomic, prereq-free sub-tasks one at a time |

**Division of labour — the human runs the graph, the agent runs the code:**

> "The part that was the bottleneck for humans, doing the implementation work, is now essentially free. The part that was never the bottleneck, building and maintaining the prerequisite graph, is now the critical human contribution. The human's job is not to write the code. It is to run the graph." — S3 wellaged.dev
> "Build the prerequisite graph from the failures. This is the human judgment step, and it is the most important one... This is not a step you can delegate to the agent." — S3 wellaged.dev

**Single agent vs orchestrator+workers.** Both. Small leaves stay inline in the current session; boundary-crossing leaves are delegated to a fresh subagent:

> "Whether that runs in the current session or a fresh one depends on the leaf's size and surface area — small, self-contained changes often stay inline; anything that crosses subsystem boundaries or introduces a new abstraction delegates to a fresh context." — S3 wellaged.dev

The tooling realises this as a **loop orchestrator over a single-leaf worker**:

> "Mikado lives as a stack of composable skills: one to kick off a goal and run the naive experiment, one to drive a single leaf to completion — inline or in a fresh context depending on the leaf's scope, one to assemble the pull request... The skills compose via a loop orchestrator so the full run is effectively `loop <mikado-leaf>` until the graph is empty." — S3 wellaged.dev

Concretely (vordimous/mikado-skills): `/mikado <goal>` (start + naive experiment + record prereqs) → `/loop /mikado-loop` (auto-pace leaves) → `/mikado-mr` (synthesize PR). The `mikado-loop` worker = **one invocation, one leaf, then exit with a parseable status line**:

> "One invocation = one leaf. When all leaves are done, exits with a signal so `/loop` can stop automatically." — vordimous/mikado-skills mikado-loop/SKILL.md

Exit-signal contract (this is the drive-to-terminal-state contract):
> "`MIKADO_LOOP_ADVANCE`: leaf done, more remain · `MIKADO_LOOP_EXPAND`: leaf was too big; expanded into sub-prereqs · `MIKADO_LOOP_DONE`: goal complete, run `/mikado-mr` · `MIKADO_LOOP_BLOCKED`: needs human input." — vordimous/mikado-skills plugins/mikado/README.md

**Prereq discovery driven to green (terminal).** Leaf selection is greedy on unblocking power:

> "A leaf is a prerequisite with no unchecked children. Strategy: Prefer the leaf that unblocks the most parents. Tie-break with ‘lowest estimated risk’... Never start a parent until all its children are `[x]`." — vordimous/mikado-skills mikado-loop/SKILL.md; S2 chaabani-anis SKILL.md

Late discovery re-queues instead of patching:
> "If a leaf turns out to have its own prerequisites (compile errors that are not in scope, a missing migration), Claude records them as deeper graph nodes and stops to ask which to take next rather than guessing." — vordimous/mikado-skills docs/session-rhythm.md

**Graph persistence between iterations = the file on disk + git log; NOT session memory** (this is the context-drift fix):

> "fresh context each invocation is the point: it matches the Mikado-for-agents recommendation of one leaf per fresh session. Do NOT try to preserve session state between invocations via memory or conversation context; rely only on the graph file and git log." — vordimous/mikado-skills mikado-loop/SKILL.md
> "Each agent session is scoped to a single prerequisite node... Each session starts from a fresh context: the agent sees the graph, the leaf's definition, and nothing else. There is no accumulated conversation history to drift from." — S3 wellaged.dev

**Subagent prompt contract** (the delegation packet, verbatim):
> "When delegating, the subagent prompt must include: 1. The full current contents of `.mikado/<slug>.md` 2. The specific leaf to implement, verbatim 3. Acceptance criteria: ‘fast tier from the Testing plan passes; targeted tier passes for the affected scope...; no new failures anywhere; change is scoped strictly to this leaf’ 4. A directive: ‘If this leaf turns out to have its own prerequisites... STOP and report them as sub-prerequisites. Do not try to fix them.’" — vordimous/mikado-skills SKILL.md Phase 4b

**Roles can invert — "coach mode" (agent builds & maintains the graph, human implements):**

> "The method also works with the roles inverted... the agent becomes a different kind of collaborator: it runs the naive experiments, builds and maintains the prerequisite graph, derives the testing plan, and verifies each leaf after you commit it. You implement. At each step the agent hands you a single, clearly scoped task with verified acceptance criteria, marks it done when it passes, and picks the next one... Who writes the code is a configuration choice, not a constraint." — S3 wellaged.dev

**Convergent-evolution note (useful framing for a SKRAFT pitch):**
> "The Think-Act-Observe loop [ReAct] they describe is structurally identical to Mikado's experiment-visualize-undo cycle. The Mikado Graph is what you get when you externalize and persist those reasoning traces across many iterations." / "In Plan-and-Execute frameworks, a planner produces a DAG of sub-tasks, and executors work the leaf nodes first. That is the Mikado graph." — S3 wellaged.dev

---

### 5. RELEVANCE TO BROWNFIELD DISCOVERY / PRD EXTRACTION

**Direct pedigree.** Mikado was *born* as a brownfield technique:

> "It was designed for human developers working in brownfield systems that had no tests and no documentation, trying to make large changes without destroying the codebase in the process." — S3 wellaged.dev

And its core claim is exactly what a brownfield PRD needs to surface:

> "The Mikado Method is a process for surfacing hard-to-see dependencies in a codebase." — S1 mikadomethod.info
> "The method also surfaces dependencies empirically rather than through analysis. Instead of spending hours reading code trying to predict what will break, you try the change and let the compiler and tests tell you." — S3 wellaged.dev
> "The output of this process is a codebase that was never broken, a commit history that tells a coherent story, and a graph that documents the dependency structure you discovered along the way." — S3 wellaged.dev

**Repurposing as analysis (goal = "understand & document", not "make change X").** No source does this explicitly — this is an *interpretation/extrapolation* (flagged as such). The adaptation:

- **Goal node** = the enhancement the PRD is scoping (e.g. "add multi-tenant billing"), phrased as business value — same framing the skills already require ("Frame goals in business value, not technical tasks" — S2). This gives the PRD its "Enhancement Goal."
- **Naive experiment** = point the agent at that enhancement with no scaffolding; the **failures are the discovery signal**. Compile/test failures, missing seams, and untested modules become the raw material.
- **Prerequisite nodes** = the *hidden constraints and integration points* the enhancement depends on — "something that must be true before your goal is achievable" (S3). For a PRD these map cleanly to: **Technical Constraints**, **Integration Points**, **Dependencies**, and **Risk/Compatibility** sections.
- **Edges** = "is-prerequisite-of" = the dependency structure of the change → the PRD's "impact map."
- **Leaves** = the atomic, independently-shippable units → candidate **epics/stories** with natural ordering already encoded (`requires:`), i.e. a pre-sequenced backlog.
- **`[parent-error: file:line]` annotations** = evidence/citations → the PRD's "how we know this" trail (traceability the SKRAFT house style wants).
- **observed vs anticipated `classDef`** (vordimous) is a *gift* for PRD work: feed an existing design doc/plan as *anticipated* prereqs, then let the naive experiment **confirm or refute** them:
> "If you already have a plan or design document, feed it to the skill as the starting hypothesis. The naive experiment then becomes a validation pass: prerequisites your plan anticipated get confirmed or refuted, and new ones the plan missed surface as failures." — S3 wellaged.dev
> "Anticipated prereqs are not the same as observed prereqs. They start the graph with a hypothesis that the naive experiment will validate." — vordimous/mikado-skills SKILL.md Phase 0.75

**Opinion (asked for): worth adapting — as a bounded, evidence-generating probe, not the whole PRD engine.** The Mikado graph is an unusually good vehicle for the *risk/constraint/integration* half of a brownfield PRD because it produces **empirical, cited, dependency-ordered** findings instead of a speculative read-through — which is precisely the weak spot of LLM "read the repo and summarize" analysis. The "naive experiment → collect failures → revert" probe is a cheap, high-signal way to surface *enhancement risk* and *hidden coupling* that a static scan misses. **Caveats that must survive into the design:**
  1. It requires **fast, real feedback** — a compiler and/or a test suite. Legacy repos with no tests get *less* signal (Mikado's own golden-master gate exists for exactly this: measure coverage first, add characterization tests before probing — S2 chaabani-anis Pass 7). For a doc-only or config-only brownfield, the technique degrades to near-useless.
  2. It answers **"what does *this* change depend on?"** — it is *goal-relative*, not a whole-system census. It complements (does not replace) a breadth-first inventory scan (e.g. BMAD `document-project`'s Quick/Deep/Exhaustive levels in the session notes). Use Mikado to go *deep on the enhancement*; use a scanner to go *wide on the system*.
  3. "Green leaves are not a green system" (S3) → the graph surfaces *component* prerequisites but under-weights *cross-cutting integration* risk; the PRD's integration section still needs a human/reviewer pass.
  4. Running experiments against a live brownfield can hit **operational state drift** (S3: stale caches, migrations) — for pure analysis run it in a throwaway worktree/branch, never against a shared env.

---

### 6. FIT WITH A RECONCILIATION / DRIVE-TO-TERMINAL-STATE ORCHESTRATOR

**Strong structural fit.** The loop already *is* a queue-of-nodes-each-driven-to-a-terminal-state orchestrator, and the tooling proves it:

- **Queue** = the set of unchecked leaves; **terminal state per item** = leaf `[x]` (green, committed) OR expanded-into-sub-prereqs.
- **Per-item terminal signal is explicit and machine-parseable** — `MIKADO_LOOP_ADVANCE / EXPAND / DONE / BLOCKED` (vordimous). ADVANCE/EXPAND fire the next iteration; DONE/BLOCKED stop the loop. This is exactly a drive-to-terminal-state contract with a bounded outcome set.
- **Orchestrator is thin and stateless-per-iteration**: `loop <mikado-leaf>` "until the graph is empty" (S3). State lives in the graph file + git, re-read each iteration.
- **Reconciliation is a first-class phase**, matching a reconcile-before-act orchestrator:
> "Phase 0.5: Resume detection and reconciliation. If `.mikado/<slug>.md` already exists, this is a resumed session. Before picking a leaf, reconcile the graph with the actual branch state. The user may have committed out-of-band since last session." — vordimous/mikado-skills SKILL.md
> "Never skip the reconciliation check. Out-of-band commits between invocations are normal when the user is reviewing; the graph must stay honest." — vordimous/mikado-skills mikado-loop/SKILL.md
- A `Base commit` anchor in front-matter is the reconciliation datum: "It anchors resume-time reconciliation (Phase 0.5) against the commits produced since." — vordimous/mikado-skills SKILL.md.
- **Idempotent re-entry**: fresh context per iteration, source of truth on disk — the same property a robust reconciliation loop needs to survive interruption/restart.
- **Cycle-safety**: the graph is validated as a DAG (`validate-mikado.sh` Pass 4 cycle detection — S2) → the queue provably terminates; no item can depend on itself transitively.

**Where the friction lives:**

- **The graph is a hypothesis, not a static plan** — the queue *grows during processing*. An orchestrator that assumes a fixed work list will mis-model this; it must support **enqueue-during-drain** (the `EXPAND` signal) and re-picking.
> "the graph is a hypothesis, not a plan. Leaf nodes that look independent often reveal new dependencies when you actually implement them. The tree grows as you work it. Treat the graph as something you are discovering, not something you designed upfront." — S3 wellaged.dev
- **The single non-automatable step is graph construction** (turning failures into the right prerequisite nodes) — "This is not a step you can delegate to the agent" (S3). A fully-autonomous drive-to-terminal loop must either keep a human in that seat or accept lower graph quality.
- **Scope leaks are the quiet failure mode** — an item "solved" by reaching into a sibling's territory looks terminal but isn't:
> "That is how scope leaks — the quiet failure mode of the method — happen. A leaf that solves its surface symptom by reaching into a sibling's scope creates latent gaps that look fine at review time and break in production." — S3 wellaged.dev
  → the terminal-state predicate must be *strict* (fast+targeted tests green AND scope-confined AND no new failures anywhere), not just "tests pass."
- **Per-item cost scales with feedback speed** — "the method also requires fast feedback... If your test suite takes twenty minutes to run, the per-experiment cost goes back up" (S3). A naive per-item full-regression run is a cost trap; the tooling mitigates with tiered testing (fast per-leaf, regression once at the end).
- **Runtime state does not reset with the session** (S3) — a reconciliation loop that only reconciles *git* state will miss caches/migrations/deploys.

**Net:** experiment→discover-prereqs→revert→recurse-until-leaves-green maps almost 1:1 onto a queue-of-items-driven-to-terminal-state orchestrator, and vordimous/mikado-skills is a working reference implementation (loop + single-leaf worker + parseable terminal signals + reconciliation phase). The adaptation cost for SKRAFT is mostly in (a) keeping graph-construction human-or-reviewer-owned, (b) making the terminal predicate strict enough to catch scope leaks, and (c) enqueue-during-drain support.

---

### Bottom line for the calling design (brownfield → PRD)

Adopt the Mikado *graph + naive-probe* as a **bounded, evidence-generating analysis step inside pre-DISCOVER**, feeding the PRD's constraints/integration/risk/impact sections and a pre-sequenced story list — but gate it behind a fast-feedback check (add characterization tests first if coverage is low), pair it with a breadth-first inventory scan for whole-system coverage, and keep graph construction reviewer-owned. The orchestration shape (loop over leaves, terminal signals, reconcile-on-resume) is directly reusable and already battle-tested in vordimous/mikado-skills.

## Gaps / Uncertain

- **No canonical numbered loop on mikadomethod.info.** S1 is a marketing/overview site; the authoritative step list is in the 2014 book (Ellnestam & Brolund, Manning). S3's four-primitive statement is a faithful restatement of the book's Chapter 1 (S3 discloses it was written from "the Mikado Method Chapter 1 PDF"), but I could not fetch the book text itself to verify wording word-for-word. Treat the four primitives as book-derived-via-S3, not scraped from S1.
- **"Mikado-as-analysis / PRD extraction" is extrapolation.** None of S1/S2/S3 or either repo frames Mikado as a documentation/PRD technique — all three treat it as a *refactoring/change* method. Topic-5 mapping (goal = "understand & document") is my synthesis for the calling design, explicitly reasoned from the "surfaces dependencies" property + the observed/anticipated plan-ingestion feature. Not a cited use case. Do not present it as an established pattern.
- **S3's own tooling repo (vordimous/mikado-skills) vs the topic's S2 (chaabani-anis/mikado-method) are two independent implementations.** They agree on method but differ in artifact format (Mermaid+`.mikado/` vs rail-notation+`docs/mikado/` markdown) and revert mechanism (worktree vs `git checkout -- .`). I cited both and labelled which is which; neither is "the" official tool. mikadomethod.info's own "Mikado Tool" (tool.html) is still just an announcement/mailing-list page — no shipped tool to inspect.
- **Book-level nuances not covered** (e.g. the original hand-drawn graph conventions, "naive approach = fastest", team-scaling chapters) are only indirectly available via S2's team section and S3's summary; not independently verified against the book.
- No DOT/Graphviz persistence variant found in any source (only pen&paper, markdown rail-notation, and Mermaid). If a DOT format is needed for the design, it would be a net-new invention.
