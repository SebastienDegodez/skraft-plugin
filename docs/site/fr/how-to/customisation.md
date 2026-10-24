---
layout: doc
lang: fr
title: "Personnaliser SKRAFT"
description: "Ce que vous pouvez adapter aujourd'hui en V2 (composants, commandes, base, mocking, modèles et niveau de réflexion par agent, questions à un humain), ce qui arrive aux lots suivants, et le risque de chaque contrôle que vous réduisez."
persona: tech-lead
---

# Personnaliser SKRAFT

**But** : adapter SKRAFT à votre dépôt sans retirer, par mégarde, une preuve dont votre équipe dépend.

En V2, le **moteur** décide de l'ordre des phases, des sorties attendues, des relances, des verdicts et des gates. Vous ne réglez pas ces décisions ; vous décrivez votre dépôt dans `skraft-config.json`, et le moteur s'y tient.

## Ce que vous pouvez adapter aujourd'hui

Tout passe par `skraft-config.json`, à la racine de la copie de travail qui lance le run.

| Quoi | Où | Effet | Guide |
|---|---|---|---|
| Les composants | `components[]` : `name`, `root`, `stack` | Ce que le moteur construit et teste, y compris un dépôt voisin (`../payment-web`) | [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }}) |
| Les commandes | `commands` d'un composant | Une commande écrite par vous est **toujours** celle qui tourne ; le moteur ne la remplace jamais par un défaut | [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }}) |
| Les gates | les commandes nommées `build`, `format`, `lint`, `test`, `architecture`, `coverage`, `mutation` | Ce que `skraft gate` lance, dans cet ordre | [Lancer les gates]({{ "/fr/how-to/run-gates" | relative_url }}) |
| La base | `baseBranch` global ou par composant, `--base <ref>` à l'init | Le commit de comparaison : composants modifiés, `{baseSha}` dans les commandes | [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }}) |
| Le mocking | `mocking.strategy` : `"microcks"` ou `"inprocess"` | `microcks` (défaut) exige Docker pour les gates de test ; `inprocess` ne l'exige pas | [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }}) |
| Modèles et niveau de réflexion | `models`, `assign`, aussi dans `~/.skraft/config.json` et `skraft-config.local.json` | Le modèle et le niveau de réflexion de chaque agent, par hôte | [ci-dessous](#models-and-effort) |

Ce qui ne se règle pas :

- Les **seuils qualité** ne sont pas configurables.
- L'ordre des phases, le nombre de tentatives d'un agent et les codes de blocage sont dans le moteur.
- Les clés `paths` et `contractTesting` d'un composant sont acceptées, mais le moteur ne les lit qu'à partir des lots 3 et 6.

Les autres clés de premier niveau de `skraft-config.json` sont conservées telles quelles par `skraft init`.

## Choisir le modèle et le niveau de réflexion de chaque agent {#models-and-effort}

`models` et `assign` choisissent ce sur quoi chaque agent tourne, sous Claude Code et sous Copilot. Quatre fichiers s'appliquent, chacun un JSON Merge Patch sur les précédents (un objet est fusionné clé par clé, une liste ou une valeur remplace la précédente, `null` la supprime) :

1. les défauts du plugin : `economy` → `haiku`, `standard` → `sonnet`, `frontier` → `opus` sous Claude Code ; les lentilles sur `reviewer`, `solution-researcher` sur `researcher`, `solution-architect` sur `planner`, tout autre agent sur `implementer` ;
2. `~/.skraft/config.json`, le vôtre, pour tous vos dépôts ;
3. `skraft-config.json`, celui de l'équipe, commité ;
4. `skraft-config.local.json`, le vôtre, jamais commité : `skraft init` l'ajoute au `.gitignore`.

Les fichiers 2 et 4 suivent `plugins/skraft-framework/schemas/skraft-config.local.schema.json` et ne contiennent ni `components` ni `workflow` ; le fichier 3 suit `skraft-config.schema.json`.

- **Une famille** est un palier (`economy` < `standard` < `frontier`, le seul rang), un rôle à palier intégré (`reviewer` → economy, `researcher` et `implementer` → standard, `planner` → frontier ; `"tier"` le change) ou une famille libre qui déclare son `"tier"` (`gpt-codex`). Une famille n'est jamais un modèle versionné : `gpt-5.5` est un modèle.
- **`models`** donne à chaque famille, par hôte (`claude-code`, `copilot`), un `model` — ou une liste essayée dans l'ordre, avec le même niveau — et un `effort` (`low`, `medium`, `high`, `xhigh`, `max`). Ce qu'une famille ne précise pas vient de son palier, puis l'hôte décide.
- **`assign`** choisit la famille : une chaîne la nomme, `inherit` laisse l'hôte choisir, un objet ajoute un `effort` par hôte (jamais un modèle), `null` retire une règle d'un fichier inférieur.

Résolution, famille et niveau séparément :

| Quoi | Le premier qui s'applique |
|---|---|
| Famille | `assign.agents.<agent>` → la famille que nomme un workflow éjecté (`model=`, `<lentille>@<famille>`, `refuter=`) → `assign.types.<phase, lens, refuter, worker>` → `assign.default` → l'hôte (Claude Code : le `model:` du fichier d'agent ; Copilot : `/agents`, puis la session) |
| Modèle pour un hôte | celui de la famille pour cet hôte → celui de son palier → l'hôte |
| Niveau pour un hôte | `assign.agents.<agent>` pour cet hôte → `assign.types.<type>` pour cet hôte → celui de la famille → celui de son palier → l'hôte |
| Réfutateur | une règle ou `refuter=` qui nomme sa famille, sinon un palier au-dessus de la lentille la plus forte qu'il vérifie, `frontier` au plus |

