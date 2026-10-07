<!-- markdownlint-disable-file -->
# RunPipeline — l'orchestrateur SKRAFT en code

`RunPipeline` fait tourner le pipeline SKRAFT d'une story, RESEARCH → DESIGN → DISTILL →
DELIVER, à la place de l'agent orchestrateur en prose. Le même cas d'usage sert deux
hôtes : un **mod Claude Code** et un **workflow dynamique GitHub Copilot**. Chaque hôte ne
fait que brancher ses adaptateurs sur les ports ; toutes les décisions sont prises dans
le domaine et les cas d'usage ([ADR-010](adr/adr-010-pipeline-runs-as-code.md)).

> Fichier central : [`plugins/skraft-framework/src/application/pipeline/run-pipeline.mjs`](../plugins/skraft-framework/src/application/pipeline/run-pipeline.mjs)
> Contrats d'entrée : [`src/ports/api/`](../plugins/skraft-framework/src/ports/api/) — `run-pipeline`, `record-decision`, `close-manually`

L'agent `skraft-orchestrator` n'est plus qu'un **lanceur** : il appelle l'entrée de son
hôte et relaie les checkpoints. Il ne déclare plus rien du pipeline : ni l'ordre des
phases, ni ses agents. Le pipeline est déclaré dans le code
([`domain/pipeline/pipeline-definition.mjs`](../plugins/skraft-framework/src/domain/pipeline/pipeline-definition.mjs)),
les agents de phase déclarent `dispatched_by: skraft-pipeline`, et la section 2 dit où
chacune des anciennes responsabilités de l'orchestrateur vit maintenant.

---

## 1. Ce qu'il fait

Pour une story identifiée par son `slug`, `RunPipeline` :

1. **remet `state.json` d'aplomb** avant de partir : diagnostic, puis rollback, reset,
   budget de retries neuf, ou reconstruction depuis les fichiers (section 5.5) ;
