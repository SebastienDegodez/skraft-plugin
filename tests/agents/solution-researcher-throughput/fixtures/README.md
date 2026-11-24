# CheckoutPricing RESEARCH throughput fixtures

### `s14`

The fourteen-criteria `discount` story of `software-engineer-throughput`, three phases earlier:
the acceptance criteria draft (`plans/2026-08-07/ac-draft-discount.md`) is agreed, nothing is
researched, designed or built. The solution holds one stub use case, the dependency rules and
one ratified decision (ADR-001).

### `new`

The same story and criteria on a repository with no code: a README, the story and nothing else.

`research.template.md` is the plugin's research template, staged where the engine puts it for
the agent to fill. `eng/bench-agent-ab.sh` replaces it in each arm with the template of that
arm's ref: each version of the agent fills the template it ships with.