Le fichier local d'un développeur, par exemple :

```json
{
  "$schema": "./plugins/skraft-framework/schemas/skraft-config.local.schema.json",
  "models": {
    "economy":  { "claude-code": { "model": "haiku",  "effort": "low" },    "copilot": { "model": "gpt-5.5", "effort": "low" } },
    "standard": { "claude-code": { "model": "sonnet", "effort": "medium" }, "copilot": { "model": "gpt-5.5", "effort": "high" } },
    "frontier": { "claude-code": { "model": "opus",   "effort": "high" },   "copilot": { "model": "gpt-6.0", "effort": "xhigh" } },
    "implementer": { "copilot": { "model": ["gpt-6.0", "gpt-5.5"] } },
    "gpt-codex":   { "tier": "standard", "copilot": { "model": "gpt-5.5-codex", "effort": "medium" } },
    "deep-review": { "tier": "frontier", "claude-code": { "model": "opus", "effort": "max" }, "copilot": { "model": "gpt-6.0", "effort": "xhigh" } }
  },
  "assign": {
    "types": { "lens": "economy" },
    "agents": {
      "software-engineer": "gpt-codex",
      "cold-reader-lens": "deep-review",
      "architecture-boundaries-lens": { "claude-code": { "effort": "high" }, "copilot": { "effort": "high" } },
      "solution-architect": { "family": "planner", "claude-code": { "effort": "max" } },
      "fitness-lens": null
    }
  }
}
```

Avec `{ "assign": { "agents": { "fitness-lens": "implementer" } } }` dans le fichier de l'équipe, le `null` rend `fitness-lens` à la règle par type : toutes les lentilles tournent sur `economy`, `cold-reader-lens` sur `deep-review` (opus · max, gpt-6.0 · xhigh), `software-engineer` sur `gpt-codex` (sonnet · medium par son palier, gpt-5.5-codex · medium), `acceptance-designer` essaie gpt-6.0 puis gpt-5.5 sous Copilot.

- Sans aucun de ces fichiers, Claude Code reçoit les alias des défauts et Copilot aucun modèle : il lance chaque agent sur le modèle de la session.
- `skraft doctor` affiche, par hôte, chaque agent que lance le workflow avec sa famille, son palier, son modèle, son niveau et la source de chacun, et signale une famille sans modèle pour un hôte, `max` sur un modèle Copilot dont le nom ne contient pas `claude`, `CLAUDE_CODE_EFFORT_LEVEL` et un réglage d'agent de `~/.copilot/settings.json` que skraft masque ; une règle pour un agent que personne ne fournit échoue, avec le nom le plus proche.
- `skraft workflow check` signale un `model=`, `@<famille>` ou `refuter=` de votre workflow qu'une règle par agent masque, défauts du plugin compris.
- Un run journalise ce sur quoi chaque agent a tourné ; une reprise le rejoue, quoi que disent les fichiers depuis.
- Le mod Claude Code passe le modèle mais pas le niveau : `$.agent.spawn` n'en prend aucun (Claude Code 2.1.305) ; le niveau du fichier d'agent s'applique.

## Interroger un humain dans le workflow

