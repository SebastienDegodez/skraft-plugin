# @skraft/cli

The `skraft` command for your terminal.

```sh
npm i -g @skraft/cli
skraft --version
```

The package holds no engine. At each call, `skraft` finds the skraft plugin your host installed
and runs that plugin's engine (`engine/drivers/cli/skraft.mjs`) in the same process, arguments
unchanged:

1. the folder named by `SKRAFT_PLUGIN_ROOT`, when the variable is set (no fallback when it names
   a folder without the engine);
2. GitHub Copilot CLI: `<COPILOT_HOME or ~/.copilot>/installed-plugins/<marketplace>/skraft/`
   (the marketplace named `skraft` first);
3. Claude Code: the current folder of `skraft@…` in
   `<CLAUDE_CONFIG_DIR or ~/.claude>/plugins/installed_plugins.json`: an install scoped to a
   repository (`local`, then `project`) only inside that repository, then the `user` one; the
   latest update first among equals.

When both hosts have the plugin, Copilot CLI wins. Nothing is recorded, so a plugin update by
the host is followed at the next call: this package never needs updating with the plugin.
`skraft --version` also writes the host and folder it used on stderr.

## Session

`skraft` alone, in a terminal, opens a session: the banner sweeps in once, then each line is a
skraft command (`doctor`, `status`, `decide yes`…), with history. Each line runs the engine in
its own process and finds the plugin again, so a plugin update during the session is followed.
The commands come from the engine's `skraft commands --json`: `help` lists them, `help <command>`
shows one, Tab completes commands, sub-commands and options, and a mistyped command is refused
with the closest name before the engine runs. While a command runs, the terminal is its own:
Ctrl-C stops the command, not the session. `exit`, `quit` or Ctrl-D leaves.

- A one-shot command (`skraft doctor`) never shows the banner: its output is the engine's.
- `NO_COLOR` keeps the banner uncoloured; `SKRAFT_BANNER=static` skips the animation,
  `SKRAFT_BANNER=0` turns it off. The legacy Windows console gets plain ASCII letters.
- `SKRAFT_INTERACTIVE=0` keeps `skraft` alone a call to the engine (its usage).

## Upgrade

`skraft upgrade` installs the latest `@skraft/cli` of its channel (`latest`, or `alpha` when the
installed version is an alpha), then updates the plugin in each host that has it
(`copilot plugin update skraft`, `claude plugin update skraft@<marketplace>`; Claude Code loads it
at its next session). Each program is found on the PATH and started with an argument list, never
through a shell (a Windows `.cmd` runs through cmd.exe, with plain words only). A step whose
program is not on the PATH is skipped; a failed step makes the command exit 1 and the others
still run.

A session asks the registry, at most once a day (cache `~/.skraft/cli-update.json`, 1.5 s
timeout, silent on any failure), whether a newer version exists, and says so. It never installs
anything by itself. `SKRAFT_UPDATE_CHECK=0` turns the check off (it is off in CI);
`SKRAFT_REGISTRY` names another registry, for instance a company mirror.

## Versions

`@skraft/cli` has its own version, independent of the plugin's, computed by semantic-release
from the commits that touch this folder only (`.releaserc.json`, `semantic-release-monorepo`):
`feat` → minor, `fix` → patch, `BREAKING CHANGE` → major. The `Release @skraft/cli` workflow
runs on each push that touches `cli/`:

- `integration/v2-next`: `1.0.0-alpha.N`, dist-tag `alpha` (`npm i -g @skraft/cli@alpha`);
- `main`: stable, dist-tag `latest`, starting at `1.0.0`.

Tags are `cli-v<version>`. Nothing is committed back: `package.json` keeps
`0.0.0-development`, the version is written into the package at publish time. Commits that touch
only this folder use the `cli` scope (`feat(cli): …`): the plugin's release ignores them.

## Development

Tests: `npm run test:cli` from the repository root (`tests/cli/`), on Linux, macOS and Windows
in CI (`cli-ci.yml`). No runtime dependency; Node 22 or later.
