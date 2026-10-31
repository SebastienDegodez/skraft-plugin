---
layout: doc
lang: fr
title: "Installer skraft sur un hôte"
description: "Installer le plugin skraft dans Claude Code, GitHub Copilot CLI ou VS Code, puis vérifier que l'hôte le voit et que la ligne de commande skraft répond."
persona: software-engineer
---

# Installer skraft sur un hôte

**But** : le plugin `skraft` est installé sur votre hôte, et la ligne de commande `skraft` répond
depuis votre dépôt.

## Prérequis

- Node 22 ou plus, et Git.
- Un hôte : Claude Code, GitHub Copilot CLI, ou VS Code avec GitHub Copilot.
- `gh` connecté seulement pour lire l'issue d'une story ou ouvrir la pull request
  ([Hôtes]({{ "/fr/reference/hosts" | relative_url }}#prerequisites)).

## 1. Installer le plugin

Le dépôt `SebastienDegodez/skraft-plugin` est une marketplace nommée `skraft` ; le plugin du
pipeline s'y appelle aussi `skraft`.

### Claude Code

Saisissez dans la conversation, pas dans un terminal :

```text
/plugin marketplace add SebastienDegodez/skraft-plugin
/plugin install skraft
```

Ouvrez `/plugin` : `skraft` figure parmi les plugins installés.

### GitHub Copilot CLI

Dans un terminal :

```text
copilot plugin marketplace add SebastienDegodez/skraft-plugin
copilot plugin install skraft@skraft
```

Dans une session Copilot, les mêmes commandes s'écrivent `/plugin marketplace add …` et
`/plugin install skraft@skraft`. Vérifiez avec `copilot plugin list` : `skraft` y figure.

Pour travailler sur un clone du plugin, installez-le depuis son dossier local :
`copilot plugin install ./plugins/skraft-framework`.

### VS Code

1. Dans `settings.json`, activez les plugins d'agent et ajoutez la marketplace :

   ```json
   "chat.plugins.enabled": true,
   "chat.plugins.marketplaces": ["SebastienDegodez/skraft-plugin"]
   ```

2. Lancez **Chat: Open Customizations**, onglet **Browse**, cherchez `skraft`, puis
   **Install**. Vous pouvez aussi chercher `@agentPlugins` dans la vue Extensions.
3. Pour un clone local, déclarez son dossier au lieu d'installer :

   ```json
   "chat.pluginLocations": { "<chemin du clone>/plugins/skraft-framework": true }
   ```

   En JSON, doublez chaque antislash d'un chemin Windows natif :
   `"C:\\src\\skraft-plugin\\plugins\\skraft-framework": true`.

Dans **Chat: Open Customizations**, section **Plugins**, `skraft` figure et est activé.

## 2. Ajouter les plugins optionnels

`skraft-backlog` (DISCOVER, DISCUSS) et `skraft-brownfield` viennent de la même marketplace et
s'installent à part, de la même façon :

| Hôte | Commande |
| --- | --- |
| Claude Code | `/plugin install skraft-backlog`, `/plugin install skraft-brownfield` |
| Copilot CLI | `copilot plugin install skraft-backlog@skraft`, `copilot plugin install skraft-brownfield@skraft` |
| VS Code | **Chat: Open Customizations**, **Browse**, le nom du plugin |

## 3. Rendre la commande `skraft` disponible {#skraft-command}

Installez la commande une fois par machine, sous sh comme sous PowerShell (Node 22 ou plus) :

```text
npm i -g @skraft/cli
```

npm place `skraft` dans son dossier global, déjà présent dans votre PATH (avec un `skraft.cmd`
sous Windows). Le paquet ne contient aucun moteur : à chaque appel, `skraft` trouve le plugin que
votre hôte a installé et lance son moteur, dans cet ordre :

1. le dossier nommé par `SKRAFT_PLUGIN_ROOT`, quand la variable est posée ;
2. GitHub Copilot CLI : `~/.copilot/installed-plugins/<marketplace>/skraft/` ;
3. Claude Code : le dossier courant de `skraft@…` dans `~/.claude/plugins/installed_plugins.json`.

Quand les deux hôtes ont le plugin, Copilot CLI l'emporte. Une mise à jour du plugin par l'hôte
est suivie dès l'appel suivant : la commande elle-même n'a jamais besoin d'être mise à jour avec
le plugin. `skraft upgrade` met à jour la commande et le plugin dans chaque hôte ; `skraft` seul
ouvre une session où vous tapez les commandes l'une après l'autre.

Depuis la racine de votre dépôt :

```text
skraft --version
```

Vous voyez la version du plugin, par exemple `2.0.0-alpha.19`, et sur stderr l'hôte et le dossier
qui ont répondu (`plugin: copilot …`). Les autres guides écrivent `skraft <commande>` pour cette
commande. Sans le paquet, la ligne longue marche toujours :
`node "<dossier du plugin>/engine/drivers/cli/skraft.mjs" <commande>`.

Lancez ensuite `skraft doctor`. Dans un dépôt pas encore configuré :

```text
ok    node: Node v22.…
FAIL  config: no skraft-config.json; run skraft init to detect the components
ok    vscode: …
skraft doctor: 1 checks failed
```

Le `FAIL` sur `config` est attendu : il disparaît une fois les composants détectés
([Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }})). Sous
VS Code, la ligne `vscode` dit quel pilote conduira le run : le SDK Copilot
(`engine/drivers/copilot-sdk/skraft-run.mjs`) s'il est trouvé, sinon l'agent orchestrateur qui
conduit `skraft next` et `skraft record`.