Le workflow est un graphe DOT (`workflows/skraft.dot` dans le plugin ; `skraft workflow eject` le copie dans votre dépôt). Un nœud de forme `hexagon` est un **nœud question** : il pose une question à un humain, et le run attend que la réponse arrive. Le workflow par défaut demande la ratification des ADR proposés par DESIGN, une fois la revue de conception passée (les boucles de revue après DESIGN abrégées) :

```text
start -> research -> design -> design_review
design_review -> design  [label="NEEDS_REWORK", max_visits=3]
design_review -> adr     [label="APPROVED"]
adr      [shape=hexagon, question="adr-ratification"]
adr -> distill   [label="RATIFIED"]
adr -> design    [label="REJECTED", max_visits=3]
distill -> distill_review -> deliver -> gates -> mutation -> deliver_review -> exit
mutation -> kill_mutants [label="FAIL", max_visits=5]
kill_mutants [agent="software-engineer", each="survivor-file"]
kill_mutants -> mutation_review   // lenses="test-integrity"
mutation_review -> gates [label="APPROVED"]
```

Les nœuds `gates` et `mutation` sont `locked=true` : un workflow de dépôt n'en retire un qu'avec `unlock="<raison>"`. Déverrouiller `mutation` est la seule façon de se passer du mutation testing ; ce n'est pas recommandé.

Le moteur juge la mutation sur le rapport de l'outil, pas sur son code de sortie. Il note les fichiers changés depuis la base du composant (tous ceux du rapport faute de base, ou quand Git ne sait pas lister les changements) : le cœur (un fichier sous un dossier du composant dont le dernier mot est `domain` ou `application`, comme `Checkout.Domain`, `checkout-domain`, `src/cart/application`) doit atteindre 100 %, le bord (tout le reste) 80 %. Un score, c'est les mutants détectés (tués, en timeout, et les erreurs mémoire de PIT) sur les détectés et les survivants (survécu, sans couverture) ; le seuil n'est pas configurable et décide, quel que soit le code de sortie de l'outil. Quand un périmètre manque son seuil, le moteur envoie ses survivants à `kill_mutants`, un dispatch par fichier. `mutation_review` vérifie les nouveaux tests avec `test-integrity`, puis les gates tournent à nouveau. La boucle s'arrête quand la mutation passe ; quand deux tours ne laissent pas moins de mutants en vie que le meilleur tour précédent (`mutation-stalled`) ; ou à son `max_visits`. Ces deux derniers arrêts nomment les mutants restants.

Le rapport est lu là où la commande par défaut de chaque stack l'écrit : `StrykerOutput/reports/mutation-report.json` (.NET), `reports/mutation/mutation.json` (JavaScript, TypeScript, React), `target/pit-reports/mutations.xml` (Java, Maven) ou `build/reports/pitest/mutations.xml` (Gradle). Il doit être au format JSON mutation-testing-elements, ou être le XML de PIT. Une commande qui l'écrit ailleurs nomme son fichier avec `mutationReport` sur le composant, relatif à sa racine. Avec Gradle, ajoutez `XML` aux `outputFormats` de PIT dans le build ; un projet Maven multi-module écrit un rapport par module : nommez celui à lire avec `mutationReport`. Python n'a pas de rapport par défaut : donnez `mutationReport`, par exemple le `mutation-report.json` que le script de mutation de `quality-gates-python` écrit dans son dossier de preuves. Une mutation sans rapport lisible attend un humain, quel que soit son code de sortie. Chaque commande par défaut utilise le mode incrémental de son outil, pour qu'un tour de la boucle ne remute pas tout le projet : `--incremental` pour StrykerJS, `-DwithHistory` pour PIT, `--since:{baseSha}` pour Stryker.NET ; quoi que l'outil mute, le seuil est jugé sur les fichiers changés depuis la base.

| Question | Réponses | Refus |
|---|---|---|
| `adr-ratification` | `RATIFIED`, `REJECTED` | `REJECTED`, avec une raison |
| `reporting-consent` | `ACCEPTED`, `DECLINED` | — |

`reporting-consent` demande une fois par dépôt si skraft peut publier les captures d'écran et vidéos de ses runs ; la réponse va dans `skraft-config.json` (`publish.visuals`). Elle n'est pas encore dans le workflow par défaut ; le workflow de votre dépôt peut l'ajouter.

Règles des arêtes qui sortent d'un nœud question :

