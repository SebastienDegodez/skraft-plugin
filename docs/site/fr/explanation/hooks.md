---
layout: doc
lang: fr
title: "Garde-fous (hooks)"
description: "Pourquoi les hooks rendent les invariants Engineer/Reviewer mécaniquement infranchissables dans SKRAFT."
sidebar_position: 18
---

# Garde-fous — hooks SKRAFT

> « Le contrat n'a de valeur que s'il est mécaniquement infranchissable. »
> — principe directeur du framework SKRAFT

## Le problème

Dans un pipeline SDLC agentique, les invariants critiques (aucun import de domaine
depuis la couche Infra, audit-writer append-only, payload normalisé) sont documentés
dans les skills et ADR. Mais un agent peut les ignorer : rien dans le runtime ne les
fait respecter mécaniquement.

Sans garde-fous, chaque phase du pipeline expose l'invariant à la dérive silencieuse.
La revue adverse détecte *après* ; les hooks détectent *avant*.

## La solution — le harness de hooks

SKRAFT cible les événements de Claude Code et Copilot CLI ; les limites de validation
par client figurent ci-dessous. Chaque hook intercepte un événement
(`PreToolUse`, `SubagentStop`, …), évalue le payload normalisé, et retourne une décision
(`allow`, `deny`, `block`, `additionalContext`).

```
Runtime du harness
      │
      ▼  PreToolUse (outil: bash, tool_input: …)
 hook.mjs ──► normalise(payload) ──► router ──► handler
                                                    │
                                          ┌─────────┤
                                        allow     deny / block
                                          │             │
                                          └──► toHarnessOutput(décision, événement)
                                                    │
                                      exécution     bloqué
```

Ce vocabulaire de décision appartient à SKRAFT — aucun harness ne le comprend. Il est
traduit à la sortie par `harness-output.mjs` vers le JSON que les runtimes valident
réellement : un refus avant un outil voyage en `permissionDecision: "deny"`, un refus sur
tout autre événement en `decision: "block"`, et un `allow` en aucune sortie du tout. Une
seule enveloppe porte à la fois les clés racine que lit Copilot et le bloc
`hookSpecificOutput` que lit Claude Code.

La traduction n'est pas cosmétique : une décision écrite dans le vocabulaire interne échoue
à la validation du schéma harness à la racine, le payload entier est jeté, et la garde
devient un no-op qui laisse passer la violation. Voir
[Hooks — référence]({{ "/fr/reference/infrastructure/hooks" | relative_url }}) pour le format
de fil exact.

L'application du garde-fou exige que l'hôte charge le hook et respecte sa décision.
Une réponse traduite `deny` ou `block` ne prouve pas à elle seule le blocage par l'hôte.

## Structure du framework

Le framework est dans `plugins/skraft-framework/src/` à la racine du repo :

```
plugins/skraft-framework/src/
  domain/                ← politiques pures (aucune IO)
    pipeline-policy.mjs        ordre de dispatch (G1, vérifié par RunPipeline), provenance
    skill-policy.mjs           skills obligatoires/on-demand, chargements lus dans un transcript (G2, G3)
    phase-gate-policy.mjs      règles de clôture de phase (G4, G5)
    session-guard-policy.mjs   protection de l'état suivi, lecture du shell et de l'espace de travail (G7, G8)
    write-rights-policy.mjs    droits d'écriture par rôle d'agent, tirés de la config (G8)
    handoff-policy.mjs         complétude du handoff de dispatch (G9, vérifiée par RunPipeline)
    state-machine.mjs          transitions qu'applique le CLI d'état
    result.mjs, value-objects.mjs, …

  ports/                 ← contrats JSDoc (duck-typing)
    api/                 interfaces entrantes des hooks
    infrastructure/      interfaces sortantes (audit, état, transcript…)

  application/           ← un service par préoccupation de hook
    pre-tool-use-composite.mjs   décisions provenance et G7/G8
    write-rights-guard.mjs       G8, le cas d'usage qu'appellent le hook, le mod et l'extension
    subagent-start-service.mjs   G2
    subagent-stop-service.mjs    G3
    post-tool-use-service.mjs    trace G3
    pipeline/run-pipeline.mjs    le pipeline lui-même, G1 et G9 avant chaque dispatch
    state-service.mjs, phase-gate-service.mjs   le CLI d'état et sa porte

  adapters/
    api/hooks/           ← frontière avec le harness
      harness-input.mjs  payload harness → payload du framework
      harness-output.mjs décision → format de fil harness
      hook-router.mjs    routage par événement
    infrastructure/      ← implémentations sortantes
      jsonl-audit-writer.mjs   append-only, jamais truncate
      audit-log-resolver.mjs   un journal d'audit par projet, dans son répertoire git
      json-state-reader.mjs, state/json-state-writer.mjs
      …

  cli/
    hook.mjs             entrée des hooks : stdin JSON → router → stdout JSON
    housekeeping.mjs     entrée de SessionStart
    state.mjs            seul écrivain de state.json
```

