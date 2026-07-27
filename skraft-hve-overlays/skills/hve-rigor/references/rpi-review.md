# RPI review route

Use for RPI Agent Review, Task Reviewer, RPI Validator, Implementation
Validator, and review artifacts.

## Skill Loading — MANDATORY

Load each always-load skill before starting Review. Only announce missing ones:
`[SKILL MISSING] {skill-name}`. A missing mandatory skill blocks acceptance.

### Always load for this route

* `adversarial-review-lenses`
* `architecture-review-criteria`
* `acceptance-review-criteria`
* `quality-gates-evidence-contract`

### Load on demand (trigger-based)

| Skill | Load when... |
|---|---|
| `mutation-testing` | Verifying mutation quality or analyzing surviving mutants |
| applicable `quality-gates-<stack>` adapter | Verifying stack-specific build, test, or mutation evidence |

Do not accept a verdict without structured test, build, mutation, and RED/GREEN
evidence. Resolve or explicitly escalate every blocker dissent.
