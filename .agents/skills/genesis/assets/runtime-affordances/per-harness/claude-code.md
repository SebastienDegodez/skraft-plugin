# Per-Harness Adapter: Anthropic Claude Code

Maps the substrate (../common.md) to Claude Code's concrete
affordances. Load this file ONLY when a primitive declares Claude
Code as a target.

Official docs cited:
- https://docs.claude.com/en/docs/claude-code/overview
- https://docs.claude.com/en/docs/claude-code/sub-agents
- https://docs.claude.com/en/docs/claude-code/skills
- https://docs.claude.com/en/docs/claude-code/memory
- https://docs.claude.com/en/docs/claude-code/settings
- https://docs.claude.com/en/docs/claude-code/hooks

## 1. PERSONA SCOPING FILE

In Claude Code: Subagent configuration file
- File extension: .md (with YAML frontmatter)
- Folder: .claude/agents/ (project-local) or ~/.claude/agents/ (user-global)
- Frontmatter fields: name, description, instructions, model, tools (list of allowed tool names)
- Activation: loaded by Task tool when subagent_type parameter specifies the agent name
- Notes: tool lists are restrictive (only named tools available to this subagent);
  Claude Code model default is claude-opus-4-1. Instructions field mirrors persona
  body concept.
- Source: https://docs.claude.com/en/docs/claude-code/sub-agents

## 2. MODULE ENTRYPOINT (SKILL)

In Claude Code: Agent Skill
- Entrypoint file name: SKILL.md
- Folder: .claude/skills/<skill_name>/
- Frontmatter fields: name, description, allowed_models (optional), allowed_tools (optional)
- Assets: arbitrary files in .claude/skills/<skill_name>/assets/ (markdown, scripts, data files)
- Activation: Claude Code's skill recommender matches description against user request;
  /skill-creator command used to register new skills
- Notes: aligns with agentskills.io registry standard; description-driven matching is the
  primary trigger; skills are loaded into context when recommended
- Source: https://docs.claude.com/en/docs/claude-code/skills

## 3. SCOPE-ATTACHED RULE FILE

In Claude Code: CLAUDE.md (nested memory)
- File name: CLAUDE.md
- Folder: project root, or nested per directory level (~/.claude/CLAUDE.md for user global)
- Scope mechanism: implicit by directory hierarchy; closest CLAUDE.md in tree scope
  applies to work in that subtree
- Notes: no glob predicate in Claude Code; hierarchy is the only scope selector;
  can import external markdown via @path syntax within CLAUDE.md body;
  child CLAUDE.md files override parent rules in same directory subtree
- Source: https://docs.claude.com/en/docs/claude-code/memory

## 4. CHILD-THREAD SPAWN

In Claude Code: Task tool
- Mechanism: Task tool (built-in) with subagent_type parameter naming the subagent.
  Task call also passes description, objective, or context as string.
- Parallelism: multiple Task calls can run in parallel (Claude Code schedules them)
- Persona loading: child loads the named subagent file from .claude/agents/ as system
  instruction and tool restrictions
- Notes: child has no direct access to parent context window; parent receives child's
  final response as text returned from Task call; subagent_type parameter is
  the subagent name (without file extension)
- Source: https://docs.claude.com/en/docs/claude-code/sub-agents

## 5. TRIGGER ORCHESTRATOR

In Claude Code: Hooks + Slash Commands (no built-in scheduler)
- Mechanism: settings.json hooks (PreToolUse, PostToolUse, UserPromptSubmit, etc.)
  for event-driven behavior; slash commands (/skill, /sub-agent, etc.) for
  user-triggered spawns
- Trigger types: PreToolUse, PostToolUse, UserPromptSubmit, SessionEnd (and others
  per settings.json schema)
- External scheduling: Claude Code has no built-in scheduler; cron jobs calling
  claude CLI, or external webhook integrations, must bootstrap sessions
- Notes: hooks run within current session context; not suitable for cross-session
  persistence; each hook invocation receives context and can return modifications
- Source: https://docs.claude.com/en/docs/claude-code/hooks

## 6. PLAN PERSISTENCE

