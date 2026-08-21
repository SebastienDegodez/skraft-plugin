# architecture-patterns — balanced coupling verdict (DISABLED, RED BY CONSTRUCTION)

Materialized from the *Evals plan* section of the GENESIS handoff packet
`.copilot-tracking/genesis-plans/balanced-coupling-autonomy/plan.md` (last state `642b18d`; the
packet itself is no longer on this branch). The packet specified an eval; it never wrote one.
This is that eval.

## What the packet asked for, and what it got

> Content eval: give a low-tier model a context map with a `Conformist` arrow into a Core
> context. With the matrix → it returns `UNBALANCED-SMELL` by lookup. Without → it must reason
> the XOR chain (fragile). Delta = autonomy.
> No trigger evals (DISCOVERY-loaded by one named agent).

The with/without arms are exactly what the skill harness already does — `run-vally-evals.sh`
runs every `tests/skills/**` spec twice, once with an empty `--skill-dir` and once with only the
skill under test — so the packet's delta needs no encoding here. What it does need is a second
stimulus: a verdict that is a table lookup has to move when the input cell moves, and an eval
with only the unbalanced case is passed by a skill that answers `UNBALANCED-SMELL` to
everything. Both stimuli therefore ask the same question about the same arrow between the same
two contexts, and differ in one cell: `Conformist` vs `Anticorruption Layer`.

No trigger evals, per the packet.

## Why it is red, not just disabled

`plugins/skraft-framework/skills/architecture-patterns/SKILL.md` on this branch contains no
verdict matrix, no `UNBALANCED-SMELL` token, and `architecture-review-criteria` has no `G17`.
The design the packet describes was never landed here. This eval is therefore a **specification**
of behaviour that does not exist: it will fail in both arms until the matrix ships, which is the
point — it is the acceptance criterion for that work, written before it.

Do not enable it to "see where we are". Enable it when the matrix lands, and expect the
treatment arm to go green while the baseline stays red — that gap is the autonomy the packet was
buying.

## Enabling

Remove `architecture-patterns` from
[`eng/vally-adapter/skip-evals.txt`](../../../eng/vally-adapter/skip-evals.txt), then:

```bash
./eng/run-vally-evals.sh architecture-patterns
```
