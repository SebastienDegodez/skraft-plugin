# RPI implementation route

Use for RPI Agent Implement, Task Implementor, Phase Implementor, change logs,
and source or test edits executed from an HVE plan.

## Skill Loading — MANDATORY

Load each always-load skill before starting Implement. Only announce missing
ones: `[SKILL MISSING] {skill-name}`. A missing mandatory skill blocks
implementation.

### Always load for this route

* `outside-in-tdd`
* `red-synthesize-green`
* `craft-discipline`

### Load on demand (trigger-based)

| Skill | Load when... |
|---|---|
| `clean-architecture-testing` | Deciding test level, boundary placement, or doubles policy |
| `test-refactoring-catalog` | Refactoring tests after GREEN |
| `resolving-stack-commands` | Resolving a build, test, or mutation command |
| `mocking-strategy-roster` | A downstream dependency needs a test double |
| `playwright-evidence` | Browser behavior requires E2E evidence |

Block production code without prior observable RED evidence. Preserve Clean
Architecture dependency direction and required craft checks through GREEN and
refactoring.
