---
title: "Économie de tokens"
description: "Pourquoi le coût d'un pipeline agentique est une forme architecturale décidée au design, pas un réglage runtime — et comment SKRAFT la tient via les leviers de la discipline Genesis."
---

# Économie de tokens

Le coût d'un pipeline agentique n'est pas un curseur à ajuster en production :
c'est une contrainte de forme, décidée au moment de la conception, comme le budget
mémoire ou la latence acceptable.

## La thèse

Dans la littérature sur le développement produit, le coût d'un lot de travail est
décidé bien avant son exécution — par la taille du lot, les dépendances, le nombre
de boucles de retour. Donald Reinertsen le formule ainsi :

> « The cost of queuing delays is determined by the shape of the flow, not by the
> speed of individual activities. »
> — Reinertsen, D. G., *The Principles of Product Development Flow*, 2009.

Appliqué à un pipeline d'agents, cette intuition se traduit directement : les tokens
consommés par une exécution SKRAFT ne sont pas principalement pilotés par le contenu
de la requête de l'utilisateur, mais par la **forme architecturale du pipeline** —
combien d'agents sont instanciés, quels outils ils voient, quelle classe de modèle
leur est allouée, et combien de fois le contexte doit être rechargé de zéro.

Cette forme est décidée au moment de l'écriture des agents et des skills, pas au
moment de l'invocation. C'est pourquoi SKRAFT traite l'économie de tokens comme un
invariant de conception — un budget, pas un espoir.

## Les leviers

SKRAFT applique quatre leviers issus de la discipline Genesis pour tenir ce budget.
Chaque levier agit sur une dimension distincte de la dépense.

| Levier | Ce que ça fait |
|--------|----------------|
| **Discipline de cache** | Les prompts-système et les instructions partagées sont conçus pour être *rechargés* entre les tours sans recalcul — tout ce qui peut être mis en cache KV l'est, et la structure des messages le garantit. |
| **Famille par agent** | La configuration donne à chaque agent une famille de modèle — par agent, par type (phase, lentille, réfutateur) ou par défaut — et à chaque famille un modèle et un niveau de réflexion par hôte. Les producteurs d'artefacts (architect, engineer) tournent sur les paliers les plus forts ; les lentilles, dont la tâche est bornée, sur le palier économique ; le réfutateur un palier au-dessus des lentilles qu'il vérifie. |
| **Surface d'outils** | Aucun agent ne reçoit un catalogue MCP complet. Chaque agent ne voit que les outils dont il a besoin pour sa tâche précise. Chaque outil superflu est une invitation à raisonner inutilement. |

Ces leviers ne sont pas indépendants. La discipline de cache et la famille par agent se
renforcent mutuellement : un modèle de classe basse rechargeable depuis le cache KV coûte une
fraction de ce qu'un modèle de classe haute recalculé coûterait. La surface d'outils et le
dispatch par scénario des paliers les plus durs bornent la surface de décision à
l'intérieur de chaque tour, ce qui raccourcit la réponse et réduit la fenêtre de
contexte nécessaire.

Le runtime ajoute maintenant trois leviers de forme plus petits. Le manifeste de handoff
transmet les chemins d'artefacts enregistrés pour que les agents de phase ne re-déduisent
pas le contexte déjà fixé. Les skills marqués `on-demand` restent hors des prompts de
démarrage et des contrôles de conformité à l'arrêt jusqu'à l'étape qui en a besoin. Les
prompts de rework et de re-review bornent les retries aux findings précédents, aux entrées
changées et aux résultats passants reportés, au lieu de rejouer toute la phase.

## Mesures réelles

Les deux premiers leviers — discipline de cache et classe de modèle — ont été mesurés
sur un run réel du pipeline SKRAFT exécuté en *agentic workflow* (gh-aw), via le schéma
*Effective Tokens* (ET v0.2.0) du harness. Les chiffres ci-dessous proviennent des
fichiers `agent_usage.json` émis par huit exécutions d'agents et de reviewers — ils ne
sont pas estimés.

### Discipline de cache — −42,6 % de tokens effectifs

Le taux de réussite du cache KV est stable autour de **48 %** de l'entrée totale sur les
huit exécutions. Le schéma ET pondère un token lu depuis le cache à **0,1×** contre
**1,0×** pour un token recalculé — dix fois moins cher.

| Tokens effectifs (8 phases) | Sans cache | Avec cache | Gain |
|---|---|---|---|
| Total | 47,6 M | 27,3 M | **1,74× — −42,6 %** |

Le gain découle de la **forme** des prompts : un préfixe système stable, non réécrit
entre les tours, reste éligible au cache. C'est précisément le levier que les
[garde-fous du moteur](./guardrails.md) préservent côté infrastructure —
un invariant tenu par du code ne déplace pas le préfixe, là où un invariant ré-injecté
en prose le ferait rater.

### Classe de modèle — séparation de 27×

Le même schéma applique un multiplicateur par modèle. Sur ce run, deux classes ont été
observées : **9,0×** pour la classe *frontier* (claude-sonnet-5) et **0,33×** pour la
classe *capable* (claude-haiku-4.5). À travail normalisé égal, allouer la classe capable
plutôt que frontier coûte donc **9,0 / 0,33 ≈ 27× moins** en tokens effectifs — ce qui
fait du choix de classe le multiplicateur dominant de la dépense.

*Provenance : run gh-aw `SDLC` sur l'issue #72 du dépôt `meetup-coding-with-ai`, schéma
Effective Tokens v0.2.0, modèle de référence `claude-sonnet-4.5`.*

## Sans rogner la qualité

L'économie décrite ici provient exclusivement de la **forme** : mise en cache, classe
de modèle, volume de sortie, effort alloué. Elle ne touche jamais aux mécanismes qui
garantissent la fiabilité des livrables.

