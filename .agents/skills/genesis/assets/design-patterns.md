# TIER 2 -- Design patterns (GoF axes, AI-native)

The catalogue an architect picks from when shaping ONE piece of work.
Cut on the same three axes the Gang-of-Four uses for object-oriented
design patterns (Creational / Structural / Behavioral), so a classical
software architect lands on familiar ground.

Each entry: AI-native name, classical analog, when, mechanism, anti-
patterns. Tier-3 architectural patterns COMPOSE these. Tier-1 idioms
realize them in a specific harness.

---

## Where each pattern lives

```
                    +---------------------------------+
                    |  TIER 2 design patterns         |
                    +---------------------------------+
                    |                                 |
   CREATIONAL              STRUCTURAL                 BEHAVIORAL
   (how primitives         (how primitives            (how primitives
    come into being)        compose at rest)           interact at run)
   ----------                ----------                ----------
   LAZY ASSET                COMPOSED MODULE           FAN-OUT + SYNTHESIZER
   PERSONA PRELOAD           DEPENDENCY ADAPTER        CONDITIONAL DISPATCH
   (with GROUNDED EXPERT     ORCHESTRATOR FACADE       SUPERVISOR
    BRIEFING sub-rule)       VALIDATION DECORATOR      PLAN MEMENTO
   THREAD SPAWN              LAZY PROXY                ACCEPTANCE OBSERVER
   DESCRIPTION DISPATCH      RULE BRIDGE               PROMPT TEMPLATE
   PERSONA PROTOTYPE         DETERMINISTIC TOOL        TODO COMMAND
   EXTERNAL CORPUS            BRIDGE                   ATTENTION ANCHOR (*)
    GROUNDING                                          GOAL STEWARD
                                                       HUMAN CHECKPOINT
                                                       FOLD-BY-DEFAULT
                                                       MODEL ROUTER
                                                       CACHE-AWARE PREFIX
                                                       PROMPT THRIFT
                                                       TOOL SUBSET
                                                       EFFORT GOVERNOR
```

(*) ATTENTION ANCHOR has no classical analog. It is the LLM-physics-
native cure for goal drift on long sessions and earns first-class
status in the catalogue.

---

# Creational patterns

How primitives, threads, and personas come into being.

## C1. LAZY ASSET

CLASSICAL ANALOG: Lazy Initialization.

WHEN: a MODULE ENTRYPOINT bundles knowledge that only some invocations
need. Loading it eagerly inflates every session.

MECHANISM: the SKILL.md body names the asset by relative path; the
agent loads it only when the process step that needs it executes. The
asset stays out of context until then.

ANTI-PATTERN: EAGER BLOAT -- inlining the asset into SKILL.md "for
convenience". Every dispatch hit pays the load cost.

---

## C2. PERSONA PRELOAD

CLASSICAL ANALOG: Constructor / object initialization.

WHEN: a thread needs a stable lens for the duration of its session.

MECHANISM: the harness loads a PERSONA SCOPING FILE at session start,
biasing all subsequent inference. The persona is the constructor that
"new"s up the thread's identity.

ANTI-PATTERN: MID-SESSION PERSONA SWAP -- swapping persona text mid-
session. The earlier persona's tokens still occupy attention; the
swap produces a hybrid lens that is neither.

SUB-RULE -- GROUNDED EXPERT BRIEFING. A persona declared as "expert
in X" without grounding the persona in real X-corpus produces a
NAMED-NOT-GROUNDED EXPERT: a confident voice with no factual anchor.
Mitigation: the persona scoping file MUST point at the corpus the
expert reads from (file paths, doc URLs, or asset references), and
the briefing handoff to that thread MUST cite specific source
artifacts the persona inspected before responding. A persona is its
LENS plus its CITATIONS, not its title alone.

---

## C3. THREAD SPAWN

CLASSICAL ANALOG: Factory Method (the runtime is the factory; the
spawn call returns a fresh execution unit with its own context).

WHEN: a unit of work benefits from a fresh context window -- isolation
from siblings, full attention on its own scope.

MECHANISM: parent invokes the harness's spawn affordance with a task
description and (optionally) a persona / module to load at startup.
Child runs, returns a value, exits.

ANTI-PATTERN: UNBOUNDED SPAWN -- letting any thread spawn any depth of
descendants. Couple with SUPERVISOR (B3) to bound the tree.

---

## C4. DESCRIPTION DISPATCH

CLASSICAL ANALOG: Service Locator (the harness's dispatcher LLM
locates the right MODULE ENTRYPOINT by signature match against
preloaded descriptions).

WHEN: any DISCOVERY-mode skill. The user does not name the skill; the
dispatcher infers it from the user's turn.

MECHANISM: at session start, the harness preloads every installed
module's frontmatter description. On each user turn, the dispatcher
chooses (probabilistically) which description best matches the
request and invokes that module.

KEY PROPERTY: DESCRIPTION = FUNCTION SIGNATURE. The description names
trigger nouns and verbs, the boundary, and the intended caller. It is
not marketing copy.

ANTI-PATTERN: DISPATCH COLLISION -- two installed modules with
overlapping descriptions. The dispatcher guesses; ~half of misses go
silent. HIGH severity finding in any review.

---

## C5. PERSONA PROTOTYPE

CLASSICAL ANALOG: Prototype.

WHEN: you need several persona variants that differ only in narrow
parameters (lens severity, output format, audience). Writing N near-
duplicate persona files duplicates the maintenance surface.

MECHANISM: one base PERSONA SCOPING FILE captures the shared lens. Each
variant is a thin file that links to the base and overrides only the
delta. At spawn time, the parent loads base + delta into the child
thread.

ANTI-PATTERN: COPY-PASTE PERSONAS -- five persona files with 80% shared
content. The shared text drifts; each lens behaves differently across
runs for unrelated reasons.

---

## C6. EXTERNAL CORPUS GROUNDING

CLASSICAL ANALOG: Dependency Injection from an external service +
versioned read-through cache.

