---
layout: doc
lang: en
title: "Answer a run's question"
description: "Answer the question a run waits on (ratify an ADR, consent to publish, repair the machine, unblock an agent, treat the mutants) from Claude Code, Copilot or a terminal, and know what becomes of a refusal."
persona: software-engineer
---

# Answer a run's question

**Goal**: give the human decision a run waits on, so that it goes on.

A run that asks a question **waits**: it does nothing more until someone answers, and starting it
again asks the same question, without starting an agent again.

## Prerequisites

- A run with the status `waiting` (`skraft status`, or the **Skraft** pane).
- For the command line: an interactive terminal at the root of the working copy; `skraft` is the command that [`skraft install`]({{ "/en/how-to/install-on-a-host" | relative_url }}#skraft-command) sets up; the long line `node "<plugin folder>/engine/drivers/cli/skraft.mjs"` works without it.

## 1. Read the question and its key

```text
skraft status
```

```text
skraft checkout: waiting
…
question: adr-ratification (adr)
answer: skraft decide adr-1 RATIFIED|REJECTED (--reason <text> with REJECTED)
Ratify the Proposed ADRs docs/adr/adr-001-card-provider.md? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.
```

The `answer:` line gives the key (`adr-1`) and the allowed answers:

| Question | Answers | Reason required |
|---|---|---|
| `adr-ratification` | `RATIFIED`, `REJECTED` | with `REJECTED` |
| `publish-consent`, `reporting-consent` | `ACCEPTED`, `DECLINED` | — |
| `review-consent` (`skraft review --pr --publish`, header `Review comment`) | `ACCEPTED`, `DECLINED` | — |
| `environment` | `RETRY` (once the machine is repaired), `ABORT` | — |
| `mutation-plan` | `APPLY`, an instruction of your own, or `STOP` | — |
| `blocked` | an instruction for the agent, or `STOP` | — |

What each answer triggers: [Questions to a human]({{ "/en/reference/run-journal" | relative_url }}#human-questions).

## 2. Answer from your host

### Claude Code

1. Pick an option in the dialog the mod opens (header `ADR`, `Pull request`, `Environment`…).
2. For `REJECTED`, a second dialog asks for the reason: type it under **Other**.
3. For a `blocked` or `mutation-plan` question, type your instruction under **Other**, or pick
   `STOP` (`APPLY`).

With the dialog closed, the run waits. Answer later with a button of the **Skraft** pane, or in
the conversation:

```text
/skraft decide adr-1 REJECTED use the provider already under contract
```

The words after the answer form the reason; for a `blocked` question, every word after the key
forms the instruction. `/skraft decide` records the answer, then resumes the run.

### GitHub Copilot CLI

1. Copilot asks the question once, in the chat: pick an option, or type your instruction.
2. For `REJECTED`, type the reason in the field that follows.

When the question could not be asked (`autopilot` mode, no dialog) or you closed it, the workflow
writes `Waiting for you — <question>` and pauses. Either:

- resume the workflow from `/workflows`: the question is asked again;
- ask Copilot, in the chat, to put the waiting skraft question to you: the `skraft_decide` tool
  asks it in the dialog, then answers
  `Recorded: … Resume the paused skraft-pipeline run (/workflows).` Then resume the workflow.

`/skraft decide [<key>] <answer>` works differently here than in Claude Code: it records nothing from
the words you type. Copilot's dialog asks the question again and records what the dialog gives, so
answer there; once recorded, resume the paused run from `/workflows`.

The `skraft-pipeline` canvas shows the question but takes no answer.

### VS Code or a terminal

```text
skraft decide adr-1 REJECTED --reason "use the provider already under contract"
```

The terminal asks `skraft decide: record REJECTED for adr-1? [y/N]`: type `y`. For a `blocked`
question, the instruction goes between quotes: `skraft decide design-1 "use the bank gateway"`.
Then resume the run: `skraft-run.mjs` again (Copilot SDK), or ask the orchestrator agent to run
`skraft next` again.

## 3. Check that the run went on

```text
skraft status
```

The status is no longer `waiting`. `skraft report` lists every answer given, with how it was
recorded (`host`, `decide`, `host-confirmed`, `cli-tty`).

## What becomes of a refusal

- **`REJECTED` on an ADR**: the architect runs DESIGN again with your reason. Past 3 rejections,
  the run asks the `blocked` question on `design`: an instruction starts the architect again,
  `STOP` ends the run (`loop-ceiling`).
- **`DECLINED` on a consent**: the answer is written in `skraft-config.json`
  (`publish.pullRequest` or `publish.visuals`) and not asked again; the run goes on locally
  ([Publish a run's pull request]({{ "/en/how-to/publish-pull-request" | relative_url }})).
- **`review-consent`**: the answer (`ACCEPTED` or `DECLINED`) is kept once per repository in your
  own `~/.skraft/config.json` (`reviewComments`), not in `skraft-config.json`; a `DECLINED` keeps
  the review comment off the pull request.
- **`ABORT`**: the run ends `blocked` (code `environment`); start a new slug once the machine is
  repaired.
- **`STOP`**: the run ends `blocked`, for good for this slug.

## Troubleshooting

A refused answer records nothing; the run still waits.

| Message | Action |
|---|---|
| `no question adr-2; waiting: adr-1` | Use the key the message names. |
| `adr-1 was already answered RATIFIED` | Nothing to do: resume the run. |
| `REJECTED needs the reason, which goes back to the agent` | Add `--reason "…"`. |
| `the answer must be one of RATIFIED, REJECTED` | Write one of the options. |
| `skraft decide records a person's answer: run it yourself in an interactive terminal; nothing was recorded` | Run the command yourself, in an interactive terminal. |
| `Refused: …; nothing was recorded.` (Copilot) | Answer with `skraft decide` in a terminal, then resume the workflow. |

## See also

- [`skraft decide`]({{ "/en/reference/cli" | relative_url }}) — arguments, keys, messages.
- [Hosts]({{ "/en/reference/hosts" | relative_url }}) — dialog, pane, `skraft_decide` and
  canvas, host by host.
- [Phases]({{ "/en/reference/phases" | relative_url }}#human-questions) — who asks each question.
- [Resume or unblock a run]({{ "/en/how-to/resume-a-run" | relative_url }})
