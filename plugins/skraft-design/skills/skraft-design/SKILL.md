---
name: skraft-design
description: Design and publish architecture for one ready GitHub or Azure DevOps story or epic. Use for architecture before implementation, or resume an interrupted architecture run.
---

# Architecture design

Use only this plugin's `skraft_design_*` MCP tools. Never call `skraft`, a shell entry point, another plugin's engine or another plugin's tools.

1. Resolve the project's absolute Git root and exactly one issue or epic number. If either is ambiguous, ask through native `ask_user` or `askQuestions`.
2. Call `skraft_design_setup` with `workspace`. For each returned question, ask its exact text and options through native chat. Relay YES/NO as the corresponding boolean to `setup`. Never infer publication consent. Preserve existing developer commands. Configure `baseBranch` in `skraft-design-config.json` when the merged architecture branch is not `main`.
3. Call `skraft_design_start` with `workspace` and exactly one of `issue` or `epic`. To resume an active run without reselecting its scope, call `skraft_design_next` instead.
4. On `dispatch`, start only the listed agents, using their exact `agent`, `prompt`, and supplied model and effort. Omit unset model or effort. If the host cannot select the supplied agent or assignment, report the concrete blocker and stop; never substitute a worker. Workers do not dispatch. Save each worker's final reply unchanged to its `reply` file, including its reply token. Then call `skraft_design_record`.
5. On `waiting`, first check whether the workflow already recorded a validated human reply; if so, call `next`. In an interactive host, ask the engine's exact question and options through native chat, request any refusal reason there, relay only that reply to `skraft_design_answer`, then call `next`. In CI, never ask the model to answer: if `status.draftPublication.allowed` is true, call `skraft_design_draft` and stop for the PR-comment decision; otherwise leave paused and report the exact blocker.
6. On `blocked` or `refused`, report `code` and `reason`; do not bypass readiness, review or ratification. On `not-recorded`, finish the listed dispatches before calling `record`.
7. Repeat only the returned handoff until completion. Report the architecture PR, or local output when publication was declined. Tell the user delivery consumes architecture only after the PR is merged; never merge it.

The CI workflow accepts only `/skraft-answer` comments from `@axa-fr/prime-squad-optimus`. It validates the exact pending key and an offered option before recording the reply and resuming the same journal. Never parse a raw PR comment as an answer or relay it yourself.

Unforeseen incident questions are not human approvals: follow their offered engine actions and submit only observed model, cost and unit. Missing observations leave the incident paused. Never invent usage.