WHEN: an agent must reason over facts that the LLM substrate cannot
hold reliably -- because pretraining is frozen and cutoff-dated
(truth #5), or because the corpus changes faster than any model
release. Examples: a third-party spec, a dependency's current API,
a live repo state, the day's CHANGELOG.

MECHANISM: at the step that needs the fact, the agent fetches it
from a NAMED, AUTHORITATIVE source (URL, doc page, file path, tool
output). The source identifier is captured in the handoff packet
alongside the fetched content. Downstream readers can re-verify by
re-fetching from the same source. The corpus is loaded LAZY (only
at the step that needs it), not eager (at session start).

BOUNDED SCOPE SUB-RULE. Every external grounding declaration MUST
state explicitly what the corpus is authoritative FOR. A spec is
authoritative for its container surface, not for the broader
ontology that wraps it. Importing an external corpus's framing into
questions it does not own is AUTHORITY OVERREACH and is a
HIGH-severity finding in review. Worked example: agentskills.io is
authoritative for the SKILL.md container surface (frontmatter,
body budget, layout, scripts conventions, evals). It is NOT
authoritative for the genesis primitive taxonomy. See
`primitives.md` MODULE ENTRYPOINT for the canonical resolution.

ANTI-PATTERNS:
- STALE-CORPUS RELIANCE -- citing a fact "as of training" without
  fetching from the named source. Truth #5 says you cannot.
- UNVERIFIED CITATION -- naming a source URL but not fetching from
  it. The source is decorative; the fact is still hallucinated.
- AUTHORITY OVERREACH -- expanding the corpus's authority beyond
  what it actually owns; importing its framing into ontology
  questions. The bounded-scope sub-rule exists to prevent this.
- EAGER EXTERNAL FETCH -- preloading a live source at session start
  "in case we need it". Live sources go stale; load lazy.

---

# Structural patterns

How primitives compose at rest. These are SOURCE-TIME relationships,
realized through the module graph (`composition-substrate.md`).

## S1. COMPOSED MODULE

CLASSICAL ANALOG: Composite.

WHEN: a high-order module's behavior is "load these N existing
modules and orchestrate them".

MECHANISM: the orchestrator module declares dependencies on the leaf
modules and loads them at the relevant process step. No content is
duplicated; each leaf evolves independently. See `composition-
substrate.md` for INLINE / LOCAL SIBLING / EXTERNAL MODULE modes.

ANTI-PATTERN: HIDDEN COUPLING -- copying a leaf's content into the
orchestrator instead of depending on it. Drift is guaranteed.

---

## S2. DEPENDENCY ADAPTER

CLASSICAL ANALOG: Adapter.

WHEN: the architect's reasoning depends on an abstract substrate (a
module-system-tool, a harness's runtime affordances) but the concrete
syntax differs across tools / harnesses.

MECHANISM: the architect persona is deliberately ignorant of the
concrete syntax. A separate adapter file (`module-system-adapters/
<tool>.md`, `runtime-affordances/per-harness/<harness>.md`) exposes the
substrate's contract in the tool's own dialect. The coder thread loads
the adapter at codegen time only.

ANTI-PATTERN: LEAKY ABSTRACTION -- the architect persona naming
`apm.yml`, `package.json`, `.cursor/rules`, etc. The reasoning becomes
non-portable; redesigning for a new harness requires editing the
architect.

---

## S3. ORCHESTRATOR FACADE

CLASSICAL ANALOG: Facade.

WHEN: an internally complex multi-step capability needs to be exposed
to the dispatcher as a single callable signature.

MECHANISM: a thin MODULE ENTRYPOINT presents one description to the
dispatcher. Its body sequences the underlying primitives (skills,
personas, threads, gates). Callers see one trigger; behind it lives
a topology.

ANTI-PATTERN: STUB ORCHESTRATION -- the facade only sequences with no
interlock, gate, or synthesis decision. It is a wrapper that adds
nothing; cut it and let callers invoke the primitives directly.

---

## S4. VALIDATION DECORATOR

CLASSICAL ANALOG: Decorator.

WHEN: a procedure produces an artifact whose correctness can be
checked deterministically before downstream steps consume it.

MECHANISM: wrap the producing step with a deterministic gate (linter,
test run, schema validator, checklist invocation). The gate decides
pass / revise. The decorated step keeps its single responsibility; the
decorator owns the verification concern.

ANTI-PATTERN: WRAPPING WITHOUT BLOCKING -- recording violations to a
log without halting. Non-blocking gates degrade to noise.

---

## S5. LAZY PROXY

CLASSICAL ANALOG: Proxy (specifically: virtual proxy / on-demand
materialization).

WHEN: a module references a heavy asset (long worked example, large
ruleset, full per-harness adapter) that should not load until a
specific step needs it.

MECHANISM: the module body holds a relative-path reference; the agent
treats the path as a placeholder and materializes the content only
at the step that consumes it. The reference acts as a stand-in proxy
that defers the real load.

DIFFERENCE FROM C1 (LAZY ASSET): C1 is the creational decision to
package an asset as deferred-load. S5 is the structural shape of the
reference itself -- a placeholder proxy that the runtime materializes
on demand. Both cooperate: declare with C1, reference with S5.

ANTI-PATTERN: PROXY SPRAWL -- pointers to pointers to pointers.
Materialize in a single hop where possible.

ORTHOGONAL TO DISTRIBUTION BOUNDARY: load-on-demand does NOT cross
the distribution boundary. A lazily-loaded asset still ships inside
the module's published bundle; deferring its load only changes when
the agent reads it, not whether it is packaged. For the orthogonal
question of WHICH files ship at all, see `composition-substrate.md`
BUNDLE LEAKAGE.

---

## S6. RULE BRIDGE

CLASSICAL ANALOG: Bridge (decouple abstraction from implementation so
both vary independently).

WHEN: many personas share the same hard rules (encoding, secrets,
review etiquette) but each persona has its own voice. Inlining the
rules into every persona couples voice to rules; updating one rule
requires editing N persona files.

MECHANISM: extract the rules into SCOPE-ATTACHED RULE FILEs. The
runtime auto-loads them on path / context match. Personas now vary
along the LENS axis; rules vary along the CONSTRAINT axis;
neither edits the other.

ANTI-PATTERN: BAKED-IN RULES -- repeating the encoding rule inside
every persona. Drift, then contradiction.

---

## S7. DETERMINISTIC TOOL BRIDGE

CLASSICAL ANALOG: Adapter (GoF) at the language boundary; closer to
a Hardware Abstraction Layer or FFI -- the structured seam between a
high-level, probabilistic caller (the LLM) and a low-level,
deterministic executor (CPU code: CLI, script, MCP server, HTTP API).

WHEN: the design names a CONSEQUENTIAL SIDE EFFECT or a FACT THAT
MUST BE TRUE. Examples: "apply database migration", "delete files",
"read current branch", "post a comment on issue 42", "compute SHA-256
of artifact". Anything where the answer must be the actual answer
(not a plausible answer) and any state change that must actually
happen (not be claimed to have happened).

MECHANISM:

1. NAME THE BOUNDARY. The design explicitly identifies which steps
   are LLM-OWNED (selection, parameter binding, interpretation) and
   which are TOOL-OWNED (execution).
2. PICK THE SUBSTRATE. CLI command, script in a known language
   (python, bash, go, etc.), MCP server, HTTP API. The substrate
   is whatever the harness can already invoke; this pattern does
   not introduce a new runtime.
3. STRUCTURED CONTRACT. Inputs and outputs flow through a typed
   interface (function signature, JSON schema, MCP tool spec). The
   LLM sees the SCHEMA, not the implementation; the implementation
   stays deterministic.
4. INTERPRET, DO NOT EXECUTE. The LLM reads the tool's return value
   and decides what to do next. It does not re-execute the tool's
   logic in prose to "double-check" -- that re-introduces the
   probabilism the bridge removes.
5. PAIR WITH S4 (VALIDATION DECORATOR) WHERE WARRANTED. For
   irreversible side effects, gate the tool call behind a
   deterministic precondition check (also a tool call) and a
   B10 HUMAN CHECKPOINT.

DIFFERENCE FROM S2 (DEPENDENCY ADAPTER): S2 adapts ONE LLM-loaded
module to ANOTHER LLM-loaded module's interface (text-to-text). S7
crosses the LLM/CPU boundary itself (text-to-tool-call-to-CPU-to-
text). They compose: S2 inside the LLM layer, S7 between layers.

DIFFERENCE FROM S6 (RULE BRIDGE): S6 separates voice from constraint
INSIDE the LLM context (both sides are still inferenced text). S7
separates probabilistic reasoning from deterministic execution
ACROSS the runtime boundary.

ANTI-PATTERNS:

- HAND-ROLLED HALLUCINATION. The design declares a side effect
  ("update the deployment manifest") and leaves the LLM to emit the
  edited file as text without invoking the underlying tool (git,
  yq, kubectl). The "execution" is a high-variance regeneration of
  the artifact. Bridge it: the LLM produces parameters; a
  deterministic tool produces the output.
- TOOLLESS ASSERTION. The design depends on a fact ("current branch
  is main", "no migrations pending", "lockfile is up to date") and
  takes the LLM's recall of that fact as authoritative. The fact
  must come from a tool call, not memory.
- OPAQUE TOOL. The bridge exists but the design hides what the
  tool actually does, so reviewers cannot reason about determinism.
  The handoff packet must name the tool, the substrate, and the
  contract.
- TOOL-CALL HALLUCINATION. The LLM emits a tool invocation against
  a tool that does not exist or with parameters outside the
  schema. Mitigation: the harness exposes only declared tools (the
  schema is loaded into context), and S4 validates the parameter
  shape before the call.
- UNGUARDED DESTRUCTIVE TOOL. A bridge to an irreversible side
  effect (DROP TABLE, force push, delete bucket) without a
  precondition tool check AND a B10 HUMAN CHECKPOINT. The bridge
  is deterministic at execution; the SELECTION is still LLM-owned
  and probabilistic. Guard the selection.

SELECTION HEURISTIC: If a design step contains the words "apply",
"delete", "post", "deploy", "compute", "verify", or names a system
of record (db, repo, queue, cluster, file system), it MUST cross
S7. If a design step contains "decide", "compose", "summarize",
"propose", "weigh", it stays in the LLM layer.

EXTENSION PATHS (how the operator widens the bridge):

The harness preloads a primitive tool surface so the LLM is useful
from turn one. The TERMINAL (shell command execution) is the
universal preloaded tool and the most powerful single one, because
the LLM can synthesize ANY command on the fly -- read files, query
state, invoke any installed CLI (`git`, `kubectl`, `gh`, `az`,
`psql`, ...). A skill that needs determinism for a reachable
operation should default to the terminal route before reaching for
heavier extensions.

Operators widen the bridge in three concrete routes; pick the
narrowest one that fits:

1. PRELOADED TERMINAL ROUTE (default). The skill instructs the LLM
   to run a specific command via the harness's shell tool. Fast to
   author, no new infrastructure. Use for: ad-hoc reads, local
   checks, anything an installed CLI already exposes. Costs:
   command output is unstructured text; arguments can drift; safety
   is on the operator (hence S4 + B10 for destructive cases).
2. CUSTOM CLI / SCRIPT / API ROUTE. The operator authors a
   purpose-built executable (python script, shell wrapper, internal
   HTTP endpoint, deterministic calculator) and the skill body
   instructs the LLM to use it with a documented contract.
   Trade-off: more structured than raw shell; lives outside the
   harness's tool registry, so the LLM still emits it as a shell
   invocation. Use when: the operation has a stable contract worth
   naming and reusing across skills.
3. MCP SERVER ROUTE. The operation is exposed by a Model Context
   Protocol server; the harness advertises it to the LLM as a
   first-class tool with a typed schema. Strongest typing,
   discoverable in the harness UI, reusable across harnesses that
   speak MCP. Costs: more infrastructure; appropriate for
   operations consumed by many agents or that need centralized
   policy.

Selection rule: if a preloaded CLI already does it -> route 1. If
an internal contract exists or is worth authoring -> route 2. If
the tool will be reused across skills/harnesses or needs a typed
schema for safe parameter binding -> route 3.

ADDITIONAL ANTI-PATTERN:

- TERMINAL UNDERUSE. The skill describes a check or read in prose
  ("ensure the working tree is clean", "confirm the file exists")
  when a one-line preloaded shell call (`git status --porcelain`,
  `test -f path`) would settle it deterministically. The terminal
  is right there; not using it is the most common form of HAND-
  ROLLED HALLUCINATION.

---

# Behavioral patterns

How primitives interact at run time.

## B1. FAN-OUT + SYNTHESIZER

CLASSICAL ANALOG: Master-Worker (also: map-reduce; thread-pool with
join + reducer).

WHEN: >=3 independent lenses with no shared state, where each lens
benefits from a fresh context window.

MECHANISM: parent spawns one CHILD-THREAD per lens (each loading its
own PERSONA PRELOAD). Each child returns a finding. Parent runs a
synthesis pass (often loading an arbitrator persona) that produces ONE
verdict.

```
parent (orchestrator + synthesizer)
   |
   +-- spawn ---> thread A (lens A) --+
   +-- spawn ---> thread B (lens B) --+
   +-- spawn ---> thread C (lens C) --+
                                      v
                                fan-in to parent
                                      |
                                      v
                                 synthesize -> single output
```

ANTI-PATTERN: FAN-OUT-IN-ONE-CONTEXT -- running all N lenses sequentially
inside a single window. Each lens contaminates the next; later lenses
inherit attention drift from earlier ones.

---

## B2. CONDITIONAL DISPATCH

CLASSICAL ANALOG: Strategy.

WHEN: a single lens, but which procedure runs depends on input
classification.

MECHANISM: parent classifies the input, then loads the matching
procedure (a different persona, a different skill, a different rule
set). Only the chosen branch's text enters context.

ANTI-PATTERN: ALL-BRANCHES-LOADED -- preloading every procedure's text
"in case". Defeats the savings; the unused branches still compete for
attention.

---

## B3. SUPERVISOR

CLASSICAL ANALOG: Mediator (also: actor supervision tree of bounded
depth).

WHEN: a long task with checkpointable subtasks where the next spawn
depends on prior results (dynamic plan).

MECHANISM: a SUPERVISOR thread is the single planner. Workers cannot
spawn peer workers (avoids unbounded fan-out). The supervisor
re-plans after each worker returns.

ANTI-PATTERN: WORKER-SPAWNS-WORKER -- decentralizes planning; tree
depth becomes uncontrolled; supervisor loses oversight.

---

## B4. PLAN MEMENTO

CLASSICAL ANALOG: Memento (capture and externalize state so it can be
restored later).

WHEN: any non-trivial work. Without externalized state, long sessions
silently drop earlier decisions.

MECHANISM: write the plan (goal, decomposition, todos, checkpoints,
acceptance criterion) to PLAN PERSISTENCE BEFORE execution begins.
Reload it at every re-grounding boundary: start of each step, return
from each spawn, after each tool failure.

```
[ planning ]                    [ persistence ]
   decide problem    -->       PLAN ARTIFACT
   decompose         -->       TODO/STATUS
   pick topology     -->       (CHECKPOINT slot)
                                       ^
[ execution ]                          |
   step k starts ---- reload ----------+
      do work
   step k ends ------ update ----------+
      (advance status)
   spawn child? --> child gets POINTER to plan slice
   return from spawn -- reload --------+
```

ANTI-PATTERN: WRITE-ONCE-NEVER-READ -- producing a plan at the start
and never reloading it. The persistence is dead weight without the
reload discipline.

---

## B5. ACCEPTANCE OBSERVER

CLASSICAL ANALOG: Observer (the acceptance criterion observes the
implementation; mismatch raises a finding).

WHEN: any non-trivial work. The cost is one gate; the catch rate is
high (drift accumulates silently throughout execution).

MECHANISM: at the END of the work, RELOAD the acceptance criterion
from PLAN PERSISTENCE. Without re-reading the implementation, list
what the criterion demands. THEN compare against the implementation.
Mismatch = drift. The reverse direction matters: reading the
implementation first biases the gate to approve.

ANTI-PATTERN: ACCEPTANCE-DRIFT -- silently editing the criterion mid-
work to match the emerging result. The criterion is now a description,
not a test. Pin it; only revise via an explicit re-plan event.

---

## B6. PROMPT TEMPLATE

CLASSICAL ANALOG: Template Method (define the skeleton; subclasses
fill in specific steps).

WHEN: many similar capabilities follow the same skeleton (preamble,
context loading, body, output schema, sign-off) but differ in narrow
slots (the lens, the target artifact, the acceptance criterion).

MECHANISM: extract the skeleton into a shared asset (often a PERSONA
SCOPING FILE or a rule file). Each capability supplies only the
slot-specific content. The template guarantees structural consistency;
the slots carry the specialization.

ANTI-PATTERN: TEMPLATE-DRIFT -- each capability re-invents the
skeleton with cosmetic variations. Integrators cannot rely on the
output shape.

---

## B7. TODO COMMAND

CLASSICAL ANALOG: Command (encapsulate intent as an object that can
be queued, replayed, undone).

WHEN: a plan decomposes into discrete units of intent that the agent
will execute over many turns and possibly across spawns.

MECHANISM: each todo carries: id, title, description, status,
optionally a staffed persona / skill, optionally dependencies on
other todos. The agent updates status as it works (pending ->
in_progress -> done | blocked). The serialized todo IS the command;
the executor is its handler.

KEY PROPERTY: a todo is dispatchable. A todo with `staff: persona-X`
or `skill: Y` realizes STAFFED PLAN (Tier 3 architectural pattern).

ANTI-PATTERN: GHOST TODOS -- creating todos and never updating their
status. The plan and the executor diverge; recovery requires re-deriving
state from artifacts.

---

## B8. ATTENTION ANCHOR

CLASSICAL ANALOG: NONE. This pattern has no faithful classical
counterpart -- it is induced by LLM physics (attention decay over
distance / over turns) rather than by software-engineering structure.
It is, however, the single most important behavioral pattern for any
non-trivial agent task.

WHEN: any session that will exceed roughly a few dozen turns, or any
plan whose acceptance criterion / hard constraints were established at
turn 0 and must still hold at turn N. Long-running tasks WITHOUT
periodic re-injection of the goal and hard constraints DRIFT silently
from initial intent. This is the dominant failure mode of agentic
work past trivial scope.

MECHANISM: the goal, the hard constraints, and the acceptance criterion
are RE-INJECTED into context at scheduled boundaries:

- start of every meaningful step,
- before any spawn,
- after any spawn returns,
- after any tool failure or error recovery,
- at any natural pause in execution.

The re-injection draws from PLAN MEMENTO (B4) -- the anchor's source
of truth lives outside the context window so it cannot itself decay.

```
turn 0    [GOAL + CONSTRAINTS injected, fresh context]
   |
turn 5    do work...
   |
turn 10   <-- re-inject GOAL + CONSTRAINTS from plan
   |
turn 15   do work, spawn child
   |
turn 16   <-- re-inject before spawn (child gets anchor in its task)
   |
turn 20   spawn returns
   |
turn 21   <-- re-inject after spawn (parent recovers focus)
   |
turn 30   acceptance check (B5 reads the same anchor)
```

COMPOSES WITH:
- PLAN MEMENTO (B4) is the storage substrate.
- ACCEPTANCE OBSERVER (B5) reads the same anchor at the end.
- SUPERVISOR (B3) re-injects the anchor on every dynamic re-plan.

ANTI-PATTERNS:
- ANCHOR DRIFT -- silently rewriting the anchor mid-session to match
  emerging results. The anchor is now a description, not a constraint.
  Only revise via an explicit re-plan event (mirror of ACCEPTANCE-DRIFT).
- OVER-ANCHORING -- re-injecting the entire plan on every turn. The
  anchor is meant to be the GOAL + the hard constraints, not the full
  plan body. Re-injecting too much defeats the savings of the original
  decomposition.
- IMPLICIT-ANCHOR -- assuming the model "remembers" the goal because
  it was stated at turn 0. Attention decays over distance; the early
  tokens lose influence. Explicit re-injection or no anchor.

WHY THIS IS FIRST-CLASS. Every other behavioral pattern assumes the
agent stays aligned with the original intent across the work. Without
ATTENTION ANCHOR, that assumption is false on any task long enough
to matter. It is the cure for the deepest LLM failure mode in
multi-step execution.

---

## B9. GOAL STEWARD

CLASSICAL ANALOG: Mediator + intent-validator (a dedicated role whose
sole job is to assert "are we still solving the original problem?").

WHEN: a multi-round or multi-wave plan where the goal is at risk of
silent reinterpretation as new findings, persona votes, or sub-results
accrete. The PANEL (A1) and ALIGNMENT LOOP (A8) shapes are typical
hosts.

MECHANISM: a dedicated thread (a CEO/steward persona) holds the
canonical goal statement and the success criteria. At each gate, the
steward compares the proposed next step against the goal, names the
delta, and either approves, requests refinement, or escalates. The
steward IS the alignment authority; specialist lenses do not arbitrate
their own contributions.

ANTI-PATTERNS:
- MOVING-GOALPOST STEWARD -- the steward edits the goal mid-flow to
  match emerging findings. The goal is not fixed; nothing is aligned.
  If the goal genuinely needs to change, escalate to the human
  (B10 HUMAN CHECKPOINT) and freeze the new goal explicitly.
- RUBBER-STAMP STEWARD -- the steward approves every proposal without
  citing the success criteria. The role is decorative.
- STEWARD WITHOUT ARTIFACT -- the goal lives in chat history, not in
  a persisted artifact (B4 PLAN MEMENTO). Attention drift erases it.

WHY THIS IS FIRST-CLASS. Long-running tasks drift from initial goals
without an explicit steward. The steward is the named owner of
"alignment to original intent" -- without a named owner, alignment is
no one's job. This pattern is the procedural counterpart to the B8
ATTENTION ANCHOR token-budget cure.

---

## B10. HUMAN CHECKPOINT

CLASSICAL ANALOG: Approval Gate + manual override in a workflow
engine.

WHEN: a step is irrecoverable, expensive, or requires authority the
agent does not have. Common examples: shipping a release; merging to
main; deleting persistent state; making any decision that the agent's
self-confidence cannot resolve (drift detection; suspected
hallucination; tie between equally-fit patterns).

MECHANISM: the procedure halts at a named checkpoint. The agent emits
a structured prompt to the human (current state, options, recommended
choice with rationale, escape hatches). Execution does not resume
until the human responds. The response IS the gate verdict.

ANTI-PATTERNS:
- SILENT DRIFT -- the agent suspects misalignment but powers through
  rather than checkpointing. The checkpoint is the cure for
  self-conscious drift; using it is the discipline.
- CHATTY GATE -- checkpointing on every minor decision. Floods the
  human and trains them to rubber-stamp. Reserve for the real
  irrecoverables.
- FALSE-CHOICE GATE -- presenting options that all lead to the same
  outcome; the human's input does not change behaviour.
- POST-HOC CHECKPOINT -- asking the human to approve a step the
  agent already executed. Not a checkpoint; a notification.

WHY THIS IS FIRST-CLASS. Hallucination is inherent (truth #4). When
the agent itself suspects fabrication or unbounded scope creep, only
an external authority can break the loop. The HUMAN CHECKPOINT is
the explicit escape hatch named in the architecture, not an ad-hoc
rescue.

---

## B11. FOLD-BY-DEFAULT

CLASSICAL ANALOG: "Defaults Matter" / "Pit of Success" (Brad Abrams,
.NET Framework Design Guidelines, 2004); the SRE error-budget
posture of "burn the budget on prevention, not on deferring follow-
ups" (Beyer et al., _Site Reliability Engineering_, O'Reilly 2016,
ch. 3 on error budgets).

WHEN: a loop or queue where each iteration surfaces follow-ups
(recommended next actions, panel-suggested edits, deferred review
comments, secondary findings). Without a default policy, follow-ups
accumulate in an external backlog and the loop is judged "done"
while real work remains.

MECHANISM: declare the default disposition for follow-ups at the
queue / loop boundary. The default is FOLD: re-enter the loop with
the follow-up as a new item (or as an addition to the current
item's todo). The exception is DEFER, taken only when the follow-
up violates a named queue invariant (out-of-scope per the queue
charter, requires authority the loop does not hold, irrecoverable
side effect outside the loop's mandate). DEFER REQUIRES A
DESTINATION (an external queue, a tracked issue) -- never a
recommendation in prose.

The pattern is the procedural counterpart to the cybernetic
principle that a control loop's job is to drive the error to zero
IN-LOOP, not to log the error for someone else.

ANTI-PATTERNS:
- DEFER-BY-DEFAULT -- the loop emits a "recommended follow-up"
  section and ships. The follow-ups never re-enter; the backlog
  grows; the next sweep starts further behind. The most common
  failure mode of operator-shaped loops without a named policy.
- INVARIANT-LESS FOLD -- folding every follow-up, including ones
  that violate scope or authority. The loop grows unbounded; the
  charter erodes; the operator who chartered the queue cannot
  recognize what the loop is doing. Fold-by-default still requires
  a named invariant that gates DEFER.
- IMPLICIT DEFER -- a follow-up is "noted" in prose without a
  destination. Equivalent to no follow-up at all.

WHY THIS IS FIRST-CLASS. The default policy IS the control surface
for an operator-shaped loop. Without it, the loop's authority over
its own follow-ups is undeclared; every iteration re-litigates
fold-vs-defer on individual judgement, which drifts. Pair with B4
PLAN MEMENTO: the state table records each follow-up's disposition
(folded / deferred / where). Pair with A11 RECONCILIATION LOOP:
B11 is the queue-level policy that makes A11's queue drain rather
than grow.

---

## B12. MODEL ROUTER

CLASSICAL ANALOG: Strategy pattern (GoF) -- select algorithm at
runtime; Content-Based Router (Hohpe & Woolf, _Enterprise
Integration Patterns_, Addison-Wesley 2003).

WHEN: a workflow has heterogeneous sub-tasks where one role class
(see `runtime-affordances/model-catalog.md`) clearly fits some
sub-tasks and a different role class clearly fits others. Default
case: a cheap trivial-class classifier in front of a planner/
implementer/reviewer fan-out so the expensive class only runs on
work that actually needs it.

MECHANISM: declare role class per module (not per concrete model)
at design time. Place a router step (typically trivial-class) that
inspects each incoming item and decides which downstream role
class handles it. The router's output is a routing decision, not
the answer. The per-harness adapter binds role class to concrete
model name at codegen time.

The router itself MUST be lightweight: planner-class routers eat
the savings. The typical break-even is a router that costs less
than 5% of the most expensive downstream call.

SELECTION RULE (apply BEFORE writing any concrete `model:` field;
this rule decides whether to bind at all):

1. Identify the HARNESS DEFAULT role class for the primitive type
   that will carry the work. Consult the adapter's "default role
   class per primitive type" table (e.g. `per-harness/copilot.md`
   section "Default role class per primitive type"). The harness
   default is NOT always the session model -- on some harnesses,
   subagent spawn types (e.g. Copilot CLI's `task(agent_type=
   'explore')`) default to a CHEAPER role class than the session
   model. Without this lookup the architect cannot reason about
   binding direction.

2. Identify the REQUIRED role class for this work (planner /
   researcher / implementer / reviewer / trivial / long-context-
   retriever / safety) per the rubric in `model-catalog.md`.

3. Decide binding action. The default is BIND EXPLICITLY -- it
   gives PREDICTABILITY, PORTABILITY, and AUDIT TRAIL. OMIT is
   the exception, not the rule.

   - DEFAULT < REQUIRED   -> BIND UP for STAKES. Declare the
     higher role class explicitly. Cost increase is justified
     by the quality requirement. Cite the stakes in the handoff.
   - DEFAULT == REQUIRED  -> BIND EXPLICITLY at the matching
     role class. Two reasons this is the right move even though
     the cost is identical to OMIT:
       (a) PORTABILITY -- the same design will route differently
       on harnesses where defaults diverge; explicit binding
       insulates the design from default drift.
       (b) PREDICTABILITY -- the operator can read off "this lens
       will run at trivial class" from the design alone, without
       cross-referencing the harness adapter's default table.
       Profiling and capacity planning become possible at design
       time, not after the first run.
     OMIT is only acceptable when (i) the primitive type CANNOT
     carry `model:` on the target harness (e.g. SKILL.md on
     Copilot CLI inherits session default by spec; see WRONG-
     PRIMITIVE BINDING anti-pattern), or (ii) the skill is
     declared single-harness AND has no audit / portability
     requirements AND the operator accepts default drift as a
     known risk.
   - DEFAULT > REQUIRED   -> BIND DOWN for ECONOMY. Declare the
     cheaper role class explicitly. Cost reduction IS the
     benefit. This is the most common B12 use case in practice
     (because reviewer/planner-class session defaults are
     common while most fan-out work is trivial-class).
   - PORTABILITY required across harnesses with different
     defaults -> BIND explicitly so the choice survives
     adapter swap.
   - OPERATOR ECONOMIC BIAS = MAX_QUALITY -> tolerate more
     binding-up where role-class need is uncertain; MAX_ECONOMY
     -> bind down aggressively where the failure mode is
     tolerable; BALANCED (default) -> bind to the CHEAPEST role
     class that meets the cited requirement.

CONSEQUENCE: see anti-patterns below for shape-detection
(ZERO explicit bindings = ZERO-EXPLICIT, all-bound-up =
BIND-UP-WITHOUT-JUSTIFICATION). Healthy shape: most elements
bound DOWN from session default to the cheapest role class that
meets need, a few bound UP only where cited STAKES require it.

ANTI-PATTERNS:
- HARDCODED MODEL NAMES in the design. Models age out; the
  catalogue should reference role classes only. (Concrete names
  live in per-harness adapters with date stamps.)
- ROUTER-AS-PLANNER. The router started as a classifier and grew
  into a small planner; it now eats the savings of routing. Split
  back into a classifier (trivial) and a downstream planner if
  planning is genuinely needed.
- ROUTING ON DATA SIZE ONLY. Token count is a weak proxy for
  capability need. Route on the work's CAPABILITY PROFILE (does
  this need a planner? a long-context retriever? a trivial
  classifier?), not just length.
- MID-SESSION MODEL SWITCH inside the SAME thread without naming
  it as a cache invalidator. Provider caches partition by model;
  switching mid-session bills the next turn at fresh-input rates.
- WRONG-PRIMITIVE BINDING -- declaring `model:` on a primitive
  whose harness frontmatter does not accept it (the field is
  silently ignored). The architect believes B12 is firing but
  every agentic element still bills against the session default.
  This is what happened in PR #12's Executor B run on Copilot CLI:
  the design declared role classes per element but the binding
  fell back to the session model because the per-element binding
  site on Copilot is `.agent.md` frontmatter, NOT SKILL.md
  frontmatter. Cure: consult the per-harness adapter (section
  "BINDING SITE" / "Cost-pattern bindings") at step 7b to
  confirm WHICH primitive type carries the `model:` field on the
  target harness; restructure the unit of work to use that
  primitive type if it is currently held by another.
- BIND-UP-WITHOUT-JUSTIFICATION -- declaring `model:` at a HIGHER
  role class than the work requires, without citing a STAKES
  reason. The architect believes "more capable model = safer
  design"; in practice this is just paying more for capability
  that the work cannot use. PR #12's empirical A/B (Cell E v0.3.1)
  measured this directly: 4 lens agents bound to reviewer-class
  (claude-sonnet-4.6) when the lens work was trivial-class
  (single-pass checklist grading over a finite diff window with
  no cross-file reasoning). Result: +25% TOTAL run cost vs the
  v0.1 baseline with ZERO quality delta on the bound lenses.
  Cure: cite the role-class requirement explicitly in the handoff
  packet. Every BIND-UP must name the STAKES (security-critical,
  irreversible side effect, cross-file reasoning required,
  multi-step planning required). If the cite is "to be safe" or
  "in case it's hard," it's bind-up without justification and
  should be demoted. VARIANT -- BULK IDENTICAL BINDING: copy-
  pasting the same `model:` across many primitives without per-
  element role-class distinction. The pattern fires in BOTH
  directions: bulk-UP (every `.agent.md` gets `claude-sonnet-4.6`
  as a template default) AND bulk-DOWN (every panel lens gets
  `claude-haiku-4.5` because the first lens warranted trivial-
  class so "they're all trivial"). The cost-direction does not
  determine whether it is an anti-pattern; the LACK of per-element
  reasoning does. The cure is the PER-ELEMENT CAPABILITY PROFILE
  enumeration: for each primitive, name (a) does the work need
  cross-file / multi-file reasoning? (b) does the output carry
  STAKES (consequential write, security finding, irreversible
  side effect)? (c) does the work require multi-step proof rather
  than pattern matching? Record the answers in the handoff packet
  next to the bound class. Identical bindings are LEGITIMATE if
  every element's profile genuinely matches; ILLEGITIMATE if the
  enumeration was skipped. Common case in PANEL fan-outs: 3-4
  lenses are TRIVIAL (style, lint-grep-class correctness, basic
  test-coverage parse) but security and depth-of-coverage often
  warrant REVIEWER class. See architectural-patterns.md §A1
  PANEL UNDIFFERENTIATED LENS BINDING for the panel-specific
  enumeration step.
- ZERO-EXPLICIT -- the entire design carries zero `model:`
  declarations and relies on harness defaults. Predictability
  evaporates the moment a default shifts (across harness version
  or across harnesses); the operator has no contract to read.
  Cure: bind explicitly per SELECTION RULE rule 3.

---

## B13. CACHE-AWARE PREFIX

CLASSICAL ANALOG: Cache-Aside / Read-Through cache; Append-Only
Log (write-once history that downstream readers cache).

WHEN: any workflow that runs more than two turns OR loads a
sizeable persona / skill body / rule file / project corpus into
its prefix. Cache-aware prefix design IS the single largest cost
lever on modern providers (provider-cached read tokens are
typically billed at 10% of fresh-input rate).

MECHANISM: structure the prompt so the STABLE bytes precede the
VARIABLE bytes. Place provider cache breakpoints (see
`assets/token-economics.md` concepts 4-5) so the largest stable
region sits below the lowest breakpoint and is reused across the
entire session.

Audit, at design time, for cache invalidators:
- TIMESTAMPS in the system prompt or persona body.
- TOOL CATALOGUE that grows mid-session (MCP server additions).
- MODEL SWITCH within a session (B12 + B13 interact: route at
  the START of the work, not mid-flight).
- EFFORT/THINKING-BUDGET change mid-session.
- EDITS to project rule files mid-session.
- COMPACTION (the harness rewrites the prefix; cache misses).

ANTI-PATTERNS:
- TIMESTAMPED PERSONA -- the persona body includes "current
  date: ..." and invalidates on every new day's first turn.
  Move dynamic facts to the variable suffix or a tool call.
- TOOL CATALOGUE BLOAT then prune mid-session -- adds tools to
  the prefix on every turn or removes them at turn N. Either
  decide the tool set up front, or use B14 TOOL SUBSET.
- IGNORED COMPACTION SIGNAL -- the design assumes the prefix
  is stable but the harness compacts on its own schedule. Honor
  ATTENTION ANCHOR (B8) and PLAN MEMENTO (B4) so the next turn
  can re-derive state cheaply if compaction breaks the cache.

---

## B14. PROMPT THRIFT

CLASSICAL ANALOG: Strunk & White "omit needless words"; Code
minification with semantic preservation.

WHEN: a primitive's body has been drafted to be PROSE-COMPLETE
and now needs to be shipped at scale. Or a long-running session
shows a clear pattern of recurring prefix bloat (verbose persona,
redundant examples, multi-paragraph rationale where two lines
suffice).

MECHANISM: at the validation step (step 8), apply a pass that
preserves SEMANTIC payload while reducing TOKEN payload:
- Replace prose enumerations with tables where structure permits.
- Replace "if/then/else" prose with rule lists.
- Cut polite scaffolding ("In this section we will explore...")
  with no semantic content.
- Inline rare conditionals; load-trigger them only if they grow.
- Where an example is one of many similar shapes, keep the
  shortest and link to a `references/<topic>.md` for the rest.

The pass MUST preserve test outcomes: re-run the content evals
after thrift. If the value delta from step 6 narrows, revert.

ANTI-PATTERNS:
- AGGRESSIVE THRIFT -- compression past the point where the
  prose still teaches; the persona becomes pattern-match-only
  instructions that fail under task drift.
- THRIFT WITHOUT EVALS -- compression that visibly preserves
  semantics under reading but breaks the model's behavior; the
  model's reading was thinner than the human's reading. Always
  re-run the content evals.
- THRIFT IN PLACE OF DESIGN -- shrinking a primitive that should
  have been R1 SPLIT. The body shrinks but its single
  responsibility is still violated; the thrift just hides it.

### B14b. CAVEMAN BRIEF (sub-pattern of B14)

CLASSICAL ANALOG: telegraphic register; signal-flag protocols;
controlled natural language (per arXiv 2604.00025: brevity
constraints can improve task fidelity by ~26pp on inverse-scaling
tasks).

WHEN: a TRIVIAL-class lens dispatch (see model-catalog.md) whose
output is a fixed schema -- typically {verdict, rationale} or
{category, evidence}. Severity classifiers, label-set pickers,
dup-check oracles, missing-info gates, style-only diff scans all
fit. Use also for any FIXED-SCHEMA REVIEWER lens whose work is
classification-shaped (judgement compressed into the schema, not
into the prose).

MECHANISM (canonical drop list + preservation contract):

DROP from briefs and receipts:
- articles: a, an, the
- filler: just, really, basically, actually, simply, essentially,
  generally
- pleasantries: sure, certainly, of course, happy to, I'd recommend
- hedging: likely, possibly, it might be worth, you could consider,
  it would be good to
- connective fluff: however, furthermore, additionally, in addition
  (when nonessential)
- redundant phrases: "in order to" -> "to"; "make sure to" -> "ensure";
  "the reason is because" -> "because"

PREFER:
- short synonyms: "big" over "extensive", "fix" over "implement a
  solution for", "use" over "utilize"
- fragments over full sentences
- arrows for causality (X -> Y)
- equations for state (inline_obj_prop = new_ref = re-render)
- pattern: [thing] [action] [reason]. [next step].

PRESERVE EXACT (caveman MUST NOT rewrite):
- fenced code blocks (byte-identical)
- inline code (backtick contents)
- file paths, URLs, command lines
- API names, library names, protocol names, algorithm names
- error strings (quote verbatim)
- numbers, version numbers, dates, env vars (NODE_ENV, $HOME, ...)
- proper nouns (project / person / company)
- markdown structure: headings (count + order), bullet count,
  numbering, tables, frontmatter
- JSON / YAML / SQL / shell content (skip — caveman is for prose
  only)

INTENSITY LEVELS (map to artifact tier):
- LITE: drop filler/hedging/pleasantries; keep articles + grammar.
  Use for SHORT_PROSE briefs to REVIEWER-tier sub-agents.
- FULL: drop articles too; fragments OK; short synonyms.
  Use for TRIVIAL-tier classifiers with single-anchor schemas.
- ULTRA: arrows + equations + symbol-heavy; max compression.
  Use for receipt schemas (already JSON; no further prose).

ROLE-MODE PERSISTENCE: the brief MUST instruct the sub-agent to
"RESPOND CAVEMAN until done" so receipts come back compressed.
Without role-mode persistence, brief savings are erased by verbose
returns.

ANCHOR (mandatory): one grounding line for the highest-risk bucket
to neutralize over-escalation drift. Example:
"ANCHOR: blocker = RCE / data-loss / full-outage only."

AUTO-CLARITY EXCEPTIONS (drop caveman, return to normal):
- security warnings (do not telegraph "rm -rf safe")
- irreversible operations (deletions, force-pushes, prod migrations)
- ambiguous multi-step where omitted words risk misread
- user-confusion risk (the receiver is human, not subagent)
Resume caveman after the clarified part.

OUTPUT MODE CONTRACT: every brief ends with the schema-only
instruction: "OUTPUT JSON ONLY: {schema}. NO PROSE OUTSIDE JSON."
For non-classifier lenses where prose IS the output, replace with:
"RESPOND CAVEMAN-FRAGMENT. ONE FINDING PER LINE."

MEASURED EFFECT (severity-keyword lens, haiku-4.5, 8-issue fixture,
16 dispatches): 44.6% input-token saving, 75% verdict agreement
with verbose brief, ZERO downward errors (both disagreements were
upward escalations safer than the verbose verdict). Source:
dev/empirical-proof/scenario-runs/results/B-pat-B14-caveman/
cost-report.json.

GATE: TRIVIAL or fixed-schema REVIEWER only. Open-ended REVIEWER+
needs the prose context; caveman compression collapses
multi-dimension judgement into the model's prior.

SEE ALSO: B14c CAVEMAN CHANNEL for the orchestrator-side enforcement
on internal traffic; composition-substrate.md §7 AUDIENCE BOUNDARY
for the substrate concept; pattern-tradeoffs.md §11 for the
audience matrix.

ANTI-PATTERNS:
- CAVEMAN ON REVIEWER (preserved from v0.3.6) — compressing a brief
  whose lens must weigh trade-offs across multiple dimensions. The
  output schema may still be a tag, but the reasoning behind it is
  not classification; it is judgement. Caveman compression collapses
  that judgement into the model's prior.
- CAVEMAN ON EXTERNAL (new) — applying caveman to a user-facing
  artifact (PR description, README, advisory). Compromises
  readability; user is not a subagent.
- ROGUE PROSE IN BRIEF (new) — architect copies HUMAN_RATIONALE
  block into the spawn brief. The subagent ingests 5-15K tokens of
  decision rationale that does not change its work. Defeats B14b
  entirely. Cure: SPAWN_BRIEF block must be self-contained.
- VERBOSE RECEIPT (new) — brief is caveman but no role-mode
  instruction; subagent returns prose. Cure: every brief ends with
  "RESPOND CAVEMAN" + schema directive.

### B14c. CAVEMAN CHANNEL (sub-pattern of B14)

CLASSICAL ANALOG: protocol layering — different wire format on
internal hops vs external presentation; cf. backend-for-frontend.

WHEN: a workflow spawns ≥1 task() and emits ≥1 user-facing artifact.
B14c orchestrates the AUDIENCE BOUNDARY (composition-substrate §7)
across the workflow: every internal hop uses caveman; the
synthesizer decompresses to normal prose at the user-facing edge.

MECHANISM:
1. Architect splits every handoff into HUMAN_RATIONALE (kept in
   handoff.md, never copied) + SPAWN_BRIEF (caveman, copied to
   task() prompt).
2. Every SPAWN_BRIEF declares a matching RECEIPT_SCHEMA.
3. Subagents receive role-mode-caveman briefs; return caveman
   receipts.
4. Synthesizer (REVIEWER+ tier) ingests receipts, decompresses to
   normal prose for the EXTERNAL artifact.

DECLARATION (architect-side): every spawn in the handoff packet's
PER-SPAWN DECLARATION TABLE names {Audience, Tier, Brief mode,
Receipt mode, Justification}. Audience=INTERNAL with Brief
mode=NORMAL fails review unless the Justification cites a canonical
auto-clarity exception (security/destructive/irreversible/
ambiguous).

GATE: PANEL (A1) and PIPELINE (A3) workflows with ≥3 spawns benefit
most. Single-spawn workflows still apply B14b on the lone brief but
do not gain channel-level synthesis amortization.

MEASURED EFFECT: projected on S1-shape (9 spawns, multi-lens
panel): ~43K input + ~14K output tokens saved per run; ~$0.34
uncached. See dev/empirical-proof/REAL-TELEMETRY-RESULTS.md "Flaw
3" and v0.3.7 design plan §3.

ANTI-PATTERNS:
- AUDIENCE BLEED (cross-link to composition-substrate §7).
- ROGUE PROSE IN BRIEF (cross-link to B14b).
- DECOMPRESSION SKIPPED — synthesizer emits caveman to user. Cure:
  synthesizer's external-artifact contract names "NORMAL prose,
  full grammar".
- CAVEMAN-WITHOUT-SCHEMA — subagent told to respond caveman but
  given no output schema. Returns terse-but-unstructured findings
  the synthesizer cannot parse. Cure: every brief pairs with a
  RECEIPT_SCHEMA.

---

## B15. TOOL SUBSET

CLASSICAL ANALOG: Interface Segregation Principle (Robert C.
Martin, _Agile Software Development_, Prentice Hall 2002);
Facade pattern (GoF) over a wide API surface.

WHEN: the primitive runs against a tool surface with more tools
than this primitive actually uses (typical of harnesses with
many MCP servers loaded). Every tool definition consumes prefix
tokens AND distracts the model on tool-choice turns (longer
tool list -> more wrong tool calls -> more turns).

MECHANISM: declare, at the primitive's distribution surface,
the SUBSET of available tools this primitive expects. The
runtime is responsible for presenting only that subset to the
model during this primitive's invocation. Two general approaches
(both substrate-level, both portable):

- ALLOWLIST: name the tools this primitive may call.
- CAPABILITY GROUP: name a labeled capability (e.g. "git",
  "github-api"); the runtime expands to the tools in that
  group.

When the underlying primitive operation is a sequence of
deterministic steps that could ALL run in one tool call, prefer
S7 DETERMINISTIC TOOL BRIDGE: ship a single CLI / script / API
endpoint that does the work, and present ONE tool instead of
many. This is the strongest form of tool subset and the largest
cost saver (the model emits one tool-call turn, not N).

ANTI-PATTERNS:
- IMPLICIT FULL SURFACE -- the primitive does not declare a
  subset and inherits the harness's full tool catalogue every
  turn. Cost grows with every new MCP server the operator
  installs.
- LEAKY SUBSET -- the primitive declares a subset but its body
  prose names other tools, leading the model to try to call
  unavailable tools and retry. Subset + body must match.
- SUBSET CHURN MID-SESSION -- adding or removing tools across
  turns. Each change is a CACHE INVALIDATOR (B13). Decide the
  subset at primitive entry and hold it.
- WRONG-PRIMITIVE BINDING -- declaring `tools:` on a primitive
  whose harness frontmatter does not accept it (silently ignored).
  Same failure mode as B12 WRONG-PRIMITIVE BINDING. Cure: consult
  the per-harness adapter to confirm which primitive type carries
  the `tools:` (or equivalent) field; restructure the unit of
  work to that primitive type if needed. On Copilot, the binding
  site is `.agent.md` frontmatter; SKILL.md does not accept
  `tools:`.

---

## B16. EFFORT GOVERNOR

CLASSICAL ANALOG: Quality-of-Service throttle; thread priority
class; budget annealing in optimization.

WHEN: the harness exposes a reasoning-effort or thinking-budget
knob (Anthropic extended thinking; OpenAI reasoning effort;
similar on other providers). Without a governor, the model
defaults to the harness's default effort regardless of the
task's actual difficulty -- often paying for thinking on
trivial classification, or starving long-horizon planning of
budget.

MECHANISM: at the primitive's design surface, declare the
expected effort level per role class:
- trivial role class -> minimum or none.
- reviewer role class -> low (the rubric does the heavy lifting).
- implementer role class -> low to medium.
- long-context-retriever role class -> low (retrieval, not
  reasoning).
- planner role class -> medium to high, depending on the
  decision's blast radius.
- researcher role class -> high to xhigh. Researcher's defining
  capability IS open-ended reasoning; effort suppression defeats
  the binding. Reserve for the narrow trigger where the work
  genuinely lacks a rubric and lacks a plan.

The per-harness adapter binds the abstract level to the
provider's concrete knob (e.g. `reasoning_effort=low`,
`thinking_budget_tokens=4096`). The architect declares INTENT,
not knob values.

ANTI-PATTERNS:
- MAX-EFFORT EVERYWHERE -- the design declares maximum effort
  for every step because "more thinking is better". Thinking
  tokens bill at output rates and dominate spend. Reserve max
  effort for the steps whose failure mode is "wrong plan", not
  for the steps whose failure mode is "minor edit miss".
- EFFORT-AS-QUALITY-PROXY -- raising effort to mask a missing
  C6 EXTERNAL CORPUS GROUNDING or a missing S4 VALIDATION
  DECORATOR. Effort buys thinking, not facts and not gates.
- MID-SESSION EFFORT CHANGE -- some providers partition cache
  by effort level. Changing mid-session is a CACHE INVALIDATOR
  (see B13).

---

## Selection heuristic

When in doubt, prefer the pattern that minimizes context degradation
in any one thread.

```
1 lens, 1 procedure                        -> single sequential
                                              (no Tier-2 pattern needed)

>=3 independent lenses, no shared state    -> B1 FAN-OUT + SYNTHESIZER

procedure depends on input class           -> B2 CONDITIONAL DISPATCH

long task, dynamic plan                    -> B3 SUPERVISOR

verifiable artifact between steps          -> S4 VALIDATION DECORATOR

multi-step / multi-file / spawn-bound      -> B4 PLAN MEMENTO (always)
                                              + B8 ATTENTION ANCHOR (always)

ANY work past trivial scope                -> add B5 ACCEPTANCE OBSERVER
                                              and B8 ATTENTION ANCHOR

multi-round plan with risk of goal drift   -> add B9 GOAL STEWARD

irrecoverable step / suspected drift       -> add B10 HUMAN CHECKPOINT

loop or queue surfaces follow-ups          -> add B11 FOLD-BY-DEFAULT
(declare fold-or-defer policy at boundary;    (default FOLD; DEFER only
defer requires a destination, not prose)      on named invariant violation)

facts depend on external corpus or live    -> add C6 EXTERNAL CORPUS
state; or pretraining-cutoff sensitive        GROUNDING (lazy, bounded)
```

B4, B5, and B8 are orthogonal to topology choice. B9 layers on top of
any multi-thread plan; B10 layers on top of any irrecoverable boundary;
B11 layers on top of any loop or queue that surfaces follow-ups;
C6 layers on top of any work that touches external facts. Combine them
with whichever creational / structural / behavioral patterns shape the
work.

When two or more patterns from this catalogue fit the same slot,
consult `pattern-tradeoffs.md` and cite the matrix that cut your
choice in the handoff packet.

---

## Cross-tier hooks

- Tier-3 architectural patterns (`architectural-patterns.md`) are
  COMPOSITIONS of these design patterns plus primitives.
- Tier-1 idioms (`runtime-affordances/per-harness/*.md`) realize these
  patterns in a specific harness's syntax. Loaded only at codegen time.
- Refactor patterns (`refactor-patterns.md`) restructure modules at
  source-time -- orthogonal to the runtime topology these design
  patterns describe.
