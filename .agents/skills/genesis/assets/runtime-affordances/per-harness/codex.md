# Per-Harness Adapter: OpenAI Codex CLI

Maps the substrate (../common.md) to Codex CLI's concrete
affordances. Load this file ONLY when a primitive declares Codex
as a target.

Official docs cited:
- https://github.com/openai/codex
- https://developers.openai.com/docs

## 1. PERSONA SCOPING FILE

In Codex CLI: Personas are NOT standalone discrete files.
- Status: not supported
- Closest equivalent: Injected into AGENTS.md as frontmatter or prose
- Notes: Codex reads AGENTS.md wholesale; personas are absorbed into
  its narrative structure, not isolated. No persona-specific fallback.
- Source: https://github.com/openai/codex (no discrete persona format)

## 2. MODULE ENTRYPOINT (SKILL)

In Codex CLI: Skills deploy to .agents/ using agentskills.io SKILL.md
- Status: supported (partial)
- Closest equivalent: SKILL.md + assets/ under .agents/<skill-name>/
- Notes: Codex reads skill entrypoints; lazy asset load is the skill's
  responsibility (Codex does NOT auto-stage assets). Skills are meant
  for declarative task scaffolding, not stateful execution; Codex
  runtime assumes skills are reference material.

## 3. SCOPE-ATTACHED RULE FILE

In Codex CLI: AGENTS.md (industry standard)
- File name: AGENTS.md
- Folder: Project root or nested (Codex auto-discovers up the tree)
- Scope mechanism: Directory hierarchy; rules apply to all work under
  that subtree. Codex scans from pwd upward for AGENTS.md.
- Notes: AGENTS.md is typically generated/composed from upstream
  primitives (e.g. by APM's compiler). Codex reads its content as
  instructions, not metadata.

## 4. CHILD-THREAD SPAWN

In Codex CLI: No first-class child-thread primitive.
- Mechanism: NOT FIRST-CLASS. Codex does not expose a spawn tool or
  Task-like primitive. Sequencing must be handled in the prompt body
  or orchestrated externally (e.g. shell script calling codex multiple
  times).
- Notes: Codex is single-pass. Each `codex exec <prompt>` is a fresh
  session. Parallelism and coordination are not native. For multi-stage
  workflows, layer logic in AGENTS.md or caller orchestration.

## 5. TRIGGER ORCHESTRATOR

In Codex CLI: External orchestration required.
- Mechanism: NO BUILT-IN. Codex is a CLI tool; triggers must be
  managed by the caller (shell, CI/CD, etc). Scheduling is delegated to
  cron, GitHub Actions, or other external orchestrators.
- Notes: Each invocation is a new session. Persistence requires external
  state (env vars, files, git commits). CI/CD workflows orchestrate
  sequences.

## 6. PLAN PERSISTENCE

In Codex CLI: no first-class persistence tooling.
- PLAN slot: workspace file convention (write `plan.md`, re-read
  it); AGENTS.md may hold long-lived constraints but is not a
  session plan
- TODO/STATUS slot: not native; convention is to maintain a
  checklist in `plan.md` itself or in commit messages
- CHECKPOINT slot: not native; commit history is the de-facto log
- FILES slot: working directory
- Notes: Codex deliberately keeps the surface minimal; plan
  persistence is the caller's responsibility. The substrate-
  portable fallback (plan.md + re-read) is the recommended pattern
- Source: TODO: official docs page for Codex CLI session state

## Capabilities Codex CLI lacks (vs substrate)

- PERSONA SCOPING FILE: No isolated persona files. Workaround: embed
  personas in prose within AGENTS.md or load them as context snippets
  in the prompt body.
- CHILD-THREAD SPAWN: No native parallelism or context isolation.
  Workaround: script sequential `codex exec` calls or embed
  sub-task logic in prompt/AGENTS.md and handle errors externally.
- SCOPE-ATTACHED RULE FILE: Scope is implicit (directory hierarchy).
  No explicit scope predicates. Workaround: maintain AGENTS.md at
  appropriate tree levels; Codex will find the nearest one.
- TRIGGER ORCHESTRATOR: No event-based or scheduled triggers. Workaround:
  rely on external shell/CI orchestration.

## Capabilities unique to Codex CLI (beyond substrate)

- GitHub Models Integration: Codex CLI auto-configures free access to
  GitHub Models (gpt-4o-mini) via GITHUB_TOKEN; no OpenAI key required.
- Rust Runtime: Codex is a single Rust binary with no dependencies;
  portable and fast.
- Streamlined CLI: `codex exec <prompt>` or `codex exec <file>` is
  minimal; no agent framework overhead.

## 9. MODEL CATALOG & BILLING (cost-economics)

Maps the abstract role classes in `../model-catalog.md` to concrete
OpenAI SKUs available through Codex CLI and to OpenAI's pricing
surface. The genesis architect designs in role classes; this adapter
binds them at codegen time.

Verified on: 2025-11-14. Always re-verify dollar figures against the
live pricing page before quoting; they age out.

### Role class -> concrete model (defaults)

| Role class             | Default SKU                  | Alternative                       |
|------------------------|------------------------------|-----------------------------------|
| planner                | o3 / o3-pro / GPT-5 (high reasoning) | GPT-5 standard with explicit plan instruction |
| implementer            | GPT-5 standard               | GPT-4.1                           |
| reviewer               | GPT-5 standard / GPT-4.1     | GPT-5 mini for checklist work     |
| trivial                | GPT-4o mini / GPT-5 mini     | (none)                            |
| long-context-retriever | GPT-5 with extended context  | GPT-4.1 with long context         |

### Billing surface

Token pass-through. Per-Mtok rates (OpenAI public API, verified
2025-11-14): consult https://openai.com/api/pricing for the live
table. Reasoning models bill thinking tokens at output rate.

### Cost-pattern bindings

- B12 MODEL ROUTER: configure default model in Codex CLI config;
  per-invocation override via `--model` flag. Cross-model context
  does NOT share cache.
- B13 CACHE-AWARE PREFIX: OpenAI caches prompts longer than 1024
  tokens automatically. Cache reads bill at 50% of input rate (less
  aggressive than Anthropic). Keep persona / skill body STABLE;
  every edit invalidates.
- B16 EFFORT GOVERNOR: declare `reasoning_effort` per invocation
  (`minimal` / `low` / `medium` / `high`). Mid-session effort
  change is a CACHE INVALIDATOR on reasoning models.

### Stance binding

Operator declares stance in the first prompt OR in `~/.codex/config`
as `stance: <value>`. The genesis-architect persona reads it at
step 1.
