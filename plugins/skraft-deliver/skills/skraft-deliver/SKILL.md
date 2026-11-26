---
name: skraft-deliver
description: Implement one GitHub or Azure DevOps story from executable scenarios and TDD, with or without a merged architecture brief. Use for story delivery or resume an interrupted delivery run.
---

# Story delivery

Use only this plugin's `skraft_deliver_*` MCP tools. Never call `skraft`, a shell entry point, another plugin's engine or another plugin's tools.

1. Resolve the project's absolute Git root and one story issue number. Ask through native `ask_user` or `askQuestions` when either is ambiguous.
2. Call `skraft_deliver_setup` with `workspace`. Ask each returned question's exact text and options through native chat; relay YES/NO to its setup boolean. Never infer publication consent. Set components' Gherkin choices and bindings in `skraft-deliver-config.json`; preserve developer commands. Configure `baseBranch` there when merged architecture is not on `main`.
3. Call `skraft_deliver_start` with `workspace` and `issue`; in a CI workflow, add `mode: "ci"`. Call `skraft_deliver_next` to resume the active run. An absent architecture brief is a notice, never permission to run RESEARCH: the engine dispatches `deliver-light-designer` before DISTILL, like any other listed agent.
4. On `dispatch`, start only the listed agents with their exact `agent` and `prompt`, passing supplied model and effort and omitting unset values. If the host cannot honor an agent or assignment, stop with the concrete blocker; never substitute. Workers never dispatch. Save each final reply unchanged to its `reply` file, including its reply token, then call `skraft_deliver_record`.
5. In CI (`mode: "ci"`), never answer and never ask the model to: the engine asks each question in a comment of its own, on the story's issue before anything is committed, then on the draft pull request, and the result holds `draft`. Report it and stop; a `/skraft-answer` reply resumes the run. When the result holds no `draft`, or a refused one, leave the run paused and report the exact blocker.
6. Interactively, on `waiting`, ask the engine's exact question and options through native chat, requesting a refusal reason there. Relay only the native reply through `skraft_deliver_answer`, then call `next`. Missing or dismissed native chat leaves the run paused; record nothing. Never infer scenario approval, a light design's approval or KEEP from worker output.
7. On `blocked` or `refused`, report `code` and `reason`. A brief delivery cannot rely on (unmerged, stale, a changed issue the human asked to REDESIGN) pauses the run on `architecture-wait`: ask it as any other question; RESUME after the human merged a design reads the merged base again. A changed issue requires the human's KEEP or REDESIGN choice. Never bypass these decisions, TDD, gates or reviews. On `not-recorded`, finish pending dispatches before calling `record`.
8. Repeat the returned handoff until completion. Report the PR or local output when publication was declined. Never merge the PR.

Unforeseen incident judgments accept only offered actions and observed model, cost and unit; missing observations leave paused. They never substitute for human confirmations.
