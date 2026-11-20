<!-- markdownlint-disable-file -->
# Benchmark — outside-in TDD loop, v1 (November 2026)

What this change does to the time and cost of DISTILL + DELIVER on one story, and how to
reproduce it. Numbers are medians of 3 trials per arm: indicative, not a verdict (see
[Comparing two versions of an agent](../skill-evaluation.md#comparing-two-versions-of-an-agent)).

## The story

`CheckoutPricing`, a .NET 10 Clean Architecture solution, and a 14-scenario `discount` story over
three use cases (loyalty discount and promo codes, shipping fee, checkout quote). Two scenarios
are already covered by earlier ones. A hidden oracle checks every example of the feature,
whatever tests the agent wrote.

| Suite | Agent | Starts from |
|---|---|---|
| `acceptance-designer-throughput` | acceptance-designer | DESIGN approved: story, criteria, contracts |
| `software-engineer-throughput` | software-engineer | DISTILL approved, the acceptance test of S1 only (`main`) |
| `software-engineer-throughput-designed` | software-engineer | DISTILL approved, the acceptance tests of S1–S14 committed RED (this change) |

This change moves the writing of 13 acceptance tests from DELIVER to DISTILL, so a version is
charged for both agents.

## Results — `main` (`cccf5a02`) → this change

| | main | this change | Δ |
|---|---|---|---|
| Acceptance-designer: agent work | 140 s | 188 s | +48 s |
| Software-engineer: agent work | 509 s | 125 s | −384 s |
| **Both: agent work** | **649 s** | **313 s** | **−52 %** |
| Both: turns | 78 | 34 | −56 % |
| Both: tokens | 5.65 M | 2.08 M | −63 % |
| Both: cost (nano-AIU) | 166.0 G | 107.9 G | −35 % |
| Designer pass rate | 100 % | 100 % | |
| Engineer hidden oracle | 3/3 | 3/3 | |

The designer writes 14 acceptance tests instead of one for +48 s, 15 → 17 turns, +37 % of its
own cost. The engineer then needs 63 → 17 turns, 37 → 4 test runs, 4.59 M → 1.02 M tokens, −65 %
of its cost.

Designer: both arms at `4ea8f8a1`'s harness, run `20261120T155631Z`. Engineer: run
`20261120T134834Z`, this change at `0abdc870`; the engineer changes since (the plan's rule groups,
the journal by group) do not apply to its fixture, whose plan has no groups.

### Intermediate steps

| Step | Agent | Agent work |
|---|---|---|
| No RED capture, tests first inside DELIVER (`af46760b`) | software-engineer | 515 s → 338 s, −34 % |
| The designer writes every test, rule groups, `qg-collect` (`0abdc870`) | acceptance-designer | 95 s → 225 s (control without the `create` tool) |
| Outer-loop reference, read and write in bursts, plan by rule group (`5fd75ab5`) | acceptance-designer | 225 s → 188 s, 21 → 17 turns, −28 % cost (against the run above) |

### Caveats

- 3 trials per arm.
- `main`'s engineer passes the hidden oracle but missed a commit-count grader since removed:
  its pass rate reads 0 % at a 0.875 median score. Quality is equal, not 0 → 100.

## Reproduce

```bash
MAIN=cccf5a02f162b6efa6adbd3f81a017fa46b6eed9
PR=<this branch>
RUNS=3 ./eng/bench-agent-ab.sh acceptance-designer-throughput $MAIN $PR
CANDIDATE_SUITE=software-engineer-throughput-designed RUNS=3 \
  ./eng/bench-agent-ab.sh software-engineer-throughput $MAIN $PR
node eng/agent-turns.mjs bench-results/<suite>/<stamp>/candidate/results/<suite>/live/*/results.jsonl --trial 1
```

Each run writes `bench-results/<suite>/<stamp>/comparison.md`. Add the two agent-work rows for the
total; plan 12–15 trials per arm for a result to publish.
