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
