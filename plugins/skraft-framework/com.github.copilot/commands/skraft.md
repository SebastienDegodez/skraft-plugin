---
description: Start or resume the skraft engineering pipeline for one story, show where it stands, answer its question, review a pull request, or begin from the backlog. The syntax of /skraft in Claude Code.
argument-hint: "[<slug> [#issue] [title…] [--base <ref>] [--from-artifacts] | status | decide [<key>] <answer> [reason…] | review <number> [--publish] | backlog [criteria…]]"
---

Act on the words typed after the command, and only on them. Their first word picks the route:
nothing, or `status` or `help` alone → Status; `decide` → Decide; `review` → Review;
`backlog` → Backlog; any other word is a slug → Run.

A route's Copilot line applies when this session offers the `skraft-pipeline` and `skraft-review`
dynamic workflows; otherwise its Elsewhere line applies, and you start no run, no review and no
agent: the person does. `skraft` stands for `node "<plugin folder>/engine/drivers/cli/skraft.mjs"`,
typed by the person from the root of the working copy; never search the disk for the plugin folder.

## Status
Start and resume nothing.
- Copilot: open the `skraft-pipeline` canvas on its `run` tab and relay what it shows; when you cannot open a canvas, tell the person to type `skraft status`.
- Elsewhere: tell the person to type `skraft status`.

## Run — `<slug> [#<issue>] [title…] [--base <ref>] [--from-artifacts]`
The slug is the first word, as typed. `#<digits>` right after it is the issue; `--base <ref>` and
`--from-artifacts` may come anywhere after it; the other words form the title. Never invent a
slug, an issue or a title.

| Typed | Workflow arguments |
| --- | --- |
| `paiement #42 Paiement par carte` | `{"slug":"paiement","issue":42,"title":"Paiement par carte"}` |
| `paiement --base develop` | `{"slug":"paiement","base":"develop"}` |
| `paiement --from-artifacts` | `{"slug":"paiement","fromArtifacts":true}` |
| `paiement x #42` | `{"slug":"paiement","title":"x #42"}` |

- Copilot: run the `skraft-pipeline` workflow with those arguments and no other key. Relay the outcome's status, code and reason as returned. Say a run started, waits or finished only when the outcome says so; on `blocked` or `refused`, say what the reason asks and stop.
- Elsewhere: say no run was started from this chat; `skraft doctor` tells the person which line applies:
  - in a terminal, with the Copilot SDK: `node "<plugin folder>/engine/drivers/copilot-sdk/skraft-run.mjs" <slug> [--issue <issue>] [--title "<title>"] [--base <ref>] [--from-artifacts]`;
  - without it: select the `Skraft - Orchestrator` agent as the chat's agent and give it the same words.
  Never run `skraft-run.mjs`, `skraft init`, `skraft next` or `skraft record` yourself.

## Decide — `[<key>] <answer> [reason…]`
The typed words are never recorded as the answer and never passed to a tool.
- Copilot: put the question the active skraft-pipeline run waits on to the person in Copilot's own dialog; once recorded, tell them to resume the paused run from `/workflows`.
- When Copilot cannot put it, and Elsewhere: tell the person to type `skraft decide [<key>] <answer> [--reason "<reason>"]`, built from the typed words; run nothing.

## Review — `<number> [--publish]`
No pull request number: ask for it and stop.
- Copilot: run the `skraft-review` workflow with `pr` set to the number, and `publish: true` only when `--publish` was typed; relay its outcome as Run does.
- Elsewhere: tell the person to type `skraft review --pr <number> [--publish]`; start nothing.

## Backlog — `[criteria…]`
1. `.copilot-tracking/skraft-plans/backlog/` exists: a pipeline is named `backlog`. Say so, ask whether they meant the backlog route or that pipeline, and stop.
2. No `Skraft - Backlog Discoverer` agent in this session: say skraft-backlog is not installed (`copilot plugin install skraft-backlog@skraft`; VS Code: Chat: Open Customizations, Browse), that every other /skraft route still works, and stop.
3. Otherwise start no agent. Tell the person: select `Skraft - Backlog Discoverer` as the chat's agent and give it the criteria; after its triage, select `Skraft - Backlog Planner` to refine the issue they choose; once its stories are written, `/skraft <slug> --from-artifacts` develops the story. Each step waits for them.

<!-- Not verified by Vally: this prompt has no eval spec (Vally paused). -->
