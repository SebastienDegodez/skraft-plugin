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
   `<CLAUDE_CONFIG_DIR or ~/.claude>/plugins/installed_plugins.json` (latest update first).

When both hosts have the plugin, Copilot CLI wins. Nothing is recorded, so a plugin update by
the host is followed at the next call: this package never needs updating with the plugin.
`skraft --version` also writes the host and folder it used on stderr.

## Session

`skraft` alone, in a terminal, opens a session: the banner sweeps in once, then each line is a
skraft command (`doctor`, `status`, `decide yes`…), with Tab completion and history. Each line
runs the engine in its own process and finds the plugin again, so a plugin update during the
session is followed. `help` prints the engine's usage; `exit`, `quit` or Ctrl-D leaves.

- A one-shot command (`skraft doctor`) never shows the banner: its output is the engine's.
- `NO_COLOR` keeps the banner uncoloured; `SKRAFT_BANNER=static` skips the animation,
  `SKRAFT_BANNER=0` turns it off. The legacy Windows console gets plain ASCII letters.
- `SKRAFT_INTERACTIVE=0` keeps `skraft` alone a call to the engine (its usage).

## Upgrade

`skraft upgrade` installs the latest `@skraft/cli` of its channel (`latest`, or `alpha` when the
installed version is an alpha), then updates the plugin in each host that has it
(`copilot plugin update skraft`, `claude plugin update skraft@<marketplace>`; Claude Code loads it
at its next session). A step whose program is not on the PATH is skipped; a failed step makes the
command exit 1 and the others still run.

A session asks the registry, at most once a day (cache `~/.skraft/cli-update.json`, 1.5 s
timeout, silent on any failure), whether a newer version exists, and says so. It never installs
anything by itself. `SKRAFT_UPDATE_CHECK=0` turns the check off (it is off in CI);
`SKRAFT_REGISTRY` names another registry, for instance a company mirror.

## Versions

`@skraft/cli` has its own version, independent of the plugin's. It changes only when the way
the plugin is found changes. It is published by hand with the `Publish @skraft/cli` workflow (npm
trusted publishing); plugin releases never publish it.

- From `main`: the version of `package.json`, dist-tag `latest`, tag `cli-v<version>`.
- From any other branch: `<version>-alpha.<run number>`, dist-tag `alpha`, no commit and no tag.
  Install it with `npm i -g @skraft/cli@alpha`.

`package.json` always holds the plain version (no `-alpha` suffix). `1.0.0` is the first stable
release, published from `main`.
Commits that touch only this folder use the `cli` scope (`feat(cli): …`): they never bump the
plugin's version.

## Development

Tests: `npm run test:cli` from the repository root (`tests/cli/`), on Linux, macOS and Windows
in CI (`cli-ci.yml`). No runtime dependency; Node 22 or later.
