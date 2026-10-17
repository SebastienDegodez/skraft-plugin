# drivers/cli

`skraft.mjs` is the composition root of the command line: it reads `process`, wires adapters and sets the exit code.
`run-cli.mjs` holds the argument dispatch and receives its services and console as parameters.
Never imports another driver.

| Command | Use case | Exit |
| --- | --- | --- |
| `skraft init [--add <folder>]...` | ConfigureComponents: one component per project into `skraft-config.json` | 0, 1 invalid config |
| `skraft init <slug> [--issue <n>] [--title <t>] [--base <ref>]` | Init: active pipeline, journal, bases | 0, 1 refused |
| `skraft status [--json]` | Observe | 0, 1 tampered |
| `skraft gate [--all] [--json]` | RunGate: touched components, or all | 0 passed, 1 otherwise |
| `skraft doctor [--run] [--base <ref>] [--json]` | Doctor | 0 every check ok, 1 otherwise |

A malformed command line prints the usage and exits 2.
