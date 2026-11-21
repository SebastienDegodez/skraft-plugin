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

## Results — `main` (`cccf5a02`) → this change (`68b94e0e`)

Both agents, both arms on the same harness, 21 November 2026 (runs `20261121T090219Z` and
`20261121T091031Z`).

| | main | this change | Δ |
|---|---|---|---|
| Acceptance-designer: agent work | 145 s | 135 s | −7 % |
| Software-engineer: agent work | 506 s | 132 s | −74 % |
| **Both: agent work** | **651 s** | **267 s** | **−59 %** |
| Both: turns | 79 | 30 | −62 % |
| Both: test runs | 37 | 7 | −81 % |
| Both: tokens | 6.23 M | 1.89 M | −70 % |
| Both: cost (nano-AIU) | 196.4 G | 89.2 G | **−55 %** |
| Designer pass rate | 100 % | 100 % | |
| Engineer hidden oracle | 3/3 | 3/3 | |

The designer now writes the 14 acceptance tests, against one on `main`, in less time (16 → 13
turns, −21 % of its cost). The engineer needs 63 → 17 turns and 34 → 4 test runs, −67 % of its
cost.

### Intermediate steps

| Step | Agent | Agent work |
|---|---|---|
| No RED capture, tests first inside DELIVER (`af46760b`) | software-engineer | 515 s → 338 s, −34 % |
| The designer writes every test, rule groups, `qg-collect` (`0abdc870`) | acceptance-designer | 95 s → 225 s (control without the `create` tool) |
| Outer-loop reference, read and write in bursts, plan by rule group (`5fd75ab5`) | acceptance-designer | 225 s → 188 s, 21 → 17 turns, −28 % cost (against the run above) |

### Caveats

- 3 trials per arm.
- `main`'s engineer passes the hidden oracle but misses the red-then-green grader: its S1 test
  sits in the fixture's seed commit, so its first commit is a `feat`. Its pass rate reads 0 % at
  a 0.875 median score; quality is equal, not 0 → 100.

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
