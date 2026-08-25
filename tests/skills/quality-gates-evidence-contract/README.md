# quality-gates-evidence-contract — evidence toolchain (DISABLED, RED BY CONSTRUCTION)

Materialized from the *Evals plan* section of the GENESIS handoff packet
`.copilot-tracking/genesis/qg-evidence-toolchain/plan.md` (last state `fa4b9d0`; the packet is
no longer on this branch). Its todo list ends with `6. [ ] Evals per plan above.` — that item was
never done. This is it.

| Packet item | Landed as |
|---|---|
| Content eval 1 — produce the log from captured outputs | stimulus *The evidence log is assembled from the captured outputs, digests included* |
| Content eval 2 — summarize the gates for the reviewer | stimulus *The reviewer summary is rendered from the log rather than re-narrated* |
| Trigger evals (~20, 60/40 train/val) | [`triggers.yml`](triggers.yml) — preserved, not executed |

## The grader that carries the whole eval

The packet described the without-skill failure as *"hand-transcribed JSON (observable drift:
wrong hash or tail)"*. That is not something a judge model can be trusted to spot: a fabricated
sha256 reads exactly like a real one. So the digests are **recomputed** in a `run-command` grader
and compared against the files they claim to hash. A model that writes plausible hex passes every
other grader in this spec and fails that one — which is precisely the discrimination the eval
exists for.

Same principle on the render side: the summary is checked against the log it derives from, gate
by gate, rather than read for tone.

## Why it is red, not just disabled

The toolchain does not exist on this branch. There is no
`plugins/skraft-framework/skills/quality-gates-evidence-contract/scripts/qg-evidence.mjs`, so
neither `assemble` nor `render` can be invoked. The skill ships the schema only; the deterministic
producer the packet designed was never merged here (the work lives on `feat/qg-evidence-toolchain`
and `fa4b9d0`).

Note what the graders deliberately do **not** assert: that a particular script was called. They
assert the *properties* the toolchain was supposed to buy — digests that re-resolve, an exit code
carried rather than retyped, a summary that agrees with its source. If the same guarantees are
reached another way, this eval should still go green. Rewrite it only if the guarantees change.

## Enabling

Remove `quality-gates-evidence-contract` from
[`eng/vally-adapter/skip-evals.txt`](../../../eng/vally-adapter/skip-evals.txt), then:

```bash
./eng/run-vally-evals.sh quality-gates-evidence-contract
```