## Packaging courant et limites de validation

Les hooks du plugin installé partagent une source canonique, livrée sur deux surfaces physiques :

| Surface | Rôle |
|---|---|
| [Hooks racine](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/hooks/hooks.json) | Source canonique et compatibilité Claude |
| [Hooks du namespace Copilot](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/com.github.copilot/hooks/hooks.json) | Copie générée pour Copilot v1 ; seul le jeton de racine du plugin diffère |

Aucun pointeur `hooks` supplémentaire dans les manifestes n'est nécessaire. Les deux surfaces
invoquent le même runtime partagé ; ce sont des adaptateurs de distribution, pas des logiques de
garde-fous distinctes. La source racine résout via `${CLAUDE_PLUGIN_ROOT}` ; le générateur réécrit
ce jeton en `${PLUGIN_ROOT}` dans la copie Copilot, car VS Code charge la copie du namespace v1 et
n'y interpole que `${PLUGIN_ROOT}`. Laissé littéral, `${CLAUDE_PLUGIN_ROOT}` s'étend à vide et node
cherche `/src/cli/hook.mjs` (`C:\src\cli\hook.mjs` sous PowerShell Windows). Le manifeste racine canonique déclare Agent Plugins v1
sans liste `agents` racine. Exactement deux arbres d'exécution éditables sont distribués :
31 fichiers Copilot `.agent.md` à plat dans `com.github.copilot/agents/` et 31 fichiers Claude
natifs `.md` à plat dans `com.anthropic.claude-code/agents/`. Corps et description se synchronisent
dans les deux sens contre un baseline par client ; les destinations Markdown sont traduites sans modifier les en-têtes natifs.
`npm run plugin:sync` (`--apply`) et `npm run plugin:check` (`--check`) synchronisent et vérifient
la paire. Les éditions contradictoires bloquent toute écriture. Les deux arbres, le baseline et
la copie générée des hooks sont commités car les installations marketplace depuis Git ne lancent aucun build.