In Claude Code: the TodoWrite tool (in-context structured list).
- PLAN slot: no first-class plan file; convention is to maintain
  the plan inside CLAUDE.md or in the conversation; for durable
  plans, write to a file with the file tools (e.g. `plan.md` in
  the working directory) and re-read it at re-grounding boundaries
- TODO/STATUS slot: TodoWrite tool maintains an ordered list with
  statuses (typically `pending` | `in_progress` | `completed`);
  list lives in conversation state; the model is prompted to
  update the list as work progresses
- CHECKPOINT slot: not native; convention is to commit progress
  to git or write summary files
- FILES slot: working directory (the CLI runs against a workspace);
  no isolated session-files area
- Notes: TodoWrite is intended as the cure for attention decay
  inside a single Claude Code session; for cross-session plans,
  fall back to file-based persistence
- Source: TODO: official docs page for the TodoWrite tool

## Capabilities Claude Code lacks (vs substrate)

- Glob-based scope predicates: CLAUDE.md uses directory hierarchy only (not glob patterns).
  Workaround: nest CLAUDE.md files at each scope boundary; use file path awareness
  within rules to simulate scoping.
- Cross-session state persistence: each session is stateless. Workaround: engineer
  explicit persistence via external store (git, database, file) and load via Task
  or CLAUDE.md import.
- Built-in event scheduler: no native cron or timer trigger. Workaround: use external
  cron or webhook to invoke claude CLI with initial prompts.

## Capabilities unique to Claude Code (beyond substrate)

- Nested CLAUDE.md hierarchy with @path imports: fine-grained memory composition
  at multiple directory levels with cross-file references.
- Slash commands: user-facing trigger syntax (/skill, /sub-agent) integrated into
  chat UI for interactive skill and subagent invocation.
- Recommended Skills: built-in skill discovery and recommendation without explicit
  orchestration; skill selector is autonomous.

## 9. MODEL CATALOG & BILLING (cost-economics)

Maps the abstract role classes in `../model-catalog.md` to concrete
Claude SKUs and to Anthropic's pricing surface. The genesis architect
designs in role classes; this adapter binds them at codegen time.

Verified on: 2025-11-14. Always re-verify the dollar figures against
the live pricing page before quoting; they age out.

### Role class -> concrete model (defaults)

| Role class             | Default SKU                | Alternative                  |
|------------------------|----------------------------|------------------------------|
| planner                | Claude Opus 4.x            | Sonnet 4.x with extended thinking |
| implementer            | Claude Sonnet 4.x          | Haiku 4.x for narrow scope   |
| reviewer               | Claude Sonnet 4.x          | Haiku 4.x for checklist work |
| trivial                | Claude Haiku 4.x           | (none)                       |
| long-context-retriever | Sonnet 4.x (1M context tier) | Opus where capability ceiling needed |

### Billing surface

Token pass-through. Per-Mtok rates (Anthropic public API,
verified 2025-11-14):

| SKU      | Input  | Output | Cache write (5min) | Cache write (1h) | Cache read |
|----------|--------|--------|--------------------|------------------|------------|
| Opus 4.x | $15    | $75    | $18.75             | $30              | $1.50      |
| Sonnet 4.x | $3   | $15    | $3.75              | $6               | $0.30      |
| Haiku 4.x | $1    | $5     | $1.25              | $2               | $0.10      |

Source: https://www.anthropic.com/pricing#api

### Cost-pattern bindings

- B12 MODEL ROUTER: bind in subagent frontmatter `model:` field; route
  by spawning subagents with different model values from a trivial-
  class dispatcher. Note: cross-model context does NOT share cache;
  the routing decision IS a cache partition boundary.
- B13 CACHE-AWARE PREFIX: Anthropic exposes up to 4 cache breakpoints
  per request. Place persona body + skill body below the lowest
  breakpoint; per-turn tool results above the highest. Cache reads
  bill at 10% of input.
- B16 EFFORT GOVERNOR: extended thinking ON adds output tokens at
  output rate. Declare per subagent. Mid-session extended-thinking
  toggle is a CACHE INVALIDATOR.

### Stance binding

Operator declares stance in the first prompt OR in `.claude/CLAUDE.md`
as `stance: <value>`. The genesis-architect subagent reads it at
step 1.
