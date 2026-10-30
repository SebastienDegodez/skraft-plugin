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

To work on a clone of the plugin, load `plugins/skraft-framework` with `--plugin-dir` instead of
installing it.

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

In **Chat: Open Customizations**, **Plugins** section, `skraft` is listed and enabled.

## 2. Add the optional plugins

`skraft-backlog` (DISCOVER, DISCUSS) and `skraft-brownfield` come from the same marketplace and
install separately, the same way:

| Host | Command |
| --- | --- |
| Claude Code | `/plugin install skraft-backlog`, `/plugin install skraft-brownfield` |
| Copilot CLI | `copilot plugin install skraft-backlog@skraft`, `copilot plugin install skraft-brownfield@skraft` |
| VS Code | **Chat: Open Customizations**, **Browse**, the plugin's name |

## 3. Check that the command line answers

The command line is a Node script shipped in the plugin. From the root of your repository, under
sh as under PowerShell, with `<plugin folder>` the folder where the host installed `skraft`:

```text
node "<plugin folder>/engine/drivers/cli/skraft.mjs" --version
```

You see the plugin's version, for instance `2.0.0-alpha.19`. The other guides write
`skraft <command>` for this full line.

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
| VS Code | the chat's agent picker | skraft's orchestrator agent is in the list |

## Troubleshooting

- **Windows, `/plugin marketplace add` fails on a path that is too long**: clone the repository
  to a short path (`git clone https://github.com/SebastienDegodez/skraft-plugin C:\s\skraft`),
  then `/plugin marketplace add C:\s\skraft` and `/plugin install skraft`.
- **`node: Node v20…; skraft needs Node 22 or later`**: install Node 22 or later, then run again.
- **Copilot CLI: `skraft:skraft-orchestrator` missing**: check `copilot plugin list`, then open a
  new session; a run refused for that reason carries the code `agent-unavailable`.

## See also

- [Hosts]({{ "/en/reference/hosts" | relative_url }}) — install, drivers and capabilities of
  each host.
- [First steps]({{ "/en/tutorials/getting-started" | relative_url }}) — the full path, from
  install to pull request.
- [Configure the components]({{ "/en/how-to/configure-components" | relative_url }})