Les fixtures sur **Copilot CLI 1.0.83 réel** ont **réussi** la découverte des agents namespacés,
`SessionStart` et `PreToolUse` avec `CLAUDE_PLUGIN_ROOT`, y compris des chemins contenant des espaces.
[scripts/copilot-hook-smoke.mjs](https://github.com/SebastienDegodez/skraft-plugin/blob/main/scripts/copilot-hook-smoke.mjs)
a aussi **réussi** sur le plugin migré courant installé depuis le checkout marketplace local,
avec la CLI exacte **1.0.83** épinglée via `--cli` et un `COPILOT_HOME` isolé :
**PASS allowed** (1 entrée d'audit de hook), **PASS denied** (1 entrée d'audit de hook), écriture
interdite absente. Ce refus SKRAFT observé ne valide ni le sélecteur complet des six racines
ni l'invocation de sous-agents masqués. Le code source
actuel de **VS Code** détecte d'abord le `$schema` v1, puis se replie sur `.plugin` puis
`.claude-plugin` ; la validation v1 complète en session réelle reste **non vérifiée**. Aucun de ces résultats ne justifie
une garantie globale de compatibilité ni l'ancien contournement sans schéma.

Sources : [générateur d'adaptateurs](https://github.com/SebastienDegodez/skraft-plugin/blob/main/scripts/project-plugin-adapters.mjs),
[sonde de compatibilité CLI](https://github.com/SebastienDegodez/skraft-plugin/blob/main/scripts/copilot-plugin-compat-smoke.mjs)
et [notes de packaging courant](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/README.md#harness-packaging).
[ADR-009](https://github.com/SebastienDegodez/skraft-plugin/blob/main/docs/adr/adr-009-generated-copilot-hook-copy.md)
consigne le packaging courant. [ADR-008](https://github.com/SebastienDegodez/skraft-plugin/blob/main/docs/adr/adr-008-single-hook-manifest.md),
qu'il remplace, conserve les mesures historiques ; ce n'est pas une référence du packaging actuel entre clients.

## Exemple Starbucks (illustratif)

*Exemple illustratif — inventé pour enseigner le concept, non dérivé du codebase.*

Imaginons que le pipeline traite la story "payer une commande". L'invariant est :
*aucun appel réseau vers le service de paiement en environnement de test*.

Avec les hooks :

1. `PreToolUse` reçoit `{ toolName: "bash", tool_input: { command: "curl https://pay.starbucks.com …" } }`
2. Le handler détecte l'URL de production → retourne `deny("appel réseau interdit en CI")`
3. L'agent reçoit le refus avant exécution → reformule son approche
4. L'audit-writer consigne la tentative en JSONL append-only

Sans hook, l'appel passerait silencieusement ; la revue le découvrirait *après*.

## État d'implémentation

| Garde | Appliquée par | Mode d'échec | Preuve en session réelle |
|-------|---------------|--------------|--------------------------|
| G1 ordre de dispatch | RunPipeline, avant chaque dispatch | Fail-closed : le run s'arrête `blocked` | Pas un hook |
| Provenance du dispatch | Hook `PreToolUse` | Fail-open | Aucune |
| G2 skills obligatoires | Hook `SubagentStart` | Fail-open | Aucune |
| G3 chargement des skills | Hooks `PostToolUse` et `SubagentStop` | Fail-open | Aucune |
| G4 artefacts de phase | CLI d'état, à la clôture de phase | Fail-closed | Pas un hook |
| G5 verdict et commit DELIVER | CLI d'état, à la clôture de phase | Fail-closed | Pas un hook |
| G6 continuation | Supprimé : RunPipeline enregistre ce que rend un agent | — | — |
| G7 état suivi | Hook `PreToolUse` | Fail-closed | Dernier passage enregistré : Copilot CLI 1.0.83 a refusé une écriture shell |
| G8 droits d'écriture par rôle d'agent | Mod Claude Code (`tool.call`), extension Copilot (`onPreToolUse`), hook `PreToolUse` | Fail-open si l'appelant n'est pas identifié ; le mod et l'extension refusent une écriture quand la garde elle-même échoue | Aucune |
| G9 complétude du handoff | RunPipeline, sur le prompt composé | Fail-closed : le run s'arrête `blocked` | Pas un hook |

Chaque garde est couverte par des tests unitaires et d'acceptation. Une preuve en session
réelle ne vient que d'une vraie session (`scripts/copilot-hook-smoke.mjs`,
`scripts/claude-plugin-smoke.mjs`) ; les évaluations Vally ne chargent pas les hooks du plugin.

`SubagentStart` n'injecte que les skills obligatoires de l'agent qui démarre. Un skill
déclaré `on-demand` n'est pas injecté au démarrage et n'est pas exigé par `SubagentStop` ;
sa lecture éventuelle reste tracée par G3. Les règles ne sont pas injectées : Copilot
découvre nativement les règles path-scoped.

Le pipeline tourne en code ([RunPipeline](https://github.com/SebastienDegodez/skraft-plugin/blob/main/docs/run-pipeline.md),
ADR-010) : un mod Claude Code et un workflow dynamique Copilot le pilotent. Les gardes qui
ne surveillaient que l'orchestrateur en prose ont quitté les hooks. G1 (ordre de dispatch)
et G9 (complétude du handoff) tournent dans le cas d'usage avant chaque dispatch, sur l'état
qu'il a lui-même écrit ; un refus arrête le run avant tout envoi. G6 (le rappel PostToolUse
des étapes à enregistrer) a disparu : le code enregistre artefacts et verdicts. Les hooks
gardent ce qu'aucun chemin de code ne voit — les écritures des agents (G7, et G8 là où ni le
mod ni l'extension ne tournent), les skills qu'ils chargent (G2/G3), qui dispatche qui
(provenance).

## G8 — droits d'écriture par rôle d'agent

Chaque agent du pipeline n'écrit que ce que son rôle permet : aucun agent ne travaille hors de
son périmètre, et la revue reste indépendante du code revu. `config:build` tire les droits de
la config — `phaseAgents`, `agentDispatchers`, le lanceur et les sorties que chaque agent
déclare — dans `writeRights` de `skraft-framework.config.json` ; rien n'est écrit agent par
agent dans le code.

| Rôle | Qui | Peut écrire |
|------|-----|-------------|
| Orchestrateur | Le lanceur du pipeline (`Skraft - Orchestrator`), et tout agent qui dispatche des agents de phase | Rien : le code du pipeline écrit l'état, les reviews et les rapports |
| Reviewer | Un reviewer de phase | Ses fichiers de transmission, les sorties qu'il déclare : sa review (`reviews/{date}/{phase}-review-{N}.md`) et, en DELIVER, le patch, la liste des fichiers, la liste des commits et le verdict `qg-verify` que lisent ses lentilles |
| Lentille | Un agent qu'un reviewer dispatche | Les sorties qu'elle déclare — aucune pour chaque lentille du pipeline |
| Spécialiste | Un spécialiste de phase | `src/` et `tests/` seulement en DISTILL (tests d'acceptation RED et leurs stubs) et en DELIVER ; tout le reste sauf le fichier de transmission d'un autre agent |
| Worker | Un agent qu'un spécialiste dispatche | Comme son spécialiste |

Un agent hors de ces rôles (`general-purpose`, `Explore`, celui d'un autre plugin) n'est pas
gouverné, sauf si un agent gouverné l'a lancé : il écrit alors comme lui. Les agents hors du
pipeline (backlog, brownfield) ne sont pas gouvernés.

La garde lit ce qu'un appel écrit : le fichier que nomme un outil de fichier, et les fichiers
qu'écrit une commande shell, lue comme G7 la lit. Un here-document qui ne fait qu'alimenter
l'entrée d'une commande (un YAML de verdict, un message de commit) est du texte, pas des
commandes. `src/` et `tests/` sont ceux du projet où tourne la session : un chemin sous le
répertoire de la session est lu à partir de lui, si bien qu'un projet rangé dans `~/src` n'est
pas tout entier un espace de travail.

**Qui appelle.** Chaque hôte le dit, et un seul cas d'usage (`write-rights-guard.mjs`) juge :

| Hôte | Où tourne G8 | Comment l'appelant est connu |
|------|--------------|------------------------------|
| Claude Code avec mods | Le hook `tool.call` du mod sur `Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `Bash` | L'`agentId` de l'appel et `$.agent.list()` (son type et qui l'a lancé) ; l'`agent_type` de la boucle principale sous `--agent`, lu au `SessionStart` |
| Copilot CLI et Copilot app | Le hook de session `onPreToolUse` de l'extension, qui voit aussi les appels des sous-agents | Le `sessionId` d'un sous-agent rapproché de l'événement `subagent.started` qu'a émis le runtime (`toolCallId`, `agentId`, `agentName`) ; l'agent sélectionné dans la session principale (`agent.getCurrent`, `subagent.selected`). Aucun fichier n'est lu |
| Tout hôte, settings hook | `PreToolUse` de `hooks.json` | Le nom d'agent du payload : l'`agent_type` de Claude Code ; le `preToolUse` de Copilot n'en donne aucun |

Un **appelant non identifié passe** (fail-open), audité `UNIDENTIFIED_CALLER` : un settings hook
Copilot, un sous-agent qu'aucun événement n'a annoncé, une session principale dont la sélection
n'a pas pu être lue. G8 ne refuse qu'une écriture qu'il peut attribuer à un rôle qui n'en a pas
le droit ; refuser l'appelant anonyme refuserait le Software Engineer avec tous les autres
(#206). Un payload Claude Code qui ne nomme aucun agent vient de la session principale sans
`--agent`, où ne tourne aucun agent du pipeline.

**Mode d'échec.** Le mod et l'extension refusent une écriture quand la garde elle-même échoue
(un `.catch` qui refuse, une erreur rattrapée) ; le settings hook garde sa règle : un échec du
hook laisse passer l'appel, sauf une écriture d'outil sur un `state.json` suivi.

**Lots.** Chaque appel d'un lot Copilot `toolCalls` est jugé ; un seul refus refuse le lot.

**Ce qui exige encore le settings hook.** G7, la provenance, et G8 pour un hôte qui ne fait
tourner ni le mod ni l'extension : Claude Code sans mods, un hôte Copilot qui ne charge pas
l'extension du plugin (VS Code lit les hooks v1), une session où l'extension n'a pas été
chargée. Sous Claude Code avec mods, les deux tournent et s'accordent ; le mod répond le premier.

## Économie de tokens — l'angle des hooks

Les hooks contribuent à l'[économie de tokens]({{ "/fr/explanation/token-economy" | relative_url }})
du pipeline sur deux leviers de la discipline Genesis.

### Enforcement déterministe = zéro token de raisonnement

Sans hook, l'agent doit *raisonner* sur chaque invariant à chaque appel d'outil :
« dois-je normaliser ce payload ? », « cet audit-writer est-il bien append-only ? ».
Chaque vérification est une chaîne de pensée produite en sortie, tour après tour.

Avec un hook `PreToolUse`, l'enforcement est **code natif** : exit 0 ou réponse JSON
`deny`/`allow`, sans aucun token de raisonnement. La décision sort du chemin du modèle.

### Préfixe stable = cache KV éligible

Parce que l'invariant est tenu par le code du hook et non ré-injecté en prose dans le
contexte à chaque tour, le **préfixe système reste stable** entre les appels. Un préfixe
stable reste éligible au cache KV — le levier qui produit la plus grande réduction de
tokens *mesurée* du pipeline. Dès qu'un invariant est réécrit dans le prompt à chaque
appel d'outil, le préfixe change et le cache rate.

> Les ratios de réduction mesurés (cache, classe de modèle) sont documentés sur la page
> [Économie de tokens]({{ "/fr/explanation/token-economy" | relative_url }}).

## Ce que les hooks ne couvrent pas

Les hooks et le CLI d'état font respecter des **invariants structurels et
comportementaux** — ordre de dispatch, présence des artefacts, verdict du reviewer,
intégrité du fichier d'état. Ils ne constituent pas un système anti-hallucination général, et deux limites
importantes doivent être énoncées explicitement.

### G2 et G3 imposent la méthode déclarée, pas la vérité

Le garde-fou G2 injecte les skills obligatoires à `SubagentStart`. G3 consigne les lectures
de skills et renvoie au travail un sous-agent dont le transcript ne montre aucun chargement
d'un skill obligatoire : un appel de l'outil skill ou une lecture de son `SKILL.md`, jamais
une simple mention. Les skills marqués `on-demand` sortent de cet ensemble obligatoire : ils
ne déclenchent ni injection au démarrage ni blocage de conformité à l'arrêt. Tous deux sont
fail-open si le hook échoue afin qu'une erreur interne du runtime ne fige pas le pipeline.
Ils prouvent qu'un skill a été chargé, pas que l'agent l'a bien appliqué.

### Violations structurelles vs. hallucinations factuelles

Les hooks détectent les **hallucinations de qualité** : artefact manquant, dispatch
hors ordre, verdict ne correspondant pas au fichier écrit. Ils ne détectent pas les
**hallucinations factuelles** : une règle métier inventée par le modèle, un endpoint
d'API inexistant cité dans le code, ou une connaissance du domaine incorrecte intégrée
dans un test. La correction factuelle reste la responsabilité du reviewer humain et
des tests d'acceptation métier.

## Pour en savoir plus

- [Économie de tokens]({{ "/fr/explanation/token-economy" | relative_url }}) — les leviers Genesis et les ratios de réduction mesurés

- [Référence hooks]({{ "/fr/reference/infrastructure/hooks" | relative_url }}) — événements et gardes, porte de phase, décisions, variables d'environnement
- [Clean Architecture]({{ "/fr/explanation/clean-architecture" | relative_url }}) — couches Api → Infra → Application → Domain
