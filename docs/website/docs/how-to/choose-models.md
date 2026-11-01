---
title: "Choose the agents' models"
description: "Choose each agent's model family, and each family's model and effort on Claude Code and Copilot, for you or the team; check with skraft doctor."
persona: tech-lead
---

# Choose the agents' models

Decide which model, and which reasoning effort, each skraft agent runs on, on Claude Code and on
Copilot.

## Prerequisites

- A configured repository ([Configure the components](./configure-components.md)).
- A terminal at the root of the working copy; `skraft` is the command that [`npm i -g @skraft/cli`](./install-on-a-host.mdx#skraft-command) sets up; the long line `node "<plugin folder>/engine/drivers/cli/skraft.mjs"` works without it.

## 1. See what each agent gets today

```console
$ skraft doctor
```

The doctor prints one table per host:

```text
models on claude-code:
  step             agent                         type     family       tier      model   effort  source (family/model/effort)
  research         solution-researcher           phase    researcher   standard  sonnet  -       agent/tier/host
  design           solution-architect            phase    planner      frontier  opus    -       agent/tier/host
  design_review    consistency-lens              lens     reviewer     economy   haiku   -       type/tier/host
```

With no setting, lenses run on `reviewer` (tier `economy`), `solution-researcher` on
`researcher`, `solution-architect` on `planner` (`frontier`), `pr-writer` on `economy`, every
other agent on `implementer` (`standard`). On Claude Code, `economy`, `standard` and `frontier`
give `haiku`, `sonnet` and `opus`; on Copilot, no model: the agent runs on the session's.

## 2. Choose the file

| File | For whom | Committed |
|---|---|---|
| `~/.skraft/config.json` | you, in every repository | no |
| `skraft-config.json` | the team, in this repository | yes |
| `skraft-config.local.json` | you, in this repository; `skraft init` adds it to `.gitignore` | no |

Each file applies over the one before, in this order (JSON Merge Patch: an object is merged key
by key, a value replaces, `null` removes). `~/.skraft/config.json` and `skraft-config.local.json`
follow the plugin's `schemas/skraft-config.local.schema.json` and never hold `components`.

## 3. Give each family a model and an effort, per host

Under `models`, a family gets, for `claude-code` and for `copilot`, a `model` (or a list tried in
order) and an `effort` (`low`, `medium`, `high`, `xhigh`, `max`):

```json
{
  "models": {
    "economy":  { "claude-code": { "model": "haiku",  "effort": "low" },  "copilot": { "model": "gpt-5.5", "effort": "low" } },
    "standard": { "copilot": { "model": "gpt-5.5", "effort": "high" } },
    "implementer": { "copilot": { "model": ["gpt-6.0", "gpt-5.5"] } },
    "deep-review": { "tier": "frontier", "claude-code": { "model": "opus", "effort": "max" } }
  }
}
```

A family is a tier (`economy` < `standard` < `frontier` < `premium`), a role (`reviewer`,
`researcher`, `implementer`, `planner`) or a family of your own that declares its `tier`
(`deep-review`). What a family leaves out comes from its tier, then from the host. A family name
is never a versioned model (`gpt-5.5` is refused as a family).

## 4. Assign a family to the agents

Under `assign`, per agent, per agent type (`phase`, `lens`, `refuter`, `worker`) or by default:

```json
{
  "assign": {
    "types": { "lens": "economy" },
    "agents": {
      "software-engineer": "frontier",
      "cold-reader-lens": "deep-review",
      "architecture-boundaries-lens": { "claude-code": { "effort": "high" } },
      "fitness-lens": null
    }
  }
}
```

- a string names the family; `inherit` leaves the choice to the host;
- an object adds an `effort` per host (with `"family"` when it changes the family too), never a
  model;
- `null` removes the rule an earlier file set.

The per-agent rule wins over the family an ejected workflow names (`model=`, `refuter=`), then
comes the per-type rule, then `assign.default`. `finding-refuter` runs one tier above the
strongest lens it checks, `frontier` at most, unless a rule names it.

## 5. Check

```console
$ skraft doctor
```

The rows of the agents you targeted show the new family, model and effort, and where each comes
from (`agent/family/family`: the family comes from a per-agent rule, the model and the effort from
the family):

```text
  deliver          software-engineer             phase    frontier     frontier  opus    -       agent/family/host
  deliver_review   cold-reader-lens              lens     deep-review  frontier  opus    max     agent/family/family
```

The next run journals what each agent ran on. A resumed run keeps what it journaled, whatever the
files say since.

## Troubleshooting

| Sign | Action |
|---|---|
| `FAIL  models: assign.agents.fitnes-lens: no agent fitnes-lens in the plugin, .claude/agents/ or .github/agents/; did you mean fitness-lens?` | Fix the agent's name. |
| `WARN  models/copilot: no model on copilot for … ; these run on the session's model` | Normal without a Copilot model; otherwise give those families a `model` for `copilot`. |
| `WARN  models/claude-code: CLAUDE_CODE_EFFORT_LEVEL is set …` | Unset the variable: Claude Code applies it to every agent, over the chosen effort. |
| `WARN  models/copilot: ~/.copilot/settings.json sets subagents.agents for …` | Those Copilot settings are ignored for skraft agents; remove them or move them into `models`. |
| On Claude Code, the effort does not change | Expected: the mod passes the model but not the effort; the agent file's effort applies. |
| On Copilot, the effort or the model is refused | Copilot retries without the effort, then tries the next model of the list, then the session's. |

## Next steps <!-- #next-steps -->

- [skraft-config.json](../reference/skraft-config.md#location) — the four
  layers and the `models` and `assign` keys.
- [Hosts](../reference/hosts.md#capabilities) — what each host passes to
  the agent: model, effort, cost.
- [Token economy](../explanation/token-economy.md) — why one family per role.
