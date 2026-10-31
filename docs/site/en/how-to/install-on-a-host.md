---
layout: doc
lang: en
title: "Install skraft on a host"
description: "Install the skraft plugin in Claude Code, GitHub Copilot CLI or VS Code, then check that the host sees it and that the skraft command line answers."
persona: software-engineer
---

# Install skraft on a host

**Goal**: the `skraft` plugin is installed on your host, and the `skraft` command line answers
from your repository.

## Prerequisites

- Node 22 or later, and Git.
- A host: Claude Code, GitHub Copilot CLI, or VS Code with GitHub Copilot.
- `gh` signed in, only to read a story's issue or open the pull request
  ([Hosts]({{ "/en/reference/hosts" | relative_url }}#prerequisites)).

## 1. Install the plugin

The `SebastienDegodez/skraft-plugin` repository is a marketplace named `skraft`; the pipeline's
plugin in it is also called `skraft`.

### Claude Code

Type in the conversation, not in a terminal:

```text
/plugin marketplace add SebastienDegodez/skraft-plugin
/plugin install skraft
```

Open `/plugin`: `skraft` is among the installed plugins.

### GitHub Copilot CLI

In a terminal:

```text
copilot plugin marketplace add SebastienDegodez/skraft-plugin
copilot plugin install skraft@skraft
```

In a Copilot session, the same commands read `/plugin marketplace add …` and
`/plugin install skraft@skraft`. Check with `copilot plugin list`: `skraft` is listed.

To work on a clone of the plugin, install it from its local folder:
`copilot plugin install ./plugins/skraft-framework`.

### VS Code

1. In `settings.json`, enable agent plugins and add the marketplace:

   ```json
   "chat.plugins.enabled": true,
   "chat.plugins.marketplaces": ["SebastienDegodez/skraft-plugin"]
   ```

2. Run **Chat: Open Customizations**, **Browse** tab, search for `skraft`, then **Install**.
   You can also search for `@agentPlugins` in the Extensions view.
3. For a local clone, declare its folder instead of installing:

   ```json
   "chat.pluginLocations": { "<clone path>/plugins/skraft-framework": true }
   ```

   In JSON, double each backslash of a native Windows path:
   `"C:\\src\\skraft-plugin\\plugins\\skraft-framework": true`.

In **Chat: Open Customizations**, **Plugins** section, `skraft` is listed and enabled.

## 2. Add the optional plugins

`skraft-backlog` (DISCOVER, DISCUSS) and `skraft-brownfield` come from the same marketplace and
install separately, the same way:

| Host | Command |
| --- | --- |
| Claude Code | `/plugin install skraft-backlog`, `/plugin install skraft-brownfield` |
| Copilot CLI | `copilot plugin install skraft-backlog@skraft`, `copilot plugin install skraft-brownfield@skraft` |
| VS Code | **Chat: Open Customizations**, **Browse**, the plugin's name |

## 3. Make the `skraft` command available {#skraft-command}

Install the command once per machine, under sh as under PowerShell (Node 22 or later):

```text
npm i -g @skraft/cli
```

npm puts `skraft` in its global folder, which is already in your PATH (with a `skraft.cmd` on
Windows). The package holds no engine: at each call, `skraft` finds the plugin your host
installed and runs its engine, in this order:

1. the folder named by `SKRAFT_PLUGIN_ROOT`, when the variable is set;
2. GitHub Copilot CLI: `~/.copilot/installed-plugins/<marketplace>/skraft/`;
3. Claude Code: the current folder of `skraft@…` in `~/.claude/plugins/installed_plugins.json`.

When both hosts have the plugin, Copilot CLI wins. A plugin update by the host is followed at
the next call: the command itself never needs updating with the plugin.

From the root of your repository:

```text
skraft --version
```

You see the plugin's version, for instance `2.0.0-alpha.19`, and on stderr the host and folder
that answered (`plugin: copilot …`). The other guides write `skraft <command>` for this command.
Without the package, the long line still works:
`node "<plugin folder>/engine/drivers/cli/skraft.mjs" <command>`.

Then run `skraft doctor`. In a repository not configured yet:

```text
ok    node: Node v22.…
FAIL  config: no skraft-config.json; run skraft init to detect the components
ok    vscode: …
skraft doctor: 1 checks failed
```

The `FAIL` on `config` is expected: it goes away once the components are detected
([Configure the components]({{ "/en/how-to/configure-components" | relative_url }})). Under
VS Code, the `vscode` line says which driver will run the pipeline: the Copilot SDK
(`engine/drivers/copilot-sdk/skraft-run.mjs`) when it is found, else the orchestrator agent that
conducts `skraft next` and `skraft record`.

## 4. Check that the host sees skraft

| Host | Check | Expected result |
| --- | --- | --- |
| Claude Code | `/skraft` in the conversation | the **Skraft** pane opens and shows `skraft — idle` |
| Copilot CLI | `/agent` in a session | `skraft:skraft-orchestrator` is in the list |
| Copilot CLI | `/skraft` in a session | the command answers and starts no run: it opens the run view, or tells you to type `skraft status` |
| VS Code | the chat's agent picker | skraft's orchestrator agent is in the list |
| VS Code | `/skraft` in the chat | not measured yet |

Copilot exposes the command as `/skraft`, without a prefix (measured on Copilot CLI 1.0.105 in the SDK's command registry); the backlog plugin's `skraft-refine` is
`/skraft-backlog:skraft-refine`. The Copilot CLI menu and VS Code were not measured: if `/skraft` is missing there, check the plugin list and open a new session.

## Troubleshooting

- **Windows, `/plugin marketplace add` fails on a path that is too long**: clone the repository
  to a short path (`git clone https://github.com/SebastienDegodez/skraft-plugin C:\s\skraft`),
  then `/plugin marketplace add C:\s\skraft` and `/plugin install skraft`.
- **`node: Node v20…; skraft needs Node 22 or later`**: install Node 22 or later, then run again.
- **Copilot CLI: `skraft:skraft-orchestrator` missing**: check `copilot plugin list`, then open a
  new session; a run refused for that reason carries the code `agent-unavailable`.

- **`skraft: command not found` after `npm i -g @skraft/cli`**: open a new terminal; `npm prefix -g`
  shows the folder npm installs into, which must be in your PATH.
- **`skraft: the skraft plugin was not found in GitHub Copilot CLI nor in Claude Code`**: install the
  plugin in a host (step 1), or set `SKRAFT_PLUGIN_ROOT` to the plugin folder, for instance a clone.
- **`skraft` runs the wrong plugin**: `skraft --version` names the host and folder it used. Set
  `SKRAFT_PLUGIN_ROOT` to choose another one.
- **You ran `skraft install` with an earlier version**: remove `~/.skraft/bin` (and its line in your
  shell profile, or from your user PATH on Windows), then install the package.

## See also

- [Hosts]({{ "/en/reference/hosts" | relative_url }}) — install, drivers and capabilities of
  each host.
- [First steps]({{ "/en/tutorials/getting-started" | relative_url }}) — the full path, from
  install to pull request.
- [Configure the components]({{ "/en/how-to/configure-components" | relative_url }})