## 4. Vérifier que l'hôte voit skraft

| Hôte | Vérification | Résultat attendu |
| --- | --- | --- |
| Claude Code | `/skraft` dans la conversation | le panneau **Skraft** s'ouvre et affiche `skraft — idle` |
| Copilot CLI | `/agent` dans une session | `skraft:skraft-orchestrator` figure dans la liste |
| Copilot CLI | `/skraft` dans une session | la commande répond et ne lance aucun run : elle ouvre la vue du run, ou dit de taper `skraft status` |
| VS Code | le sélecteur d'agent du chat | l'agent orchestrateur de skraft figure dans la liste |
| VS Code | `/skraft` dans le chat | non mesuré |

Copilot expose la commande sous le nom `/skraft`, sans préfixe (mesuré sur Copilot CLI 1.0.105 dans le registre de commandes du SDK) ; `skraft-refine` du plugin backlog est
`/skraft-backlog:skraft-refine`. Le menu de Copilot CLI et VS Code n'ont pas été mesurés : si `/skraft` y manque, vérifiez la liste des plugins et ouvrez une nouvelle session.

## Dépannage

- **Windows, `/plugin marketplace add` échoue sur un chemin trop long** : clonez le dépôt dans
  un chemin court (`git clone https://github.com/SebastienDegodez/skraft-plugin C:\s\skraft`),
  puis `/plugin marketplace add C:\s\skraft` et `/plugin install skraft`.
- **`node: Node v20…; skraft needs Node 22 or later`** : installez Node 22 ou plus, puis relancez.
- **Copilot CLI : `skraft:skraft-orchestrator` absent** : vérifiez `copilot plugin list`, puis
  ouvrez une nouvelle session ; un run refusé pour cette raison porte le code `agent-unavailable`.

- **`skraft: command not found` après `npm i -g @skraft/cli`** : ouvrez un nouveau terminal ;
  `npm prefix -g` montre le dossier où npm installe, qui doit être dans votre PATH.
- **`skraft: the skraft plugin was not found in GitHub Copilot CLI nor in Claude Code`** :
  installez le plugin dans un hôte (étape 1), ou posez `SKRAFT_PLUGIN_ROOT` sur le dossier du
  plugin, par exemple un clone.
- **`skraft` lance le mauvais plugin** : `skraft --version` nomme l'hôte et le dossier utilisés.
  Posez `SKRAFT_PLUGIN_ROOT` pour en choisir un autre.
- **Vous aviez lancé `skraft install` avec une version précédente** : supprimez `~/.skraft/bin`
  (et sa ligne dans le profil de votre shell, ou dans le PATH utilisateur sous Windows), puis
  installez le paquet.

## Voir aussi

- [Hôtes]({{ "/fr/reference/hosts" | relative_url }}) — installation, pilotes et capacités de
  chaque hôte.
- [Premiers pas]({{ "/fr/tutorials/getting-started" | relative_url }}) — le parcours complet,
  de l'installation à la pull request.
- [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }})
