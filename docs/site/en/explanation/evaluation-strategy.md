---
layout: doc
lang: en
title: "Evaluation strategy"
description: "Why skraft proves its quality in three layers (deterministic engine tests, paired skill comparison, real-agent conformance), and what each layer cannot tell."
persona: tech-lead
---

# Evaluation strategy

> A skill is a claim: an agent that loads this file does better than an agent that does not. Until
> someone measures it, it is only a hunch.

skraft answers three different questions, each with a layer of evidence of its own. None replaces
the other two.

## Layer 1: does the engine do what it says?

The engine decides the order of phases, the expected outputs, the gates and the verdicts. Those
decisions are code, and that code is tested like any code: acceptance scenarios that enter through
a use case (`tests/skraft-framework/unit/`), integration tests on real adapters, Git and processes
(`tests/skraft-framework/integration/`). None of these tests calls a model: they are deterministic,
and a failure there points at a bug, never at noise.

Mutation testing then checks that these tests really catch mistakes: a surviving mutant shows a
behaviour no test tells apart. It is the same bar skraft sets for the code it delivers (Jia &
Harman, 2011).

What this layer does not tell: whether the agents, guided by the engine, do good work.

## Layer 2: does this skill improve the answer?

A skill that *looks* good can produce a worse result, or cost context for nothing. Only a
measurement shows it.

The measurement is a **paired comparison**: the same prompts are played twice, once with no skill
(baseline), once with the evaluated skill alone, and nothing else changes between the two passes.
Both arms get the same spec; only the skill folder differs, empty for the baseline. A judge
compares the two trajectories of each pair, against a rubric written in advance.

The tally of wins, ties and losses becomes a verdict through a **two-sided exact binomial sign
test**. A majority of wins is not enough: it must be unlikely under chance alone. Ties decide
nothing and are set aside; below six discordant pairs, no tally, even a perfect one, reaches
`p ≤ 0.05`. Hence a budget of 12 to 15 trials per spec, bought up front: adding trials to an
already noisy comparison is the worst spend. The figures are worked through in
[Read an evaluation verdict]({{ "/en/explanation/deep-dive/reading-a-verdict" | relative_url }}).

Three writing rules keep the measurement from becoming a placebo:

- **Never name the skill in a prompt.** A prompt that says which technique to use removes what the
  evaluation means to observe.
- **Judge the outcome, not the technique.** Another approach, just as valid, would fail a rubric
  that demands one precise command.
- **Include a non-activation case.** A skill that triggers everywhere costs context everywhere;
  restraint is part of the expected behaviour.

The test is two-sided and decided in advance: nobody picks afterwards the direction that suits.
A credible `regression` blocks a PR's merge; `no-improvement` and `inconclusive` inform without
blocking.

What this layer does not tell: what happens when several skills load together. It measures one
skill at a time.

## Layer 3: do real agents conform to what they declare?

An agent suite (`tests/agents/<suite>/`) dispatches a real skraft agent on a real task and checks,
with deterministic graders, that it is the right agent, that it loaded its required skills and
that its handoff has the declared shape. There is no baseline agent to set against it: the suite
attests **conformance**, not a gain, and so has no sign test.

A suite plays one real agent session; an unstable run must not block an unrelated merge. Its
verdict (`pass`, `flaky`, `regression`, `inconclusive`) is published beside the skills' ones, but
stays indicative.

## What the whole brings

| Usual blind spot | Layer that covers it |
| --- | --- |
| Tests that pass without checking anything | Layer 1: mutation testing shows what they cannot tell apart |
| "The skill looks right" | Layer 2: if it does no better than the baseline, the verdict says so |
| "It worked last time" | Layers 2 and 3: every trial can be replayed, every trajectory is recorded |
| Picking afterwards the result that suits | Layer 2: two-sided test, budget fixed in the spec, pilots never published |
| An agent that ignores its skills | Layer 3: conformance is checked on a real session |

Missing data is never shown as a success: an `inconclusive` verdict says why it does not conclude.

## Further reading

- [Evaluate a skill]({{ "/en/how-to/evaluate-a-skill" | relative_url }}) — the steps.
- [Read an evaluation verdict]({{ "/en/explanation/deep-dive/reading-a-verdict" | relative_url }})
- [Software craftsmanship]({{ "/en/explanation/software-craftsmanship" | relative_url }}) — the
  same bar applied to the delivered code.

## Sources

- Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011.