Cette séparation relevait de la discipline ; elle relève désormais du fait. La barre
tient dans une seule skill, `skraft-quality-bar`, et rien ne lit de réglage pour
l'abaisser : score de mutation à 100 % sur Domain et Application et 80 % sur API et
Infrastructure, couverture de lignes à 100 % sur Domain et Application, les quatre
lentilles adversariales sur chaque revue, la gate Gherkin, un ADR pour toute décision
non triviale, Object Calisthenics sur le Domain. Chaque gate bloque. Les niveaux
*advisory* et *warning* n'existent plus, pas plus que la rationale qui achetait
autrefois une dérogation.

Les lentilles de revue adverse, leurs pondérations, leur protocole de synthèse et le
score seuil d'acceptation sont donc hors périmètre de l'économie de tokens. Réduire le
nombre de lentilles ou abaisser les seuils n'est pas un levier d'économie — c'est
une dégradation de la qualité, et ce n'est plus exprimable. Pour comprendre pourquoi ces
gardes-fous ne se négocient pas, voir la page [La revue avant la revue](./deep-dive/review-before-review.md).

### Ce que cela coûte

Disons-le franchement : le framework n'échange plus de la rigueur contre des tokens. Le
curseur de profondeur repo-wide qui faisait exactement cela — fan-out de la revue à 1, 2
ou 4 lentilles, périmètre des runs de mutation, gate Gherkin activée ou non — a été
supprimé, et il était aussi le gouverneur de coût du pipeline. Chaque run paie désormais
la forme complète : quatre lentilles à chaque revue, les deux runs de mutation
séquencés, la gate Gherkin toujours active. C'est une hausse réelle et permanente du
coût plancher d'un run, que rien ne compense côté qualité. Le propriétaire du dépôt a
accepté l'arbitrage délibérément : la qualité ne se négocie pas, et un curseur qui
permet à un run d'acheter son passage sous la barre n'est pas une économie — c'est un
défaut différé.

Ce qui reste — et c'est la plus grosse moitié de la dépense — ce sont les leviers de
forme : classe de modèle, discipline de cache, surface d'outils, volume de sortie.
La distinction est importante en pratique : quand un run dépasse un
budget de tokens estimé, la première question n'est pas « quels reviewers
désactiver ? » — cette question n'a plus de réponse — mais « quel levier de forme n'est
pas encore appliqué ? ».

## Ce qui est en place — ce qui arrive

### En place

La famille de modèle est **réellement appliquée** : le moteur la résout à chaque lancement
d'agent et le pilote passe le modèle et le niveau de réflexion de l'hôte. Une famille est un
palier (`economy` < `standard` < `frontier`, le seul rang), un rôle à palier intégré
(`reviewer`, `researcher`, `implementer`, `planner`) ou une famille libre qui déclare son palier
(`gpt-codex`). `assign` choisit la famille de chaque agent — par agent, puis par type, puis par
défaut — et `models` donne à chaque famille, par hôte, un modèle (ou une liste essayée dans
l'ordre) et un niveau de réflexion ; ce qu'une famille ne précise pas vient de son palier, puis
de l'hôte. La configuration a quatre couches : les défauts du plugin (alias Claude Code
seulement), `~/.skraft/config.json`, `skraft-config.json` et `skraft-config.local.json`, non
commité. Aucun nom de modèle Copilot n'est écrit dans le code de skraft ni dans le dépôt : sans
configuration, Copilot n'en reçoit aucun et tourne sur le modèle de sa session. Le journal garde
ce sur quoi chaque agent a tourné, pour qu'une reprise le rejoue, et `skraft doctor` l'affiche
par hôte et signale ce qui retombe sur l'hôte. Un fichier d'agent Claude Code nomme un alias
Claude Code ou `inherit` (son repli), un fichier d'agent Copilot ne nomme aucun modèle, et un
linter CI (`resolve-model --check --forbid-model`) échoue sinon. Avec la
discipline de cache, ce choix de famille constitue le gouverneur principal de la dépense à
l'heure actuelle — et désormais le seul : le curseur de profondeur qui partageait ce
rôle a été supprimé, si bien que le versant qualité d'un run est un coût fixe et non
plus une variable. La gate de mutation l'illustre : chaque adaptateur
`quality-gates-<tech>` embarque deux scripts séquencés, core (Domain, Application) puis
boundary (API, Infrastructure), chacun portant sa valeur attendue jusqu'au `--break-at`
du runner, de sorte que le code de sortie fait le verdict. Les deux tournent, à chaque
fois.

### Conçu, pas encore implémenté

Le plus grand levier encore non activé est le **schéma de verdict hors-LLM** : faire
rendre les verdicts de revue dans un format structuré (JSON), puis les transformer en
rapport Markdown par un moteur de template — sans passer par le modèle pour la mise
en forme. Ce rendu est aujourd'hui encore confié au LLM, ce qui représente une taxe
non négligeable sur la sortie des reviewers (estimé). Ce levier est conçu ; son
implémentation n'est pas encore dans le pipeline principal.

## Voir aussi

- [Glossaire](../reference/glossary.md) — phases, agents, gates, artefacts
- [Architecture](./architecture.md) — comment les agents s'assemblent
- [Le journal d'événements](./event-journal.md) — les faits du run, dans le dossier de suivi hérité de HVE Core
- [La revue avant la revue](./deep-dive/review-before-review.md) — pourquoi les lentilles ne se négocient pas
- [Référence : patterns](../reference/patterns.md) — le catalogue complet des motifs Genesis

## Sources

> « The cost of queuing delays is determined by the shape of the flow, not by the
> speed of individual activities. »
> — Reinertsen, D. G., *The Principles of Product Development Flow*, 2009.