- chaque arête porte une réponse en label ;
- une arête sans label prend toutes les réponses qui n'ont pas d'arête à elles, sauf un refus ;
- un refus exige son arête à lui, avec label, en général vers le nœud dont il refuse le travail, avec `max_visits` pour borner la boucle ;
- un nœud question hérite de sa phase comme les autres nœuds.

Le moteur refuse un workflow avec une question inconnue, un nœud question sans `question`, deux arêtes sans label sortant d'un nœud question, deux arêtes pour la même réponse, un label qui n'est pas une réponse, un refus sans arête à lui, ou une boucle dont aucune arête ne porte `max_visits`. Exemples : `node adr: REJECTED needs an edge of its own, back to the node whose work it refuses`, `node adr: no edge for RATIFIED; label one RATIFIED, or leave one unlabeled`, `loop adr -> design -> design_review -> adr has no max_visits`.

## Ce qui arrive

> **À venir.** Agents et lentilles propres à votre dépôt : lots 3 et 4. Feuille de route complète : [Accueil]({{ "/fr/" | relative_url }}) ; pourquoi ces décisions restent dans le moteur : [Architecture]({{ "/fr/explanation/architecture" | relative_url }}).

## Risques — réduire les contrôles

Chaque réglage ci-dessus peut aussi **retirer une preuve**. Le moteur fait tourner ce que vous écrivez : il ne sait pas si votre commande teste vraiment quelque chose. Avant de réduire un contrôle, écrivez la raison quelque part où l'équipe la lira (la description de PR, un ADR).

| Ce que vous faites | Ce qui disparaît | Le signe à surveiller |
|---|---|---|
| Retirer une gate d'un composant (supprimer `architecture` ou `coverage`) | La preuve correspondante : plus de contrôle des dépendances, plus de couverture | La gate n'apparaît plus dans la sortie de `skraft gate` ni dans `gates/<composant>/` |
| Déverrouiller le nœud `mutation` | Le mutation testing, et la boucle qui tue les mutants survivants | `skraft workflow diff` montre le déverrouillage ; le run journalise le nœud comme sauté, avec sa raison. Supprimer plutôt la commande `mutation` d'un composant arrête le run à `mutation`, en échec `environment` |
| Remplacer une commande par une qui ne teste rien (`"test": "node -e 0"`, un script qui sort toujours 0, un filtre qui exclut presque tous les tests) | Toute la gate : elle passe à chaque fois, quel que soit le code | Une preuve `pass` dont `stdout` ne montre aucun test lancé |
| Passer un composant en `inprocess` sans test de contrat | La garantie que vos mocks ressemblent encore au vrai service ; les tests passent contre une dépendance imaginaire | Des tests verts, puis une panne à l'intégration |
| Laisser un composant sans gate | Rien ne prouve ce composant ; le moteur le signale en échec `environment` | `no gate command; …` dans la sortie de `skraft gate` |
| Fixer `--base` ou `baseBranch` sur une ref trop récente | Des fichiers modifiés hors du périmètre comparé : des composants touchés ne sont plus retenus par `skraft gate` | `no component changed since its base; no gate to run` alors que vous avez modifié du code |
| Retirer le nœud question `adr` | La ratification humaine des décisions d'architecture : les ADR restent `Proposed` | `skraft workflow diff` montre le nœud disparu. Retirer seulement le `max_visits` de son arête `REJECTED` ne retire rien : le moteur refuse le workflow (`loop adr -> design -> design_review -> adr has no max_visits`) |
| Modifier `events.jsonl` à la main pour débloquer un run | Le journal comme preuve : la chaîne casse et le run est bloqué en `journal-tampered` | Voir [Reprendre ou débloquer un run]({{ "/fr/how-to/resume-a-run" | relative_url }}) |

Pour vérifier qu'une gate prouve encore quelque chose, ouvrez sa preuve (`.copilot-tracking/skraft-plans/<slug>/gates/<composant>/<gate>-<n>.log`) et lisez ce que la commande a réellement fait.

Ce que mesure le mutation testing, et pourquoi le retirer coûte cher : [Glossaire]({{ "/fr/reference/glossary" | relative_url }}) (Jia & Harman, 2011).

## Voir aussi

- [Référence skraft-config.json]({{ "/fr/reference/skraft-config" | relative_url }})
- [Zéro hook, contrôles dans le moteur]({{ "/fr/explanation/hooks" | relative_url }})
- [Architecture : moteur et pilotes]({{ "/fr/explanation/architecture" | relative_url }})

## Sources

- Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011.
