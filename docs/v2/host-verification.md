<!-- markdownlint-disable-file -->
# Vérification d'hôte Copilot — index d'évidence

Ce que le pilote Copilot suppose de l'hôte, mesuré par `eng/host-probe/copilot-probe.mjs` (hôte SDK headless, aucun appel de modèle) — [ADR-002](../adr/adr-002-copilot-host-driver-contract.md), issue #251. Chaque passage de la sonde ajoute sa section en tête, avec les versions mesurées.

## Mesures

### Sonde d'hôte Copilot — 2026-10-24 (branche v2/copilot-driver-contract)

Copilot CLI GitHub Copilot CLI 1.0.102-1. · SDK 1.0.102-1 · Node v22.17.1 · darwin 25.5.0. Aucun appel de modèle.

| Contrôle | Issue | Verdict | Observé |
| --- | --- | --- | --- |
| `extension-loads-agent-plugins` | — | pass | {"toolOffered":true,"extensions":[{"name":"microcks-canvas","status":"running"},{"name":"skraft-probe-agent:skraft-probe-a","status":"running"},{"name":"skraft-probe-legacy:skraft-probe-l","status":"running"}]} |
| `extension-loads-claude-plugin` | — | pass | {"toolOffered":true} |
| `cwd-after-cd` | #245 | pass | {"atLoad":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-9NGCxy/repo-a","processCwdAfter":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-9NGCxy/repo-a","trackedAfter":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe |
| `snapshot-working-directory` | — | pass | {"atLoad":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-9NGCxy/repo-a","afterCd":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-9NGCxy/repo-b","repoA":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-9NGCxy/repo-a" |
| `confirm-from-tool` | #244 | pass | {"elicitationCapability":true,"mode":"interactive","modeError":null,"accepted":{"value":true},"declined":{"value":false},"hostAsked":2} |
| `confirm-in-autopilot` | #244 | inconclusive | {"result":null,"hostAsked":0} |
| `confirm-from-workflow` | #244 | pass | {"status":"completed","result":{"hasSession":true,"elicitation":true,"value":true},"error":null} |
| `throwing-workflow` | #247 | pass | {"status":"error","hasResult":false,"error":"Request workflow.execute failed with message: skraft-probe-sentinel","failure":null} |
| `copilot-model-refusal` | — | inconclusive | {"reason":"needs --agent-calls: each of these checks starts one agent, which may spend AI credits"} |
| `copilot-effort-refusal` | — | inconclusive | {"reason":"needs --agent-calls: each of these checks starts one agent, which may spend AI credits"} |
| `broken-workflow-isolation` | #246 | pass | {"toolOffered":false} |
| `bad-tool-name-isolation` | #246 | pass | {"status":"rpc-error","error":"No workflow registered with name \"skraft-probe-iso\""} |
| `skraft-extension-loaded` | — | pass | {"skraftDecideOffered":true} |
| `skraft-workflow-registered` | — | pass | {"status":"completed","result":{"status":"refused","slug":null,"phase":null,"code":"invalid-slug","reason":"slug must be kebab-case, got \"Not A Slug\""},"error":null} |
| `unknown-arg-ignored` | #249 | fail | {"status":"completed","result":{"status":"refused","slug":null,"phase":null,"code":"invalid-args","reason":"the workflow takes only slug, issue, title, base, fromArtifacts and agentIds; nothing was started"},"error":null} |
| `decide-without-confirm` | #244 | fail | {"toolResult":"Refused: you did not confirm the decision in Copilot; nothing was recorded.","answeredBy":[],"hostAsked":1} |
| `decide-after-cd` | #245 | fail | {"toolResult":"Recorded: probe-question: adr-0 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).","answeredInSecondRepo":true} |
| `session-agents` | — | pass | {"agentFiles":22,"missing":[],"sample":[{"id":"skraft:finding-refuter","name":"skraft:finding-refuter"},{"id":"skraft:business-alignment-lens","name":"skraft:business-alignment-lens"},{"id":"skraft:refactoring-worker","name":"skraft:refactoring-worker"},{"id":"skraft:fitness-lens","name":"skraft:fit |
| `copilot-models-available` | — | inconclusive | {"configured":[]} |

Sur le pilote corrigé, `unknown-arg-ignored`, `decide-without-confirm` et `decide-after-cd` échouent : la prémisse de leur issue (#249, #244, #245) ne tient plus. `snapshot-working-directory` mesure l'amorce du suivi de répertoire (#245).

### Sonde d'hôte Copilot — 2026-10-20

Copilot CLI GitHub Copilot CLI 1.0.101-0. · SDK 1.0.101-0 · Node v22.17.1 · darwin 25.5.0. Aucun appel de modèle.

| Contrôle | Issue | Verdict | Observé |
| --- | --- | --- | --- |
| `extension-loads-agent-plugins` | — | pass | {"toolOffered":true,"extensions":[{"name":"microcks-canvas","status":"running"},{"name":"skraft-probe-agent:skraft-probe-a","status":"running"},{"name":"skraft-probe-legacy:skraft-probe-l","status":"running"}]} |
| `extension-loads-claude-plugin` | — | pass | {"toolOffered":true} |
| `cwd-after-cd` | #245 | pass | {"atLoad":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-21zsnF/repo-a","processCwdAfter":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-21zsnF/repo-a","trackedAfter":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe |
| `confirm-from-tool` | #244 | pass | {"elicitationCapability":true,"mode":"interactive","modeError":null,"accepted":{"value":true},"declined":{"value":false},"hostAsked":2} |
| `confirm-in-autopilot` | #244 | inconclusive | {"result":null,"hostAsked":0} |
| `confirm-from-workflow` | #244 | pass | {"status":"completed","result":{"hasSession":true,"elicitation":true,"value":true},"error":null} |
| `throwing-workflow` | #247 | pass | {"status":"error","hasResult":false,"error":"Request workflow.execute failed with message: skraft-probe-sentinel","failure":null} |
| `broken-workflow-isolation` | #246 | pass | {"toolOffered":false} |
| `bad-tool-name-isolation` | #246 | pass | {"status":"rpc-error","error":"No workflow registered with name \"skraft-probe-iso\""} |
| `skraft-extension-loaded` | — | pass | {"skraftDecideOffered":true} |
| `skraft-workflow-registered` | — | pass | {"status":"completed","result":{"status":"refused","slug":null,"phase":null,"code":"invalid-slug","reason":"slug must be kebab-case, got \"Not A Slug\""},"error":null} |
| `unknown-arg-ignored` | #249 | pass | {"status":"completed","result":{"status":"refused","slug":null,"phase":null,"code":"invalid-slug","reason":"slug must be kebab-case, got \"Not A Slug\""},"error":null} |
| `decide-without-confirm` | #244 | pass | {"toolResult":"Recorded: probe-question: adr-0 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).","answeredBy":["decide"],"hostAsked":0} |
| `decide-after-cd` | #245 | pass | {"toolResult":"Refused: adr-0 was already answered RATIFIED; nothing was recorded.","answeredInSecondRepo":false} |
| `session-agents` | — | pass | {"agentFiles":24,"missing":[],"sample":[{"id":"skraft:contract-testing-worker","name":"skraft:contract-testing-worker"},{"id":"skraft:finding-refuter","name":"skraft:finding-refuter"},{"id":"skraft:business-alignment-lens","name":"skraft:business-alignment-lens"},{"id":"skraft:refactoring-worker","n |
| `copilot-models-available` | — | pass | {"missing":[],"available":["auto","claude-fable-5","claude-fable-5.1","claude-haiku-4.5","claude-haiku-5.5","claude-opus-4.8","claude-opus-5","claude-opus-5.5","claude-sonnet-5","claude-sonnet-5.5","gemini-3.8-flash","gemini-4-argon","gpt-5.3-codex","gpt-5.6-luna","gpt-5.6-sol","gpt-5.6-terra","gpt- |

## Non vérifié

- Tout ce que liste la sonde, tant qu'aucune section ci-dessus ne le mesure.
- L'app Copilot (canvas, élicitation, réponse sans personne), une session CLI interactive, Windows.
- Le comportement des sous-agents lancés par `ctx.agent` : noms acceptés par l'option `model`, effet de `maxConcurrentSubagents`, coût d'un run.
- Le texte d'un refus de modèle et d'un refus de `reasoningEffort` (le classifieur `refusalOf` du pilote suppose des textes) : `copilot-model-refusal` et `copilot-effort-refusal`, à lancer avec `--agent-calls`.
- `$.agent.spawn` du mod Claude Code ne déclare pas `effort` (API du mod, Claude Code 2.1.305) : le pilote ne le passe pas.
- Windows : `CommandRunner` arrête l'arbre par `taskkill /PID <pid> /T /F` puis lâche les tubes ; vérifié seulement par le test Windows de la CI, pas sur une machine (#248).
- Ce que l'hôte fait d'un run en pause ou annulé : le pilote relance une annulation seulement quand `ctx.signal` est annulé (une `AbortError` seule est l'échec de ce qui l'a levée) ; que le SDK annule le signal avant de rejeter les appels en cours est lu dans son source 1.0.101 (`awaitWorkflowOperation`), non mesuré (#247).
- La clé `subagents.agents` de `~/.copilot/settings.json` que lit `skraft doctor`.
