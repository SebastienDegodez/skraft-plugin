<!-- markdownlint-disable-file -->
# Vérification d'hôte Copilot — index d'évidence

Ce que le pilote Copilot suppose de l'hôte, mesuré par `eng/host-probe/copilot-probe.mjs` (hôte SDK headless, aucun appel de modèle) — [ADR-002](../adr/adr-002-copilot-host-driver-contract.md), issue #251. Chaque passage de la sonde ajoute sa section en tête, avec les versions mesurées.

## Mesures

### En attente de mesure

Ce que le pilote suppose déjà sans mesure ; la prochaine passe de la sonde remplace chaque ligne par son verdict.

| Contrôle | Issue | Verdict | Supposé par |
| --- | --- | --- | --- |
| `confirm-joined-session-from-workflow` | — | not measured | le consentement de `skraft-review` (#240) : `host-confirmation.mjs` appelle, pendant un run de workflow, `session.ui.confirm` et `rpc.mode.get` de la session jointe, pas `ctx.session` |
| agent lancé : charge-t-il `AGENTS.md`, `CLAUDE.md` ou `.github/copilot-instructions.md` de la copie de travail (Copilot CLI) | — | not measured, aucun contrôle de sonde | rien : la revue d'une pull request (#240) n'en suppose rien ; si l'hôte les charge, ses lentilles lisent la version de l'auteur de la pull request à côté des copies de la base que leur brief désigne |
| agent lancé : même question sous Claude Code et sous VS Code | — | not measured, hors de cette sonde | idem |

### Sonde d'hôte Copilot — 2026-10-27 (branche v2/copilot-driver-gaps)

Copilot CLI GitHub Copilot CLI 1.0.102-1. · SDK 1.0.102-1 · Node v22.17.1 · darwin 25.5.0. Aucun appel de modèle.

| Contrôle | Issue | Verdict | Observé |
| --- | --- | --- | --- |
| `extension-loads-agent-plugins` | — | pass | {"toolOffered":true,"extensions":[{"name":"microcks-canvas","status":"running"},{"name":"skraft-probe-agent:skraft-probe-a","status":"running"},{"name":"skraft-probe-legacy:skraft-probe-l","status":"running"}]} |
| `extension-loads-claude-plugin` | — | pass | {"toolOffered":true} |
| `cwd-after-cd` | #245 | pass | {"atLoad":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-aVI3HD/repo-a","processCwdAfter":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-aVI3HD/repo-a","trackedAfter":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe |
| `snapshot-working-directory` | — | pass | {"atLoad":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-aVI3HD/repo-a","afterCd":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-aVI3HD/repo-b","repoA":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-aVI3HD/repo-a" |
| `confirm-from-tool` | #244 | pass | {"elicitationCapability":true,"mode":"interactive","modeError":null,"accepted":{"value":true},"declined":{"value":false},"hostAsked":2} |
| `confirm-in-autopilot` | #244 | inconclusive | {"result":null,"hostAsked":0} |
| `confirm-from-workflow` | #244 | pass | {"status":"completed","result":{"hasSession":true,"elicitation":true,"value":true},"error":null} |
| `throwing-workflow` | #247 | pass | {"status":"error","hasResult":false,"error":"Request workflow.execute failed with message: skraft-probe-sentinel","failure":null} |
| `copilot-model-refusal` | — | inconclusive | {"reason":"needs --agent-calls: each of these checks starts one agent, which may spend AI credits"} |
| `copilot-effort-refusal` | — | inconclusive | {"reason":"needs --agent-calls: each of these checks starts one agent, which may spend AI credits"} |
| `broken-workflow-isolation` | #246 | pass | {"toolOffered":false} |
| `bad-tool-name-isolation` | #246 | pass | {"status":"rpc-error","error":"No workflow registered with name \"skraft-probe-iso\""} |
| `skraft-extension-loaded` | — | pass | {"skraftDecideOffered":true} |
| `skraft-workflow-registered` | — | pass | {"status":"completed","result":{"status":"refused","slug":null,"phase":null,"code":"invalid-slug","reason":"slug must be kebab-case: lowercase letters and digits, joined by single hyphens"},"error":null} |
| `unknown-arg-ignored` | #249 | fail | {"status":"completed","result":{"status":"refused","slug":null,"phase":null,"code":"invalid-args","reason":"the workflow takes only slug, issue, title, base, fromArtifacts and agentIds; nothing was started"},"error":null} |
| `decide-without-confirm` | #244 | fail | {"toolResult":"Refused: you did not confirm the decision in Copilot; nothing was recorded.","answeredBy":[],"hostAsked":1} |
| `decide-after-cd` | #245 | fail | {"toolResult":"Recorded: probe-question: adr-0 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).","answeredInSecondRepo":true} |
| `session-agents` | — | pass | {"agentFiles":19,"missing":[],"sample":[{"id":"skraft:finding-refuter","name":"skraft:finding-refuter"},{"id":"skraft:business-alignment-lens","name":"skraft:business-alignment-lens"},{"id":"skraft:fitness-lens","name":"skraft:fitness-lens"},{"id":"skraft:solution-researcher","name":"skraft:solution |
| `copilot-models-available` | — | inconclusive | {"configured":[]} |
| `skraft-tool-names-free` | — | pass | {"native":["bash","create","dynamic_workflows_manage","edit","extensions_manage","extensions_reload","glob","grep","list_agents","list_bash","read_agent","read_bash","run_dynamic_workflow","semantic_code_search","skill","sql","stop_bash","task","view","web_fetch","write_agent"],"skraft":["skraft_dec |

Outils natifs d'une session sans plugin (`skraft-tool-names-free`, CLI 1.0.102-1, connecté) : `bash`, `create`, `dynamic_workflows_manage`, `edit`, `extensions_manage`, `extensions_reload`, `glob`, `grep`, `list_agents`, `list_bash`, `read_agent`, `read_bash`, `run_dynamic_workflow`, `semantic_code_search`, `skill`, `sql`, `stop_bash`, `task`, `view`, `web_fetch`, `write_agent`. Aucun ne s'appelle `skraft_decide`.

Même sonde sans connexion (HOME vide, aucune variable de jeton, `isAuthenticated: false`), même CLI et même machine : `extension-loads-agent-plugins`, `extension-loads-claude-plugin`, `cwd-after-cd`, `snapshot-working-directory`, `confirm-from-tool`, `skraft-extension-loaded` et `skraft-tool-names-free` passent ; tout `rpc.workflow.run` répond `Agent workflows are not available for this session`, d'où `skraft-workflow-registered` et `session-agents` en échec, `confirm-from-workflow`, `throwing-workflow` et `unknown-arg-ignored` non concluants, et un `bad-tool-name-isolation` en `pass` qui ne mesurait rien ; la sonde le rend désormais `inconclusive` sur cette réponse (mesuré le même jour, même CLI). Les outils natifs y sont les mêmes moins `dynamic_workflows_manage` et `run_dynamic_workflow`. C'est ce que mesure le smoke CI, qui n'a pas de compte Copilot.

Non mesuré : le motif de nom d'outil que l'hôte accepte. La sonde sait seulement que `bad name!` est refusé.

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

## Rejeu d'un commit rouge (`CommitReplay`, tout hôte) — 2026-10-27 (branche fix/298-e2e-rouge)

Mesuré à la main, issue #298 : la graine `eng/e2e-scenarios/mastermind/seed` copiée dans un dépôt
neuf, `npm ci` dans `api/` et `web/` de la copie de travail, puis un commit
`test(jouer-une-partie): …` qui n'ajoute que `web/e2e/partie.spec.ts` (un bouton absent).
Chaque rejeu passe par l'adaptateur du moteur (`createGitCommitReplay`, worktree détaché sous
`<git common dir>/skraft-replay/<sha>`) et le `createNodeCommandRunner` du moteur, `cwd` `web`.
Node v22.17.1 · npm 11.4.2 · git 2.47.0 · Playwright 1.61.1 · Vitest 4.1.12 · Vite 8.3.3 (graine) · macOS 26.5.

| Commande | Où | Sortie | Observé |
| --- | --- | --- | --- |
| `npx vitest run` | rejeu, commit rouge | `started`, exit 1 | `Startup Error … ERR_MODULE_NOT_FOUND: Cannot find package 'vite' imported from ~/.npm/_npx/…/vitest/…` |
| `npx vitest run` | rejeu, parent | `started`, exit 1 | idem |
| `npx playwright test` | rejeu, commit rouge | `started`, exit 1 | `Error: Cannot find package '@playwright/test' imported from …/skraft-replay/<sha>/web/playwright.config.ts` |
| `npx playwright test` | rejeu, parent | `started`, exit 1 | idem |
| `npx vitest run` | copie de travail | exit 0 | 3 fichiers, 5 tests passés |
| `npx playwright test` | copie de travail | exit 1 | 2 échecs (`partie.spec.ts`, clair et sombre), 2 passés (`palette.spec.ts`) |

Ce qui en découle :

- Le worktree du rejeu n'a pas de `node_modules` : l'adaptateur ne les lie ni ne les installe.
  `npx` va chercher le binaire dans son cache, qui ne trouve pas les dépendances du composant, et
  sort en 1 : `failureOf` le classe `deterministic`, donc rouge.
- L'e2e d'un commit rouge ne compte que s'il passe au parent ; ici il échoue aussi au parent, et
  le pas attend un humain au lieu de compter un rouge.
- La commande `test` d'un composant JavaScript dont les dépendances sont dans son propre
  `node_modules` sort elle aussi en 1 au rejeu, au commit comme au parent : le moteur la compte
  rouge. Non corrigé par #298 ; corrigé par #303 (section suivante).

### Après #303 — 2026-10-28 (branche fix/303-rejeu-dependances)

Même dépôt Mastermind, mêmes versions, plus un commit `test(…)` rouge sous Vitest
(`web/tests/unit/rouge.test.ts`). Le rejeu lie chaque `node_modules` et `.venv` ignoré de la copie
de travail au même endroit du worktree (lien symbolique, jonction sous Windows) et extrait le
commit dans `<tmp>/skraft-replay/<id>/<sha>`, hors du dossier `.git`.

| Commande | Où | Sortie | Observé |
| --- | --- | --- | --- |
| `npx vitest run` | rejeu, graine verte | exit 0 | 3 fichiers, 5 tests passés |
| `npx vitest run` | rejeu, commit rouge Vitest | exit 1 | `rouge.test.ts` : 1 échec, 5 passés |
| `npx vitest run` | rejeu, commit rouge e2e | exit 0 | 5 tests passés : le rejeu passe à l'e2e |
| `npx playwright test` | rejeu, commit rouge e2e | exit 1 | `toBeVisible` : bouton absent (vrai échec) |
| `npx playwright test` | rejeu, son parent | exit 0 | 2 passés : l'e2e prouve le rouge |
| `git status` de la copie de travail | avant et après deux rejeux Playwright | vide | un seul worktree listé, `node_modules` intacts |

Mesures annexes, même machine :

- Worktree sous `.git` (l'emplacement d'avant), `node_modules` liés : `npx vitest run` à la graine
  verte sort en 1, `Cannot find module '/tests/setup.ts'` ; Vite saute les dossiers nommés `.git`.
  Le même worktree hors de `.git` : exit 0, 5 tests passés.
- .NET (SDK 10.0.300, projet `dotnet new xunit`) : `dotnet test` dans un worktree neuf restaure
  seul depuis le cache NuGet ; exit 1 au commit rouge, exit 0 à son parent, 4 s chacun. Aucun
  lien n'est nécessaire.
- Python 3.14.7, `.venv` avec pytest dans `api/` : au rejeu, `.venv/bin/python -m pytest` sort en
  0 au commit vert et en 1 au rouge (`AssertionError`) ; `python -m pytest` tel qu'écrit ne
  démarre pas (`command not found: python`, et le `python3` du PATH n'a pas pytest). Le rejeu
  prend donc l'interpréteur comme les gates : `.venv/bin/python`, `.venv/Scripts/python.exe`,
  `python`, `python3`.
- Une jonction n'a pas été mesurée sous Windows : le rejeu retire ses liens avant `git worktree
  remove`, et seulement des liens, pour que Git n'en suive jamais un.

## Non vérifié

- Tout ce que liste la sonde, tant qu'aucune section ci-dessus ne le mesure.
- L'app Copilot (canvas, élicitation, réponse sans personne), une session CLI interactive, Windows.
- Le motif de nom d'outil que l'hôte accepte pour un outil d'extension : seul le refus de `bad name!` est observé (`bad-tool-name-isolation`).
- Le comportement des sous-agents lancés par `ctx.agent` : noms acceptés par l'option `model`, effet de `maxConcurrentSubagents`, coût d'un run.
- Le texte d'un refus de modèle et d'un refus de `reasoningEffort` (le classifieur `refusalOf` du pilote suppose des textes) : `copilot-model-refusal` et `copilot-effort-refusal`, à lancer avec `--agent-calls`.
- `$.agent.spawn` du mod Claude Code ne déclare pas `effort` (API du mod, Claude Code 2.1.305) : le pilote ne le passe pas.
- Windows : `CommandRunner` arrête l'arbre par `taskkill /PID <pid> /T /F` puis lâche les tubes ; vérifié seulement par le test Windows de la CI, pas sur une machine (#248).
- Ce que l'hôte fait d'un run en pause ou annulé : le pilote relance une annulation seulement quand `ctx.signal` est annulé (une `AbortError` seule est l'échec de ce qui l'a levée) ; que le SDK annule le signal avant de rejeter les appels en cours est lu dans son source 1.0.101 (`awaitWorkflowOperation`), non mesuré (#247).
- La clé `subagents.agents` de `~/.copilot/settings.json` que lit `skraft doctor`.

## VS Code (lot 10) — ce que les pilotes supposent, non mesuré

Aucun run réel sous VS Code n'a encore eu lieu (#222, critère de fin). Les deux pilotes sont testés sur hôte simulé seulement : `tests/skraft-framework/integration/copilot-sdk/` (SDK simulé qui exécute le vrai corps du workflow) et `tests/skraft-framework/integration/agent-loop/` (agent conducteur simulé, journal comparé à celui du workflow Copilot).

### Pilote SDK (`engine/drivers/copilot-sdk/skraft-run.mjs`)

Mesuré, par les sondes du 2026-10-20 (CLI 1.0.101-0) et du 2026-10-24 (CLI 1.0.102-1), darwin : une session SDK headless avec `pluginDirectories` sur le plugin et `requestExtensions` charge l'extension, et `rpc.workflow.run` du workflow `skraft-pipeline` finit `completed` avec l'issue du moteur (`skraft-workflow-registered`, slug invalide, aucun agent) ; un workflow non enregistré est rejeté (`bad-tool-name-isolation`). Le pilote suit ce chemin et redemande `rpc.workflow.run` jusqu'à l'enregistrement (45 s par défaut, l'attente d'outils de la sonde).

Non mesuré :

- Un run complet par `skraft-run` : agents lancés par `ctx.agent` dans un run de workflow démarré par le SDK, durée, coût.
- Les demandes de permission des outils de ces agents : qu'elles arrivent à `onPermissionRequest` du client, et que `{ kind: 'approve-once' }` et `{ kind: 'reject' }` (typages du SDK 1.0.102-1) soient acceptés ; les champs résumés à la personne (`fullCommandText`, `fileName`, `path`, `url`, `toolName`) viennent des mêmes typages.
- Le statut `paused` rendu pour un run dont `ctx.pause` arrête le corps (question humaine). L'élicitation depuis un outil et un workflow est mesurée avec un gestionnaire côté hôte (`confirm-from-tool`, `confirm-from-workflow`, 1.0.102-1) ; `skraft-run` n'en déclare pas, la confirmation Copilot y est donc refusée et la personne répond par `skraft decide` dans son terminal (`cli-tty`) — non mesuré de bout en bout.
- La disposition `~/.copilot/pkg/<plateforme>-<arch>/<version>/` (`copilot-sdk/index.js` et `index.js`) : le localisateur ne lit que le dossier `process.platform-process.arch` de la machine (mesuré `darwin-arm64` seulement ; `win32-x64`, `linux-x64` supposés) et ordonne les versions en semver (préversion sous sa version) ; le besoin de `COPILOT_CLI_PATH` sous Windows et sous Linux.
- Le lancement depuis un terminal VS Code et depuis une tâche VS Code : terminal interactif ou non (sans TTY, chaque permission est refusée ; `--allow-all-tools` les approuve toutes), et ce que Ctrl-C laisse du processus CLI enfant.
- Le Canvas : ce pilote n'en ouvre pas (lot 8).

### Repli : la boucle d'agent (`skraft next` / `skraft record`)

Non mesuré :

- Que VS Code charge les agents Copilot du plugin (`com.github.copilot/agents/`) et que l'orchestrateur puisse lancer l'un d'eux en sous-agent, par son nom, avec le prompt donné ; le choix du modèle d'un sous-agent.
- Que le message final d'un sous-agent revienne entier à l'orchestrateur, et que l'orchestrateur l'écrive tel quel dans le fichier de réponse (outil d'édition, aucun `tools:` dans l'en-tête Copilot de l'orchestrateur).
- La confirmation que VS Code demande, ou non, avant une commande de terminal de l'agent (`node "<plugin>/engine/drivers/cli/skraft.mjs" next`).
- NFR-4 : `skraft next` et `skraft record` sous 300 ms chacun ; chacun exécute l'étape du moteur qui suit (git, gates), non mesuré hors tests.
- Comment l'orchestrateur connaît le dossier du plugin au premier appel : le descripteur le demande à la personne, puis reprend la ligne `then:` imprimée.
- Si le terminal de l'agent VS Code est un TTY et peut taper dans l'invite de confirmation de `skraft decide` : non mesuré. S'il le peut, la garde ne tient plus que par le descripteur.
- Les noms d'outils VS Code d'un agent : l'en-tête Copilot de l'orchestrateur ne fixe donc pas `tools:` ; à fixer une fois les noms mesurés.
- Le jeton de réponse : chaque brief de la boucle porte un jeton à usage unique que la réponse doit reprendre (`skraft-reply: <jeton>`). Il prouve que le brief a été lu, non quel agent l'a lu.

### Hooks à la demande

Aucun hook ajouté au lot 10. ADR-001 (décision 5) n'en admet un que s'il protège une action irréversible que le moteur ne peut pas détecter après coup, avec un coût mesuré et un comportement documenté sur les trois hôtes ; ADR-002 (décision 9) exclut tout hook pré-outil sous Copilot. Revue des candidats :

| Action | Détectée après coup | Hook |
| --- | --- | --- |
| Écriture hors périmètre par un agent | Oui : diff git de l'étape, étape refusée | Non |
| Journal ou état modifié à la main | Oui : chaîne de hachage, run arrêté | Non |
| Fichier de réponse de la boucle écrit par l'orchestrateur | Oui, en partie : une réponse illisible ou absente est redemandée, puis le run s'arrête | Non |
| `skraft decide` lancé par l'orchestrateur à la place de la personne (boucle VS Code) | Non | Non : garde dans le moteur à la place. En boucle, `next` n'imprime plus de commande `skraft decide` prête à lancer ; `skraft decide` en ligne de commande demande à la personne de confirmer la réponse à une invite interactive, refuse sans TTY, et journalise `by: 'cli-tty'` (le mod et l'outil Copilot gardent `by: 'decide'`). Garde au mieux : dans un terminal partagé, quiconque y tape répond. |
| `git push`, publication | Aucun agent du workflow ne pousse ; la publication passe par le moteur (lot 8) | Non |
