---
layout: doc
lang: en
title: "Refactor existing code under a net"
description: "Start brownfield-refactorer as the main agent, choose Mikado or Strangler Fig, follow the graph or the slice plan, and act on the ADVANCE, EXPAND, DONE and BLOCKED signals, the net green at every commit."
persona: software-engineer
---
{% assign cites = "/en/reference/citations" | relative_url %}

# Refactor existing code under a net

**Goal**: change in place or replace part of an existing codebase, one leaf or slice at a time,
with a green commit at every step.

To understand the two methods: [Brownfield journey]({{ "/en/explanation/brownfield" | relative_url }}),
[Ellnestam & Brolund, 2014]({{ cites }}#cite-ellnestam-brolund-mikado-2014) (Mikado),
[Fowler, 2004]({{ cites }}#cite-fowler-strangler-2004) (Strangler Fig).

## Prerequisites

- The `skraft` and `skraft-brownfield` plugins installed.
- A green net on the target code: the `brownfield-harness-builder` report with the verdict
  `PASS`, or `CONCERNS` whose gaps you accept
  ([Put a characterization net]({{ "/en/how-to/characterize-legacy" | relative_url }})).
- The component's `build` and `test` commands in `skraft-config.json`, else those the harness
  report names.
- A clean working branch.

## 1. Open a session with the refactorer as its main agent

The refactorer starts one `refactoring-worker` per leaf or slice itself: it must be the
session's main agent, never a subagent.

| Host | How |
|---|---|
| Claude Code | `claude --agent skraft-brownfield:brownfield-refactorer` |
| Copilot CLI, VS Code | in a new session, pick the agent **Skraft - Brownfield Refactorer** before the first message |

## 2. Give the goal and the net

Write the goal as one value sentence, and say where the net is:

```text
Goal: invoices are issued without the billing logic knowing how the customer is notified.
Net: harness builder report for services/billing, verdict PASS.
```

A vague goal ("improve the architecture") is refused: the agent asks for a sharper one. Without
an accepted net, it stops and points to `brownfield-harness-builder`.

## 3. Choose the strategy

The agent recommends a strategy with its reason, then waits for your answer:

| You want to… | Strategy | Artifact under `.copilot-tracking/skraft-plans/<slug>/refactoring/<date>/` |
|---|---|---|
| change in place (extract, decouple, change the ORM) | Mikado | `mikado-<slug>.md`: a Mermaid graph of prerequisites |
| replace (rewrite, move to a new stack or service) | Strangler Fig | `strangler-<slug>.md`: one row per slice |

## 4. Follow the loop

The agent reloads the artifact, hands the next item to a fresh `refactoring-worker`, then acts on
its signal:

| Signal | What happened | What you do |
|---|---|---|
| `ADVANCE` | leaf or slice done and committed, net green | nothing: the agent moves to the next one |
| `EXPAND` | the item hides prerequisites, or the slice is too large; nothing was committed | read the items added to the artifact |
| `BLOCKED` | the item needs a decision | answer the question; nothing is handed out before |
| `DONE` | goal reached (Mikado), or old code removed (Strangler) | read the final report |

**Mikado.** Each leaf is committed with the graph, titled `refactor(mikado-graph): <id> done`.
To check the graph yourself, run the validator of the `mikado-method` skill (`<skill>` is its
folder in the installed plugin):

```text
sh "<skill>/scripts/validate-mikado.sh" .copilot-tracking/skraft-plans/<slug>/refactoring/<date>/mikado-<slug>.md
powershell -NoProfile -ExecutionPolicy Bypass -File "<skill>/scripts/validate-mikado.ps1" <graph>
```

```text
--- Pass 8: True leaf enumeration ---
  [OK]    Leaf ready: {N3} [ ] {N3} Golden Master on BillingService.SendInvoice…
=== Summary ===
  Result       : VALID - graph is ready for the next leaf
```

Exit 0: the graph is valid and lists the leaves ready; exit 1: fix it before any leaf.

**Strangler Fig.** Slice zero puts the facade in place and proves it transparent. A slice cuts
over only when its characterization tests pass against the new code with the same assertions as
against the old, and the whole net stays green. Any behaviour difference comes back to you as
`BLOCKED`: decide whether it is wanted.

## Troubleshooting

| Situation | Action |
|---|---|
| The agent says it cannot start `refactoring-worker` | It runs as a subagent: open a session with it as the main agent (step 1). |
| `[SKILL MISSING] mikado-method` | Reinstall `skraft-brownfield`. |
| The validator exits 1 on a discovery commit | Retitle the commit `refactor(mikado-graph): …`: the validator rejects a `discovered:` commit titled otherwise. |
| A slice stays at `CONCERNS` | A difference between old and new waits on your decision; the slice stays on the old code until then. |

## See also

- [Put a characterization net]({{ "/en/how-to/characterize-legacy" | relative_url }})
- [Brownfield journey]({{ "/en/explanation/brownfield" | relative_url }}) — why the graph stays
  driven by the human.
- [The agent and skill catalogue]({{ "/en/dashboard/" | relative_url }}#agent-brownfield-refactorer)
