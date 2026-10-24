# drivers/cli

`skraft.mjs` is the composition root of the command line: it reads `process`, wires adapters and sets the exit code.
`run-cli.mjs` holds the argument dispatch and receives its services and console as parameters.
Never imports another driver.

| Command | Use case | Exit |
| --- | --- | --- |
| `skraft init [--add <folder>]...` | ConfigureComponents: one component per project into `skraft-config.json` | 0, 1 invalid config |
| `skraft init <slug> [--issue <n>] [--title <t>] [--base <ref>] [--from-artifacts]` | Init: active pipeline, journal, bases; from the DISCUSS stories, starts in DESIGN | 0, 1 refused |
| `skraft status [--json]` | Observe; a run that waits shows its question and how to answer it | 0, 1 tampered |
| `skraft decide [<key>] <answer> [--reason <text>]` | Decide: records the answer; the next run acts on it | 0, 1 refused |
| `skraft next [--json]` | RunPipeline through the agent loop, on Copilot's agents: runs until the run needs agents or a human; refused while handed over agents are not recorded | 0 dispatch, waiting or done; 1 blocked or refused |
| `skraft record [--json]` | Hands the saved replies of the handed over agents to the run, then runs on as `next` does | as `next` |
| `skraft gate [--all] [--json]` | RunGate: touched components, or all | 0 passed, 1 otherwise |
| `skraft doctor [--run] [--base <ref>] [--json]` | Doctor | 0 every check ok, 1 otherwise |

A malformed command line prints the usage and exits 2.

## Agent loop (VS Code without the Copilot SDK)

`agent-loop.mjs` and `loop-agent-runner.mjs`: the fallback driver an agent conducts. `next` runs
RunPipeline with an AgentRunner that, for dispatches it has no reply for, writes each brief and
an empty reply file under `<slug>/results/loop/`, lists them in `pending.json`, and stops the run
(`HandedOver`); the step it prints names each agent, its Copilot model, the prompt to start it
with, its reply file and the `record` command, with the absolute path of `skraft.mjs`. `record`
reads the reply files into `replies.json` and runs on: a dispatch asked again since the last
`next` gets its recorded reply, as a Copilot workflow run answers a call it already made. A
question makes the run wait; the human answers with `skraft decide`, then the agent runs `next`.
Lenses run one after the other. The journal is the one the Copilot workflow writes, without the
models and costs the loop cannot know.