2. demande une fois le **consentement de reporting** (où publier les rapports) ;
3. pour chaque phase, envoie le **spécialiste** puis le **reviewer** de
   `skraft-framework.config.json` (RESEARCH n'a pas de reviewer), après avoir vérifié
   l'**ordre des dispatchs** (G1) et la **complétude du handoff** (G9) ;
4. vérifie sur disque que le spécialiste a laissé les sorties attendues ;
5. lit le verdict dans le **fichier de review**, jamais dans la réponse du sous-agent ;
   en mode de revue `code`, la revue DELIVER est elle-même du code (`RunReview`,
   section 6.8) : le pipeline lance les lentilles, calcule le verdict et écrit ce fichier ;
6. renvoie les findings au spécialiste tant que le budget de retries le permet
   (`maxRetriesPerPhase`, 2 par défaut, soit 3 tentatives) ;
7. en DESIGN, fait le **scan structurel** avant l'architecte, puis la **ratification des
   ADR** avant de passer à DISTILL ;
8. en DELIVER, **vérifie le log de preuves des quality gates** (G1–G11) avant toute
   review — en process, sans ligne de commande ;
9. après DISTILL, rend le **rapport forecast** ; après DELIVER (approuvé ou bloqué), le
   **rapport outcome** ; les publie selon le consentement, la partie distante déléguée à un
   agent ;
10. pose les questions au humain aux **checkpoints** ;
11. clôt chaque phase par `ADVANCE` : la machine à états et la phase gate (G4/G5) restent
    les seules à décider si la phase peut se fermer.

Le résultat est l'un de ces trois statuts :

| `status` | Signification | Champs utiles |
|---|---|---|
| `done` | Les quatre phases sont approuvées, `currentPhase` vaut `DONE` | `reason` |
| `blocked` | Arrêt : budget de retries épuisé, review illisible, phase gate refusée, dispatch refusé (G1/G9), humain qui répond `stop` | `phase`, `reason`, `detail` (findings ou violations) |
| `awaiting-human` | Une question attend une réponse que personne ne peut donner maintenant | `phase`, `checkpoint.key`, `checkpoint.question`, `checkpoint.options` |

Un second cas d'usage, **`CloseManually`**, clôt la phase ouverte après des reworks validés
par le humain (section 5.6).

---

## 2. Ce que faisait l'orchestrateur, et où c'est maintenant

| Responsabilité (prose de `skraft-orchestrator.md`) | Maintenant | Fichier |
|---|---|---|
| Déclarer l'ordre des phases (`metadata.phases`) | `PIPELINE_PHASES` ; `config:build` en tire `phaseOrder` et refuse un agent qui déclare encore `metadata.phases` (`PHASES_IN_AGENT`) | `domain/pipeline/pipeline-definition.mjs`, `domain/framework-config-policy.mjs`, `domain/dispatch-policy.mjs` |
| Lister et lancer les agents de phase (`agents`, `Agent(...)`, `dispatched_by: Skraft - Orchestrator`) | les agents de phase déclarent `dispatched_by: skraft-pipeline` (`PIPELINE_DISPATCHER`) ; un agent qui en dispatche un lui-même est refusé (`PIPELINE_DISPATCH`) | `pipeline-definition.mjs`, `domain/pipeline-policy.mjs` (provenance) |
| Phase 0 : créer ou relire l'état, reprendre | `stateService.init` + `stepOnEntry` | `application/pipeline/run-pipeline.mjs`, `domain/pipeline/step-policy.mjs` |
| Recovery : `diagnose`, `rollback`, `reset`, `resolve-stale`, reconstruire depuis les fichiers | `PipelineRecovery`, `recoveryStepOf`, `inferCompletedPhases` | `application/pipeline/recover-pipeline.mjs`, `domain/recovery-policy.mjs`, `domain/pipeline/progress-inference-policy.mjs` |
| `mark-phase-started` (base SHA) | `MARK_PHASE_STARTED` | `run-pipeline.mjs` |
| Coller le bloc `state.mjs handoff` dans chaque dispatch | `composeDispatchBrief` | `domain/pipeline/dispatch-brief.mjs` |
| G1 (ordre des dispatchs), G9 (handoff complet) — hooks PreToolUse | `evaluateDispatch`, `evaluateHandoff` avant chaque dispatch | `run-pipeline.mjs`, `domain/pipeline-policy.mjs`, `domain/handoff-policy.mjs` |
| Vérifier les artefacts, `record-artifact` | `matchOutputs` + `RECORD_ARTIFACT` | `domain/pipeline/expected-outputs.mjs` |
| Tableau des verdicts, retries, escalade environnement, rejet | `stepAfterReview`, `reworkStep`, checkpoints | `step-policy.mjs` |
| G6 (rappel PostToolUse des étapes à enregistrer) | supprimé : le code enregistre lui-même | — |
| Scan structurel (`structural-scan.mjs --out`) | `StructuralScan` en process | `application/structural-scan-service.mjs` |
| `qg-verify.mjs` avant la review DELIVER | `verifyEvidenceLog` en process | `application/evidence-verification-service.mjs` |
| Ratification des ADR | `ratifyAdrs` | `run-pipeline.mjs`, `domain/pipeline/adr-ratification-policy.mjs` |
| Manual closure : `incr-rework`, `scan-commits`, `manual-close.md`, `close-phase` | `CloseManually` | `application/pipeline/close-manually.mjs`, `domain/pipeline/manual-closure-policy.mjs` |
| Consentement de reporting (`report.mjs setup`) | `ensureConsent` | `application/pipeline/report-boundaries.mjs`, `domain/reporting-consent-policy.mjs` |
| Contexte de reporting des dispatchs DISTILL/DELIVER (données, médias, forecast, tests d'acceptation) | `reportingAddendum` | `domain/report-boundary-policy.mjs` |
| `report.mjs render` après DISTILL et DELIVER | `report` (lit les références d'abord, puis `renderReport`) | `report-boundaries.mjs` |
| `report.mjs prepare / decide / record`, reprise à DONE | `ReportPublication` | `application/report-publication-service.mjs` |
| Revue DELIVER (prose de `software-engineer-reviewer.md`) : préparer patch, liste des fichiers, commits et résultat `qg-verify`, lancer les lentilles, matrice de sévérité, escalade environnement, fichier de review | en mode `code` : `RunReview` (le reviewer agent reste le mode par défaut) | `application/pipeline/review/run-review.mjs`, `domain/pipeline/review/*` |
| Appels MCP de publication (lecture, écriture, relecture) | **délégués** à un agent général via le port `ReportTransport` | `adapters/infrastructure/reporting/agent-report-transport.mjs` |

Les sous-commandes de `state.mjs` que seule la prose utilisait (`init`, `select`,
`transition`, `record-*`, `mark-phase-started`, `incr-*`, `close-phase`, `set`,
`scan-commits`, `diagnose`, `rollback`, `reset`, `resolve-stale`) et `report.mjs`
restent pour une réparation manuelle et sont **marquées obsolètes** (un avis sur un
terminal). `state.mjs get`, `handoff` et `timeline`, que les agents de production et
les humains lisent, restent courants ; `qg-verify.mjs` et `structural-scan.mjs` restent,
devenus de minces adaptateurs pilotes des mêmes services, pour l'ingénieur et les
reviewers.

---

## 3. Fichiers d'entrée

| Hôte | Déclencheur | Fichier d'entrée (composition) | Cas d'usage |
|---|---|---|---|
| Claude Code (mod) | `/skraft <slug> [#issue] [titre]`, outil `mcp__skraft__run_pipeline` | [`hooks/skraft-mod.mjs`](../plugins/skraft-framework/hooks/skraft-mod.mjs) (`command.run`, `tool.call`) | `RunPipeline` |
| Claude Code (mod) | `/skraft decide <slug> <clé> <réponse>` | même fichier | `RecordDecision` |
| Claude Code (mod) | `/skraft close <slug> [findings]` | même fichier | `CloseManually` |
| GitHub Copilot | « Run the skraft-pipeline dynamic workflow… » ou `copilot workflow run skraft-pipeline --args '{"slug":"checkout"}'` | [`com.github.copilot/extensions/skraft-pipeline/extension.mjs`](../plugins/skraft-framework/com.github.copilot/extensions/skraft-pipeline/extension.mjs) | `RunPipeline` |
| GitHub Copilot | outils `skraft_decide`, `skraft_close_phase` | même extension | `RecordDecision`, `CloseManually` |
| Copilot app | canvas « Skraft pipeline » (« Open the Skraft pipeline canvas » : le pipeline actif de la copie de travail), ses boutons et ses actions `get_pipeline`, `decide`, `show_phase`, `refresh` | même extension, [`adapters/api/copilot-canvas/`](../plugins/skraft-framework/src/adapters/api/copilot-canvas/) | `ObservePipeline`, `RecordDecision` |

La ligne `/skraft` est découpée par [`adapters/api/claude-code-mod/command-args.mjs`](../plugins/skraft-framework/src/adapters/api/claude-code-mod/command-args.mjs) ;
les appels du SDK Copilot par [`adapters/api/copilot-workflow/skraft-pipeline-workflow.mjs`](../plugins/skraft-framework/src/adapters/api/copilot-workflow/skraft-pipeline-workflow.mjs).
Le mod et l'extension ne contiennent **aucune règle** : ils construisent les dépendances
et appellent un cas d'usage. Il n'y a plus de script hors de cette architecture :
`decide.mjs` et `state-io.mjs` ont disparu.

---

## 4. Où vit chaque morceau

```mermaid
flowchart TB
  E["<b>Points d'entrée — composition</b><br/>hooks/skraft-mod.mjs · extensions/skraft-pipeline/extension.mjs"]
  API["<b>adapters/api — adaptateurs pilotes</b><br/>copilot-workflow/skraft-pipeline-workflow.mjs · copilot-canvas/* · pipeline/node-dependencies.mjs · claude-code-mod/command-args.mjs"]
  APP["<b>application — cas d'usage</b><br/>pipeline/run-pipeline · recover-pipeline · report-boundaries · run-journal · close-manually · record-decision · observe-pipeline<br/>structural-scan-service · evidence-verification-service · report-publication-service"]
  DOM["<b>domain — règles pures</b><br/>pipeline/step-policy · expected-outputs · dispatch-brief · manual-closure · progress-inference · run-journal · pipeline-view<br/>recovery · reporting-consent · report-boundary · report-publication-scope · handoff · pipeline-policy"]
  PORTS["<b>ports — contrats</b><br/>api/run-pipeline, record-decision, close-manually, observe-pipeline<br/>infrastructure/* : 17 ports pilotés"]
  INFRA["<b>adapters/infrastructure — adaptateurs pilotés</b><br/>git/* · source-tree/* · state/* · pipeline/fs-* · reporting/agent-report-transport<br/>web-crypto-hasher · templates/* · copilot-workflow/* · claude-code-mod/mod-helpers"]

  E -->|compose| API
  API -->|appelle| APP
  APP -->|applique| DOM
  APP -.->|dépend des contrats| PORTS
  INFRA -.->|implémente| PORTS
  API -->|instancie| INFRA
```

Règle de dépendance ([ADR-002](adr/adr-002-hexagonal-architecture.md)), vérifiée par
[`tests/skraft-framework/architecture/pipeline-dependency-rule.test.mjs`](../tests/skraft-framework/architecture/pipeline-dependency-rule.test.mjs) :

- `domain/` n'importe que `domain/` ;
- `application/pipeline/` n'importe que `domain/` et `application/` ; il ne nomme ni
  commande, ni chemin du plugin, ni `argv`, ni code de sortie, ni `process` ;
- aucun adaptateur de `adapters/infrastructure/` n'importe un cas d'usage ;
- tout ce que charge le mod Claude Code est sans API Node (le runtime des mods n'en a pas).

| Couche | Fichier | Responsabilité |
|---|---|---|
| Domaine | `pipeline/step-policy.mjs` | L'étape suivante d'une phase ; clés des checkpoints |
| Domaine | `pipeline/expected-outputs.mjs` | Sorties attendues d'un agent, trouvées ou manquantes, log de preuves, chemin du scan |
| Domaine | `pipeline/dispatch-brief.mjs` | Le prompt d'un dispatch : en-tête, bloc handoff, addenda ; numéro `{N}` de la review |
| Domaine | `pipeline/review-outcome.mjs` | Verdict et escalade lus dans un fichier de review |
| Domaine | `pipeline/adr-ratification-policy.mjs` | ADR `Proposed`, lecture de la réponse humaine |
| Domaine | `pipeline/progress-inference-policy.mjs` | Phases que les fichiers montrent terminées, après une reconstruction |
| Domaine | `pipeline/manual-closure-policy.mjs` | Review de clôture manuelle, refus |
| Domaine | `recovery-policy.mjs` | Diagnostic → étape de recovery (`recoveryStepOf`) |
| Domaine | `reporting-consent-policy.mjs` | Portée lue de `origin`, question, interprétation de la réponse |
| Domaine | `report-boundary-policy.mjs` | Chemins des données et rapports, addendum de reporting, résumé chat |
| Domaine | `report-publication-scope.mjs` | Reçus encore dans la portée confirmée (partagé avec `report.mjs`) |
| Application | `pipeline/run-pipeline.mjs` | Exécute les étapes contre les ports ; enchaîne les phases |
| Application | `pipeline/checkpoint.mjs` | `Halt`, `ask` / `tryAsk` (DecisionStore d'abord) |
| Application | `pipeline/pipeline-state.mjs` | Le state service, avec la phase gate, de tous les cas d'usage |
| Application | `pipeline/recover-pipeline.mjs` | Étape de recovery au démarrage |
| Application | `pipeline/report-boundaries.mjs` | Consentement, addendum, rendu, publication, reprise |
| Application | `pipeline/close-manually.mjs` | Cas d'usage `CloseManually` |
| Application | `pipeline/record-decision.mjs` | Cas d'usage `RecordDecision` |
| Application | `pipeline/run-journal.mjs` | Tient `run.json` à jour : décore `PipelineProgress` et `HumanInteraction` |
| Application | `pipeline/observe-pipeline.mjs` | Cas d'usage `ObservePipeline` : la vue d'un pipeline, en lecture seule |
| Domaine | `pipeline/run-journal-policy.mjs`, `pipeline/pipeline-view-policy.mjs` | Le journal d'un run ; la vue (statut de chaque phase, tentatives, reviews, question, rapports) |
| Application | `structural-scan-service.mjs`, `evidence-verification-service.mjs`, `report-publication-service.mjs` | Services en process, partagés avec les commandes |
| Domaine | `pipeline/review/review-lenses.mjs` | Mode de revue ; lentilles d'une phase et leurs entrées ; déclencheurs des lentilles conditionnelles ; chemins des entrées préparées |
| Domaine | `pipeline/review/lens-brief.mjs` | Le prompt d'une lentille : ses entrées, rien d'autre, et le document attendu |
| Domaine | `pipeline/review/lens-result.mjs` | Lecture et contrôle de la réponse d'une lentille ; lentille inconclusive |
| Domaine | `pipeline/review/review-verdict-policy.mjs` | Matrice de sévérité, escalade environnement, dissidence, données du fichier de review |
| Application | `pipeline/review/run-review.mjs` | Cas d'usage `RunReview` : la revue d'une phase en code |

---

## 5. Les ports et leurs implémentations

Chaque contrat est décrit dans son fichier sous
[`src/ports/infrastructure/`](../plugins/skraft-framework/src/ports/infrastructure/).

| Port | Contrat | Node / Copilot | Mod Claude Code | Double de test |
|---|---|---|---|---|
| `StateReader` | `read(slug)` ; rejette `ENOENT` ou `CORRUPTED_STATE` | `json-state-reader.mjs` | `state/file-state-store.mjs` sur `$.fs` | `Map` |
| `StateWriter` | `write(slug, state)` → `Result` | `state/json-state-writer.mjs` (temp + rename) | `state/snapshot-state-writer.mjs` sur `$.fs` (sauvegarde à chaque changement de phase, relecture) | `Map` |
| `StateBackupReader` | `list(slug)` → `state.json.bak.*` | `state/json-state-backup-reader.mjs` | `state/file-state-store.mjs` | tableau |
| `StateArchive` | `setAside(slug)` → `state.json.invalid.*` | `state/json-state-archive.mjs` | `state/file-state-store.mjs` | tableau |
| `TrackingStore` | `exists`, `read`, `list`, `write`, `prefix(slug)` | `pipeline/fs-tracking-store.mjs` | `$.fs` (dans le mod) | `Map` |
| `RepositoryReader` | `read(path)` → texte ou `null` | `pipeline/fs-repository-reader.mjs` | `$.fs` (dans le mod) | `Map` |
| `SourceControl` | `headSha`, `parentOf`, `filesOf`, `commit`, `range`, `show`, `diff`, `changedFiles`, `listRecent`, `currentBranch`, `remoteUrl` | `git/git-source-control.mjs` + `git/node-git-runner.mjs` | le même + `git/process-git-runner.mjs` sur `$.process.run` | dépôt simulé |
| `SourceTree` | `listFiles()`, `readSource(path, maxBytes)` | `source-tree/node-source-tree.mjs` | `source-tree/git-source-tree.mjs` sur `$.fs.stat/read` | liste fixe |
| `Hasher` | `sha256(text)`, `sha256Sync(text)` | `web-crypto-hasher.mjs` | le même | `node:crypto` |
| `TemplateReader` | `read(pluginRelativePath)` | `templates/node-template-reader.mjs` | `$.fs` sous `$.plugin.root` | fichier réel |
| `ActivePipeline` | `activate(slug)`, `current()` | `pipeline/fs-active-pipeline.mjs` (`.active-slug`) | `$.fs` (dans le mod) | tableau |
| `AgentRunner` | `run({ agent, phase, role, label, prompt })` → `{ ok, text, error?, unavailable?, usage? }` ; `unavailable` : l'hôte n'a pas cet agent, le run s'arrête ; `agent: null` = agent général ; `usage` = tokens, crédits IA ou dollars | `copilot-workflow/workflow-agent-runner.mjs` (`ctx.agent` ; coût : événements `assistant.usage` du sous-agent) | `$.agent.spawn` + `turn.complete` (tokens) + écart de `$.session.usage().cost` (dollars), dans le mod | LLM simulé |
| `ReportTransport` | `observe({ packet })`, `publish({ packet, decision })` | `reporting/agent-report-transport.mjs`, construit par l'hôte (`reportTransportOf`) sur l'`AgentRunner` du run, pour que son coût soit journalisé | le même | GitHub simulé |
| `HumanInteraction` | `ask({ key, question, options })` → réponse ou `null` | `copilot-workflow/workflow-human-interaction.mjs` (`ctx.pause`) | `$.ui.ask` (dans le mod) | réponses par clé |
| `DecisionStore` | `read(slug, key)`, `write(slug, key, answer, by)` | `pipeline/tracking-decision-store.mjs` | le même | `Map` |
| `PipelineProgress` | `phase(title)`, `log(message)` | `copilot-workflow/workflow-progress.mjs` | atom `$.state` + pane + `$.ui.status` | tableaux |
| `TimeProvider` | `now()`, `isoString()` | `system-time.mjs` | `system-time.mjs` | date fixe |

**Le seul processus que lance le mod est `git`.** L'écriture de l'état, la vérification
des preuves, le scan et le rendu des rapports tournent dans le mod lui-même.

**Exception imposée par le runtime des mods.** Le moteur des mods ne suit `$` que dans
les fonctions du fichier `hooks/skraft-mod.mjs`, jamais à travers un import. Les
adaptateurs qui touchent `$` y sont déclarés (`pipelineDependencies`) et se limitent à
traduire un port vers `$` ; les adaptateurs hôte-neutres (git, état sur fonctions de
fichiers, hasher, transport) sont importés depuis `adapters/infrastructure/` et reçoivent
des fonctions bâties sur `$`.

---

## 6. Comment ça marche

### 6.1 La boucle

`run({ slug, story })` :

1. `recover(slug)` — section 6.5 ;
2. `stateService.init(slug)`, `ActivePipeline.activate(slug)` ;
3. `ensureConsent(slug, story)` — section 6.4 ;
4. tant que `currentPhase` n'est pas `DONE` (10 phases au plus) : `runPhase` ; à `DONE`,
   une publication restée en attente est retentée.

`runPhase` pose `MARK_PHASE_STARTED` avec le SHA de `HEAD`, fait le scan en DESIGN, calcule
l'étape d'entrée avec `stepOnEntry` (c'est ce qui rend la reprise exacte), puis exécute les
étapes une par une (50 au plus par phase) jusqu'à `ADVANCE` ou un arrêt.

```mermaid
stateDiagram-v2
  direction LR
  [*] --> specialist
  specialist --> reviewer: sorties OK
  specialist --> retry: sortie manquante, gates fail
  specialist --> environment: gates inconclusive
  reviewer --> advance: APPROVED
  reviewer --> retry: NEEDS_REWORK
  reviewer --> environment: escalade
  reviewer --> rejected: REJECTED
  retry --> specialist: findings
  environment --> specialist: fixed (DELIVER)
  environment --> reviewer: fixed (DESIGN, DISTILL)
  rejected --> retry: rework
  advance --> [*]
  retry --> [*]: budget épuisé
```

| Après… | Fonction | Étape suivante |
|---|---|---|
| l'entrée dans la phase (ou une reprise) | `stepOnEntry` | `APPROVED` → avancer ; pas de verdict → spécialiste ; `CHANGES_REQUESTED` → selon la dernière review |
| le spécialiste, sortie requise absente | `stepAfterMissingOutputs` | retry, sans dépenser de review |
| les quality gates (DELIVER) | `stepAfterQualityGates` | `pass` → reviewer ; `fail` → retry ; `inconclusive` ou `error` → environnement |
| la review | `stepAfterReview` | `APPROVED` → avancer ; `NEEDS_REWORK` → retry (ou environnement) ; `REJECTED` → rejet ; illisible → `blocked` |
| « fixed » | `stepAfterEnvironmentFixed` | DELIVER : ingénieur en re-gate ; DESIGN, DISTILL : reviewer seul |
| « rework » / « stop » | `stepAfterRejection` | retry, ou `blocked` |
| un retry | `reworkStep` | spécialiste avec les findings ; `RETRY_EXHAUSTED` → `blocked` |
| RESEARCH (pas de reviewer) | — | `CLOSE_PHASE` dès que les sorties sont là |

Avant chaque dispatch : `evaluateDispatch` (G1 — l'agent appartient à la phase ouverte, le
reviewer seulement après un artefact) puis, sur le prompt composé, `evaluateHandoff` (G9 —
chaque entrée enregistrée est nommée). Un refus arrête le run en `blocked` : rien ne part.

### 6.2 Une phase DELIVER, pas à pas

```mermaid
sequenceDiagram
  autonumber
  participant H as Hôte (mod ou workflow)
  participant UC as RunPipeline
  participant D as Domaine
  participant S as StateService + PhaseGate
  participant SC as SourceControl
  participant A as AgentRunner
  participant T as TrackingStore
  participant EV as EvidenceVerification
  participant RB as ReportBoundaries

  H->>UC: run({ slug, story })
  UC->>S: recover, init, get → DELIVER
  UC->>SC: headSha()
  UC->>S: MARK_PHASE_STARTED (baseSha)
  UC->>D: stepOnEntry → specialist
  UC->>D: evaluateDispatch (G1)
  UC->>RB: addendum(DELIVER) — données outcome, forecast, réponse du designer
  UC->>D: composeDispatchBrief, evaluateHandoff (G9)
  UC->>A: run(Software Engineer)
  UC->>T: list(slug)
  UC->>D: matchOutputs → found
  UC->>S: RECORD_ARTIFACT (change-log, qg-{story}.json…)
  UC->>EV: verifyEvidenceLog(log, baseSha) — fichiers, git, SHA-256
  EV-->>UC: pass
  UC->>A: run(Software Engineer Reviewer → reviews/{date}/deliver-review-{N}.md)
  UC->>T: read(review)
  UC->>S: RECORD_REVIEW_ARTIFACT, RECORD_VERDICT APPROVED
  UC->>RB: report(outcome, review)
  RB->>T: write(reporting/{date}/outcome.md)
  UC->>S: ADVANCE → DONE
  UC-->>H: { status: done }
```

Les autres phases suivent le même schéma, sans vérification des preuves. RESEARCH
s'arrête après le spécialiste. DESIGN ajoute le scan au début et la ratification des ADR
avant `ADVANCE` ; DISTILL rend le forecast avant `ADVANCE` et garde la réponse du
designer (`reporting/{date}/distill-handoff.md`) pour l'ingénieur. Un DELIVER bloqué rend
quand même son outcome ; un rapport ne change jamais un verdict ni ne fait échouer le run.

### 6.3 Les checkpoints humains

L'ordre est toujours le même (`checkpoint.mjs`) : une réponse déjà enregistrée dans le
`DecisionStore` gagne ; sinon `HumanInteraction.ask` ; une réponse obtenue est enregistrée
dans `decisions/<clé>.json` ; pas de réponse → `awaiting-human` (`ask`) ou on continue
sans (`tryAsk`, pour le consentement de reporting seulement).

**Copilot : pause durable, puis reprise.**

```mermaid
sequenceDiagram
  autonumber
  actor U as Humain
  participant W as Workflow Copilot (ctx)
  participant UC as RunPipeline
  participant DS as DecisionStore
  participant HI as HumanInteraction (Copilot)
  participant RD as RecordDecision

  W->>UC: run (tentative 1)
  UC->>DS: read(slug, "adr-ratification:007")
  DS-->>UC: null
  UC->>HI: ask(checkpoint)
  HI->>W: ctx.log(question, clé) puis ctx.pause(clé)
  W-->>U: run en pause dans /workflows
  U->>W: outil skraft_decide(slug, clé, "accept all")
  W->>RD: record(...)
  RD->>DS: write(slug, clé, "accept all")
  U->>W: R (reprendre)
  W->>UC: run (tentative 2, reprend depuis state.json)
  UC->>DS: read(slug, clé)
  DS-->>UC: "accept all"
```

Les `ctx.agent` déjà terminés ne sont pas relancés à la reprise : le SDK rejoue leur
résultat journalisé (même prompt et même `label`).

**Claude Code : boîte de dialogue.** `HumanInteraction` ouvre la question avec `$.ui.ask`
et le pipeline continue dans la même exécution. Sans surface, la réponse vaut `null` : le
run s'arrête en `awaiting-human`. On répond avec `/skraft decide <slug> <clé> <réponse>`,
puis on relance `/skraft <slug>`.

| Checkpoint | Clé | Réponses |
|---|---|---|
| Consentement de reporting | `reporting:consent` | `local`, `chat`, `pr`, `issue`, combinés par `+` ; `pr=#N`, `issue=#N`, `media=N`, `draft` |
| Ratification ADR | `adr-ratification:007,008` | `accept all`, `reject all`, `pause`, ou `007 accept`, `008 amend "note"` |
| Phase rejetée | `rejected:DESIGN:2` (nombre de reviews) | `rework`, `stop` |
| Environnement | `environment:DELIVER:qg-verify:r0:t1:n1` | `fixed`, `stop` |
| Phase sans budget | `stale:DESIGN:t2:r3` (retries, reviews) | `relaunch`, `stop` |
| État reconstruit | `recovery:RESEARCH,DESIGN` (phases déduites) | `resume`, `restart` |

### 6.4 Le reporting

```mermaid
sequenceDiagram
  autonumber
  participant UC as RunPipeline
  participant RB as ReportBoundaries
  participant RP as ReportPublication
  participant TR as ReportTransport (agent général)
  participant T as TrackingStore

  UC->>RB: ensureConsent — portée lue de origin et de la branche
  Note over RB: une fois — sans réponse, les rapports restent locaux
  UC->>RB: addendum(DISTILL) — forecast-data.json, médias
  UC->>RB: report(forecast, review DISTILL)
  RB->>T: forecast-data.json → renderReport → reporting/{date}/forecast.md
  RB->>RP: publish (PR, puis issue)
  RP->>RP: preparePublication (marqueur, digest)
  RP->>TR: observe({ packet }) — lecture seule
  TR-->>RP: snapshot normalisé
  RP->>RP: decidePublication → create / update / unchanged / pending
  RP->>TR: publish({ packet, decision }) — écriture puis relecture fraîche
  TR-->>RP: readback
  RP->>RP: recordPublication → reçu
  RP->>T: reporting/{kind}/{story}.json, publication.json
  RB-->>UC: résumé chat (chemins, statuts, URL réelles)
```

Seule la partie distante — appeler les outils MCP de l'hôte — est confiée à un agent : un
script ne peut pas les appeler. L'agent reçoit une tâche bornée et répond un seul objet
JSON ; le code garde tout le protocole (marqueur, digest, réconciliation, reçu). Une
réponse inexploitable laisse la destination en `pending`, avec sa raison ; la reprise a
lieu au prochain run, à `DONE` compris.

### 6.5 La recovery

| Diagnostic | Étape | Ce qui se passe |
|---|---|---|
| `HEALTHY` | `none` | rien |
| `MISSING_STATE` sans sauvegarde | `init` | état neuf ; si des fichiers montrent des phases terminées, checkpoint `recovery:…` |
| `MISSING_STATE`, `CORRUPTED_STATE`, `INVALID_STATE` avec sauvegarde saine | `rollback` | restaure la plus récente `state.json.bak.*` |
| `CORRUPTED_STATE`, `INVALID_STATE` sans sauvegarde | `reset` | l'état invalide est gardé (`.invalid.*`), état neuf, puis reconstruction confirmée |
| `STALE` | `resolve-stale` | checkpoint `stale:…` ; `relaunch` redonne un budget de retries à la phase |
| `IO_ERROR` | `halt` | `blocked` |

### 6.6 La clôture manuelle

`CloseManually.close({ slug, phase?, findings })` : refus si la phase n'a pas de reviewer,
n'est pas la phase ouverte, ou si le pipeline est `DONE` ; en DELIVER, refus tant qu'un des
20 derniers commits n'est pas `type(scope): subject` (renommer réécrit l'historique :
c'est au humain) ; puis `INCR_REWORK`, `reviews/{date}/manual-close.md` rendu depuis des
données avec le gabarit `review-verdict`, et `CLOSE_PHASE` à travers la phase gate.

---

### 6.7 Suivre un run : le journal et le canvas de la Copilot app

Le run tient un **journal**, `{tracking}/{slug}/run.json` : statut (`running`,
`awaiting-human`, `done`, `blocked`, `error`), phase, raison, question ouverte, story, les
200 dernières lignes de log, **chaque agent lancé** (phase, rôle, durée, coût) et **la dernière
vérification des preuves de tests** par le code (verdict, constats). `run-journal.mjs` l'écrit
en décorant les trois ports qui voient déjà tout — `PipelineProgress`, `HumanInteraction` et
`AgentRunner` —, sans toucher aux étapes. Une pause Copilot (`ctx.pause`) laisse donc le
journal sur la question posée.

**`ObservePipeline`** lit, sans rien écrire, `state.json`, le journal, les reviews (avec leur
verdict), les décisions et les reçus de publication, et en tire une vue
(`pipeline-view-policy.mjs`) : chaque phase avec son statut (`done`, `active`, `awaiting`,
`blocked`, `open`, `pending`), sa tentative sur le budget, son verdict, ses durées, ses
artefacts et ses reviews, et **ses étapes cochées** (`phase-steps-policy.mjs`) ; la question en
attente et si une réponse l'attend déjà ; **les tests** (`test-results-policy.mjs`) ; **le coût**
(`cost-policy.mjs`) ; les rapports et où ils sont publiés ; le log récent.

| Vue | D'où ça vient | Ce qu'on lit |
|---|---|---|
| Étapes | statut de la phase, artefacts, reviews, vérification des preuves, ratification ADR, rapports | ✓ réussi, ✕ échoué, ! en attente de toi, … en cours, – sauté, ○ pas atteint — par ex. en DELIVER : sorties de l'ingénieur, quality gates vérifiées par le code, review approuvée, rapport outcome, phase close |
| Tests | log de preuves `evidence/{date}/{story}/qg-{story}.json` (gates G1–G11, `metrics.tests_total/passed/failed`, cycles RED → GREEN) + verdict de `verifyEvidenceLog` journalisé | que les tests ont tourné, combien sont passés, et si le code a pu croire le log (`pass`, `fail`, `inconclusive`) |
| Coût | `usage` de chaque agent dans le journal | crédits IA (Copilot : nano-AIU ÷ 10⁹, 1 crédit = 0,01 $), dollars (Claude Code), euros si `SKRAFT_EUR_PER_USD` est fixé ; par phase et par agent, tokens et temps |

Le **canvas « Skraft pipeline »** de la Copilot app dessine cette vue en direct, en onglets :
**Overview** (question en attente, chiffres clés, étapes cochées de chaque phase), **Phases**,
**Tests**, **Cost**, **Reports**, **Journal** (décisions et log). La Copilot app
rend un canvas à partir de l'URL que donne son extension ; chaque instance ouverte démarre donc
son propre petit serveur sur `127.0.0.1`, port choisi par le système, protégé par un jeton
(et par les en-têtes Host, Origin et Sec-Fetch-Site).

```mermaid
sequenceDiagram
  autonumber
  actor U as Humain
  participant App as Copilot app
  participant C as Canvas (skraft-pipeline-canvas)
  participant S as Serveur local (canvas-server)
  participant O as ObservePipeline
  participant RD as RecordDecision
  participant W as Workflow skraft-pipeline

  U->>App: « Open the Skraft pipeline canvas »
  App->>C: open({}) — le pipeline de .active-slug
  C->>S: démarre sur 127.0.0.1:port
  C-->>App: { url (jeton), title, status }
  App->>S: GET / puis /api/events
  loop toutes les 1,5 s, tant que la page écoute
    S->>O: snapshot(slug)
    S-->>App: event: view (si la vue a changé)
  end
  W->>W: le run écrit run.json, state.json, les reviews
  U->>App: clic « rework »
  App->>S: POST /api/decide { key, answer }
  S->>RD: record(...)
  S-->>App: event: view (question marquée répondue)
  U->>App: « Ask Copilot to resume the run »
  App->>S: POST /api/ask { intent: resume }
  S->>App: session.send(prompt fixe) → le chat reprend le workflow
```

La page ne fait passer dans le chat que deux prompts fixes (reprendre, expliquer) ; tout ce
qu'elle affiche vient de fichiers écrits par les agents et est posé en texte, jamais en HTML.
Elle n'ouvre que les fichiers Markdown et JSON que la vue liste, jamais `state.json`. L'agent
a les mêmes moyens par les actions du canvas : `get_pipeline`, `decide`, `show_phase`,
`refresh`.

**Un pipeline par copie de travail.** Le dossier de suivi est sous la copie de travail : chaque
worktree a donc son propre `{tracking}/.active-slug`, écrit par `RunPipeline` au démarrage.
C'est la seule façon de désigner « le pipeline » (`application/pipeline/active-pipeline.mjs`,
politique `active-pipeline-policy`) : le canvas, `skraft_decide`, `skraft_close_phase`,
`/skraft decide` et `/skraft close` agissent sur ce pipeline-là, refusent un autre slug
(`NOT_THE_ACTIVE_PIPELINE`) et ne devinent rien (ni par la branche, ni par « le seul pipeline
du dossier »). Sans pointeur (`NO_ACTIVE_PIPELINE`), les outils refusent et le canvas
s'ouvre sur « aucun pipeline actif dans cette copie de travail », avec son chemin ; il relit
le pointeur à chaque rafraîchissement et affiche le run dès qu'il démarre. Le canvas lit la
copie de travail de la session (`session.workingDirectory`), pas celle du processus.

Attention : `SKRAFT_TRACKING_ROOT` (chemin absolu) partage le dossier de suivi, donc le
pointeur, entre tous les worktrees ; ne le fixez pas si vous en lancez plusieurs.

### 6.8 La revue DELIVER en code (`RunReview`)

Le mode de revue se choisit par hôte : `SKRAFT_REVIEW_MODE=code` dans l'environnement du mod
Claude Code ou de la CLI Copilot, ou `reviewMode: "code"` dans les `args` du workflow
`skraft-pipeline`. Sans réglage, rien ne change : le reviewer agent de la phase écrit la review.

En mode `code`, l'étape reviewer de DELIVER garde sa place (même contrôle d'ordre G1) mais
n'envoie plus `Skraft - Software Engineer Reviewer`. `RunReview` :

1. **prépare** ce que les lentilles lisent, à côté de la review : `qg-verify-{story}.json` (le
   résultat de la vérification des preuves que le pipeline vient de faire), `commits-{story}.txt`,
   `diff-{story}.patch` et `files-{story}.txt` depuis le `baseSha` de DELIVER ;
2. **planifie** les lentilles (`review-lenses.mjs`) : les quatre lentilles de base
   (`quality-gates`, `architecture-boundaries`, `test-integrity`, `cold-reader`), plus
   `mock-fidelity` et `contract-fidelity` quand un chemin modifié ou une ligne ajoutée du patch
   les déclenche ;
3. **lance** chaque lentille avec ses seules entrées (`cold-reader` : le patch et la liste,
   rien du producteur). Une réponse qui n'est pas le document `{ lens, verdict, defects }`
   est refusée une fois, avec la raison ; refusée deux fois, la lentille est `inconclusive` ;
4. **décide** avec la matrice de sévérité (`review-verdict-policy.mjs`) : un blocker, un high,
   un medium, une lentille `fail` ou `inconclusive` donnent `NEEDS_REWORK` ; seuls des `low`
   ou des `pass` donnent `APPROVED`. `escalation: environment` quand toutes les raisons sont
   des lentilles inconclusives dont chaque défaut est un `low` commençant par `environment:` ;
5. **écrit** `reviews/{date}/deliver-review-{N}.md` avec le gabarit `review-verdict` :
   `status`, `lens_results`, `dissent_analysis`, `summary`, `reviewed_sha`, `escalation`.

La suite ne change pas : `readReviewOutcome`, `stepAfterReview`, le budget de retries et la
phase gate lisent ce fichier comme celui d'un reviewer. Une lentille absente de l'hôte arrête
le run (`blocked`), comme un agent de phase absent. Chaque lentille est journalisée avec le
rôle `lens`, sa durée et son coût. Les lentilles tournent l'une après l'autre ; le parallèle
viendra avec `AgentRunner.runMany`.

## 7. Cohabitation avec les settings hooks

Restent dans `hooks/hooks.json` : la **provenance** des dispatchs, **G7/G8** (session guard :
`state.json` protégé, écritures DELIVER), **G2/G3** (SubagentStart/Stop, lectures de
SKILL.md) et le ménage de démarrage. **G1, G6 et G9 ont disparu** : RunPipeline vérifie
l'ordre et le handoff lui-même, et enregistre ce que les agents rendent.

Au démarrage, `RunPipeline` écrit `{tracking}/.active-slug` (`ActivePipeline`) : c'est le
pipeline contre lequel le session guard juge les écritures. Le journal d'audit est dans
`.git/skraft/skill-audit.jsonl` (ou `SKRAFT_AUDIT_LOG`).

---

## 8. Ce que le pipeline écrit

| Fichier | Écrit par | Quand |
|---|---|---|
| `{tracking}/{slug}/state.json` (+ `.bak.*`, `.invalid.*`, `.corrupted.*`) | `StateWriter`, `StateArchive`, `StateReader` | à chaque événement ; sauvegardes selon l'hôte |
| `{tracking}/.active-slug` | `ActivePipeline` | au démarrage de chaque run |
| `{tracking}/{slug}/run.json` | journal du run | à chaque phase, ligne de log, question, réponse et fin de run |
| `{tracking}/{slug}/details/{date}/structural-scan.json` | `StructuralScan` | avant le premier passage de l'architecte |
| `{tracking}/{slug}/reviews/{date}/{phase}-review-{N}.md` | le reviewer | `{N}` = reviews déjà enregistrées + 1 |
| `{tracking}/{slug}/reviews/{date}/manual-close.md` | `CloseManually` | clôture manuelle |
| `{tracking}/{slug}/reviews/{date}/{qg-verify-{story}.json, commits-{story}.txt, diff-{story}.patch, files-{story}.txt}` | `RunReview` | avant les lentilles, en mode de revue `code` |
| `{tracking}/{slug}/decisions/{clé}.json` | `DecisionStore` | à chaque réponse humaine |
| `{tracking}/{slug}/reporting/{date}/{forecast,outcome}-data.json` | le designer, l'ingénieur | à leur dispatch |
| `{tracking}/{slug}/reporting/{date}/distill-handoff.md` | `ReportBoundaries` | après le designer |
| `{tracking}/{slug}/reporting/{date}/{forecast,outcome}.md` | `ReportBoundaries` | après DISTILL, après DELIVER |
| `{tracking}/{slug}/reporting/pending.json`, `{kind}/{story}.json`, `publication.json` | `ReportPublication` | à chaque publication |

`{tracking}` vaut `SKRAFT_TRACKING_ROOT` s'il est défini, sinon
`.copilot-tracking/skraft-plans` à la racine du dépôt.

---

## 9. Tester

| Ce qui est testé | Fichier | Comment |
|---|---|---|
| Cas d'usage, tous les chemins | `tests/skraft-framework/pipeline/run-pipeline.use-case.test.mjs` | doubles InMemory de chaque port, LLM simulé ([`fake-host.mjs`](../tests/skraft-framework/pipeline/fake-host.mjs)) |
| Recovery | `pipeline-recovery.use-case.test.mjs` | états corrompus, invalides, sans budget, reconstruits |
| Reporting | `reporting.use-case.test.mjs` | consentement, addendum, rendu, GitHub simulé, reprise |
| Clôture manuelle | `close-manually.use-case.test.mjs` | rejet puis clôture, commits non conventionnels |
| Revue en code | `run-review.use-case.test.mjs`, `review-policies.unit.test.mjs` | lentilles simulées : verdicts, réponse refusée puis acceptée, lentille inconclusive, escalade environnement, lentille absente, lentille conditionnelle ; matrice et lecture des réponses |
| Règles du domaine | `pipeline-policies.unit.test.mjs`, `pipeline-domain.unit.test.mjs` | fonctions pures |
| Adaptateurs pilotés | `pipeline-adapters.unit.test.mjs`, `quality-gates/git-source-control.unit.test.mjs` | vrais dépôts git, dossiers temporaires, `ctx` simulé |
| Workflow Copilot de bout en bout | `copilot-workflow-adapter.integration.test.mjs` | vrai dépôt, consentement, ADR, forecast, preuves, hooks, clôture |
| Mod Claude Code | `plugins/skraft-framework/hooks/skraft-mod.test.ts` | runtime réel des mods (`claude plugin test`) |
| Vue d'un pipeline | `observe-pipeline.use-case.test.mjs` | vue construite après de vrais runs du cas d'usage |
| Canvas de la Copilot app | `copilot-canvas.integration.test.mjs` | vrai serveur local, HTTP et server-sent events, jeton, actions de l'agent |
| Règle de dépendance | `tests/skraft-framework/architecture/pipeline-dependency-rule.test.mjs` | lecture des imports |

```bash
node --test tests/skraft-framework/pipeline/*.test.mjs tests/skraft-framework/architecture/*.test.mjs
claude plugin validate plugins/skraft-framework
claude plugin test plugins/skraft-framework
```

---

## 10. Ajouter un hôte

1. Écrire un adaptateur par port propre à l'hôte : en général `AgentRunner`,
   `HumanInteraction` et `PipelineProgress` (le transport de reporting se bâtit sur
   `AgentRunner`). Les autres existent déjà, pour Node ou sur fonctions de fichiers.
2. Composer les dépendances dans le point d'entrée de l'hôte, sur le modèle de
   `runSkraftPipelineWorkflow`.
3. Appeler `createRunPipeline(deps).run({ slug, story })` et afficher le résultat ;
   exposer `RecordDecision` et `CloseManually`.
4. Ajouter un test d'intégration avec un faux contexte d'hôte.

---

## 11. Limites connues

- **Copilot** : workflows dynamiques et extensions sont en public preview (CLI lancée
  avec `--experimental`). Une session enregistre les agents du plugin sous son propre
  identifiant (`skraft:solution-researcher`), et `ctx.agent` ne répond rien pour un nom
  qu'elle ne connaît pas. Le runner résout donc l'identifiant une fois par run :
  `args.agentIds`, sinon la liste des agents de la session (`session.agent.list` : `id`,
  `name` ou `displayName`, ou un `id` en `:<fichier>`), sinon `<plugin>:<fichier>`. Un agent
  que la session n'a pas arrête le run aussitôt, en le nommant, sans les trois essais.
- **Mod** : `$.process.run` plafonne à 10 minutes et à 4 Mio de sortie (une sortie git
  coupée vaut absence) ; `$.fs` n'a ni rename ni delete : l'état est écrit en place, relu,
  et sauvegardé à chaque changement de phase ; `reporting/pending.json` terminé est vidé
  (`{}`), pas supprimé.
- **Reporting** : pas de création de PR (une cible sans numéro reste `pending`) ; le
  numéro de PR se donne dans la réponse au consentement (`pr=#N`).
- **Canvas** : l'API canvas du SDK Copilot est expérimentale ; seule la Copilot app dessine
  les canvases (pas la CLI). La page suit les fichiers par sondage (1,5 s), pas par
  notification.
- **Coût** : il est attribué à un agent parce que le pipeline n'en lance qu'un à la fois ; un
  autre travail dans la même session pendant ce temps s'y ajouterait. La conversion nano-AIU →
  crédits (÷ 10⁹) suit la documentation du SDK Copilot ; un agent rejoué à la reprise ne coûte
  rien et n'est pas compté. Les euros dépendent du taux que tu fixes.
- **Décisions persistées** : une réponse enregistrée resservira si la même clé revient.
  `/skraft decide` la remplace ; supprimer `decisions/<clé>.json` force la question.
