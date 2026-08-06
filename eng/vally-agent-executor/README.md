# Vally real-agent executor

Contributor-only evaluation adapter. Selects a real SKRAFT custom agent from a Vally stimulus, gives that agent the stimulus prompt unchanged, and returns a Vally trajectory containing identity and loading evidence.

This directory is outside `plugins/`: evaluation code and fixtures must not ship in the user-facing SKRAFT plugin.

## Alignment with Vally's execution model

Vally's [How it works](https://microsoft.github.io/vally/concepts/how-it-works/#1-stimulus)
defines five stages. This adapter follows them directly:

| Vally concept | This implementation |
|---|---|
| Stimulus | `tests/agents/agent-behavior/eval.yaml`: neutral business prompt, environment fixture, constraints through timeout, deterministic graders |
| Executor | `plugin.mjs` + `executor.mjs`: resolve selected agent, prepare SDK runner, pass prompt unchanged |
| Agent execution | `executor.mjs`: select custom agent, enforce read-only limits, capture SDK events |
| Trajectory | Vally's public `CopilotAdapter` converts SDK events, including real `skill.invoked` → `skill_activation` |
| Graders and score | Built-in output, `skill-invocation`, and workspace graders; threshold `1` requires every check to pass |

`tags.agent` is not a built-in Vally routing field. It is executor-specific stimulus
configuration interpreted through an allowlist. Vally remains responsible for fixture
staging and grading; executor remains responsible for agent selection and skill loading.

## Why an executor

A prompt such as `Act as the Software Engineer` lets a generic model imitate the role. It does not prove that the custom-agent file or its skills were loaded.

Selection therefore happens in deterministic executor code:

1. `tags.agent` identifies an allowlisted agent.
2. `agent-descriptor.mjs` reads the exact source file, hashes it, and checks that its skill list matches framework configuration.
3. `executor.mjs` creates a Copilot SDK session with that agent preselected.
4. Agent body and companion instructions become custom-agent prompt context.
5. The runner passes `plugins/skraft-framework/skills` as Vally's `--skill-dir`, making the complete
	SKRAFT skill catalog available without injecting every skill into context.
6. Agent-required skills activate through the runtime skill tool. Vally's
	`CopilotAdapter` emits a typed `skill_activation` event for each real activation.
7. Vally graders inspect trajectory and final workspace.

The business prompt remains role-neutral. Persona text never appears in stimulus prompt.

## Files

| File | Responsibility |
|---|---|
| `agent-descriptor.mjs` | Resolve allowlisted source, parse agent metadata, detect skill-config drift, load companion instructions, compute SHA-256 |
| `executor.mjs` | Vally-facing orchestration: select agent, create SDK session, pass events through `CopilotAdapter`, attach selected-agent audit event |
| `tests/agents/agent-behavior/eval.yaml` | Real-agent Vally stimuli and deterministic graders |

Executor tests live under `tests/dashboard/`; agent eval suites and fixtures live under `tests/agents/`.

## Evidence model

Three independent proofs are required:

- **Identity** — trajectory metadata records agent id, source path, declared model, and SHA-256.
- **Loading** — real `skill_activation` events and Vally's built-in
	`skill-invocation` grader prove relevant skills were actually activated.
- **Outcome** — later graders inspect output, commands, tests, and workspace diff.

Agent prose such as `I loaded outside-in-tdd` satisfies none of these proofs.

## Pilot safety

Initial missing-precondition pilot is read-only:

- custom agent receives skill + read-only workspace tools only;
- Copilot permission handler approves reads and rejects writes/shell requests;
- Vally owns isolated workspace;
- infinite sessions and session telemetry are disabled;
- one worker and bounded timeout are required for live run.

Tool mapping and file writes belong to later Node red-to-green slice, after routing is proven.

## Current status

Implemented and locally tested:

- exact `software-engineer` allowlist resolution;
- unchanged prompt forwarding;
- agent body and companion instruction composition;
- full SKRAFT skill-catalog availability via `--skill-dir`;
- SDK event conversion through Vally's `CopilotAdapter`;
- identity and loading evidence in trajectory.

Completed wiring:

- executor plugin registration through `registerExecutors`;
- `@microsoft/vally` and `@github/copilot-sdk` dependencies;
- missing-precondition `eval.yaml` and empty-workspace fixture;
- strict Vally 0.12.0 spec validation.
- built-in `skill-invocation` grading over real `skill_activation` events;

## Local tests

```bash
node --test tests/dashboard/agent-executor.acceptance.test.mjs
npm run test:dashboard
npm run ci:local
```

## Live pilot

Authenticate with GitHub CLI or set `COPILOT_GITHUB_TOKEN`, then run:

```bash
npm run evals -- agents agent-behavior
```

The missing-precondition suite declares `gpt-5.6-luna` and one run in its Vally
defaults. Agent suites own model and run count; runner-wide `MODEL` and `RUNS`
overrides apply only to skill comparisons. Override `AGENT_WORKERS` or
`RESULTS_DIR` through environment variables.
The same runner discovers both `tests/skills/**` and `tests/agents/**`. Skill suites run
paired baseline/treatment experiments; agent suites run once through their custom executor.

Passing `plugins/skraft-framework/skills` makes all SKRAFT skills discoverable. It does **not** activate
all skills or inject all bodies into context: each stimulus still grades only the skills
relevant to that behavior.

## Known constraints

- Repository runner requests Vally 0.12.0; current developer machine may expose another global version. Plugin contract must be verified against pinned repository version.
- Software Engineer source declares `Claude Sonnet 5`, while runtime model uses Vally's concrete supported model id.
- Agent prose makes `quality-gates-dotnet` stack-conditional, but framework configuration currently marks it mandatory. A non-.NET implementation slice must expose and resolve this mismatch rather than silently ignore it.
