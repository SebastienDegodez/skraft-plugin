# Skill `craft-discipline`

**Status:** ✅ Implemented
**Source:** [`plugins/skills/craft-discipline/SKILL.md`](../../plugins/skills/craft-discipline/SKILL.md)

---

## When to Use

At the end of the COMMIT & VERIFY phase, before committing. Self-discipline
checkpoints the `software-engineer` runs against its own artifacts.

This skill is **NOT** a review contract — the reviewer does not read it.
It audits artifacts independently.

---

## Summary

10 checkpoints (C1-C10) covering:

| Checkpoint | Verifies |
|------------|----------|
| C1 | Acceptance test passes |
| C2 | Unit tests pass |
| C3 | Build passes |
| C4 | Static analysis passes |
| C5 | No skipped tests |
| C6 | No mock in Domain/Application |
| C7 | Business language in tests |
| C8 | Mutation score 100% |
| C9 | Conventional commit |
| C10 | Object Calisthenics on Domain |

---

## Non-Negotiable Rules

- Red checkpoint → fix BEFORE committing.
- No exceptions.
- 3 failures on the same checkpoint → revert to green + escalate.

---

## References

- [Test Theater Patterns](../../plugins/skills/craft-discipline/references/test-theater-patterns.md)
- [Object Calisthenics](../../plugins/skills/craft-discipline/references/object-calisthenics.md)

---

## Related Skills

| Skill | Role | Status |
|---|---|---|
| [`outside-in-tdd`](./outside-in-tdd.md) | Owns the 4-phase cycle including COMMIT & VERIFY | ✅ |
| [`red-synthesize-green`](./red-synthesize-green.md) | RED / SYNTHESIZE-GREEN mechanics | ✅ |
| [`clean-architecture-testing`](./clean-architecture-testing.md) | Test level and doubles policy | ✅ |
| [`mutation-testing`](./mutation-testing.md) | Mutation testing execution at COMMIT phase | 🚧 [Planned](../roadmap.md#mutation-testing) |
