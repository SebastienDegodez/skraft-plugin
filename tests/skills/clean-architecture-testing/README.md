# clean-architecture-testing — test placement and doubles

Five stimuli, `4` runs each — 20 trials per arm. The planning log that produced
this instrument, including the review that reshaped it, is in
[`PLAN.md`](PLAN.md); this file is the stable record of *what the instrument
measures and why it is shaped this way*.

## Scope

The skill owns two decisions, and this eval measures only those:

- **Where a test physically lives** — which of the bounded context's two test
  projects it belongs in.
- **What it is allowed to talk to** — whether an adapter proves itself against
  the real engine or against a substitute.

Deliberately excluded, because a sibling skill owns it:

| Neighbour | What it owns, and stays out of this portfolio |
|---|---|
| `test-design-mandates` | *whether a rule deserves its own test at all* |
| `outside-in-tdd` | the RED → GREEN cycle once the test is written and correctly placed |
| `mocking-strategy-roster` | which double type to reach for, as a catalogue |

S5 exists to police the `outside-in-tdd` boundary from this side.

## Stimuli

| # | Stimulus | Class | Single decision it forces |
|---|---|---|---|
| S1 | Cover the payment adapter that nothing tests yet | decider, **deterministic** | does new adapter coverage land in the slow suite, against the real client |
| S2 | Swap the database engine out of the repository tests | decider, **forced-concept** | does an in-process substitute get accepted for an adapter test |
| S3 | Stop layer violations at the build without slowing the fast suite | decider | where a layer guard runs in the lifecycle |
| S4 | Forty validation cases for a rule three use cases share | **regression guard** | is the Iron Rule over-applied to the case it exempts |
| S5 | The failing test is already in the right place | **non-activation** | does the skill stay quiet when nothing is left to place |

**S4 and S5 are expected to tie.** S4 covers the case the Iron Rule deliberately
exempts — a complex rule, extracted, shared by three use cases — which a competent
baseline already handles; a *loss* there is the finding, and it outranks a win
elsewhere because it means the skill degraded a working slice. S5 asks for the
skill to be absent. Neither is kept for coverage: each is the only instrument
that can detect a specific way the skill could be wrong.

**S2 is a forced-concept case.** The developer names the substitution outright,
which is the one situation
[`prompt-neutrality.md`](../../../.agents/skills/create-skraft-eval/references/prompt-neutrality.md)
allows an implementation concept into a prompt, because the pressure *is* the
behaviour under evaluation — every other stimulus names only the symptom. The
speed complaint is genuine, so a bare refusal is not the winning answer — the
rubric scores where fast feedback gets redirected, not how loudly the
substitution is declined.

## Proof surface

S1 is the deterministic decider; the other four are judged against their rubrics.

| S1 grader | What it catches |
|---|---|
| `dotnet build` + `dotnet test` green | build-infrastructure sentinel — a wrecked `.slnx` or csproj surfaces as a harness failure, never as a quiet architectural loss |
| exactly two directories under `tests/` | a third project grown to park the new test in |
| `diff-contains` on `IntegrationTest/**.cs` | the coverage landed in the slow suite |
| `diff-not-contains` on `UnitTest/**.cs` | the fast suite did not take on the adapter |

The paired diff graders are what make S1 decidable without a judge: placement is
a fact about the diff, not an opinion. Because the new test must also be **green
against the real adapter**, a hollow test cannot satisfy them.

## What was cut, and why

1. **The layer-guard stimulus could not be made executable.** It was drafted as
   the deterministic one, with placement plus a green `dotnet test` as graders — but
   a hollow architecture test passes both. The obvious repair, injecting a layer
   violation during grading to prove the guard is not vacuous, is *impossible*: in a
   correctly layered solution every inward-violating project reference is circular,
   and `dotnet` refuses it at restore. It became S3, a judgement stimulus, and the
   deterministic slot moved to adapter coverage.
2. **A prompt constraint contradicted the skill under test.** The first draft told
   the agent to add no third-party dependency, to isolate the placement decision.
   But the skill's own `references/architecture-rules.md` *recommends* NetArchTest:
   the treatment arm would have followed its own reference into a penalty invented
   by the evaluator. Removed.
3. **Two stimuli measured the same decision.** The original S1 and S3 overlapped;
   S3 was reshaped onto the lifecycle question instead.

## Power

`5 × 4 = 20` trials per arm, against the six-discordant-pair floor in
[`eng/lib/verdict.mjs`](../../../eng/lib/verdict.mjs).

Budget is sized for power, not for a floor. S4 and S5 are expected to tie and
therefore contribute no pairs by design, so the three deciders carry the verdict
alone: 12 trials, of which roughly 10–12 should land discordant. That clears six
with margin. The margin is the point — power is bought before the draw, and
topping up runs on a comparison that came back noisy is the worst-value spend in
the protocol.

## Fixture

`fixtures/payment-authorization/` — a layered .NET solution, used by S1 only.

Both test projects already exist and are green (2 unit tests, 1 integration
test, build clean). The question the stimulus asks is therefore *where the new
test goes*, never *how to organise an empty repository*.

The trap is one constructor:

```csharp
public sealed class HttpPaymentGateway(HttpClient client) : IPaymentGateway
```

Taking `HttpClient` by injection makes "stub the transport and park the test in
the fast project" the natural, easy, idiomatic shortcut — which is exactly the
failure S1 has to be able to observe. A fixture that made the right answer the
only convenient one would measure nothing.

## Running it

```bash
./eng/run-vally-evals.sh clean-architecture-testing
```

This eval is **active** — unlike the two other documented evals, it is absent
from [`skip-evals.txt`](../../../eng/vally-adapter/skip-evals.txt), so the
scheduled run picks it up.

Needs `COPILOT_GITHUB_TOKEN` — a fine-grained PAT with **Account › Copilot
Requests**. See [Running an evaluation](../../../docs/skill-evaluation.md#running-an-evaluation)
for the staged-spend protocol; verdicts are published to `dashboard-data`, not
recorded here.
