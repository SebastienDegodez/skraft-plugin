<!-- markdownlint-disable-file -->
# Vérification d'hôte Copilot — index d'évidence

Ce que le pilote Copilot suppose de l'hôte, mesuré par `eng/host-probe/copilot-probe.mjs` (hôte SDK headless, aucun appel de modèle) — [contrat du pilote Copilot](../site/fr/explanation/architecture.md#le-contrat-du-pilote-copilot), issue #251. Chaque passage de la sonde ajoute sa section en tête, avec les versions mesurées.

## Mesures

### En attente de mesure

Ce que le pilote suppose déjà sans mesure ; la prochaine passe de la sonde remplace chaque ligne par son verdict.

| Contrôle | Issue | Verdict | Supposé par |
| --- | --- | --- | --- |
| agent lancé : charge-t-il `AGENTS.md`, `CLAUDE.md` ou `.github/copilot-instructions.md` de la copie de travail (Copilot CLI) | — | not measured, aucun contrôle de sonde | rien : la revue d'une pull request (#240) n'en suppose rien ; si l'hôte les charge, ses lentilles lisent la version de l'auteur de la pull request à côté des copies de la base que leur brief désigne |
| agent lancé : même question sous Claude Code et sous VS Code | — | not measured, hors de cette sonde | idem |
| Claude Code (mod), session interactive (terminal et VS Code) : `$.mcp.call` sur un outil non accordé — dialogue de permission, rejet, ou appel sans demande | #422 | not measured, demande une personne dans une session interactive | `mod-mcp.mjs` (`mcp-refused` sur le texte de refus mesuré sous `-p`, Claude Code 2.1.291 et 2.1.314) |
| Claude Code (mod) : connecteur claude.ai GitHub — `$.tool.list` nomme-t-il ses outils `mcp__claude_ai_Github__*`, et `$.mcp.call('claude_ai_Github', …)` les appelle-t-il | #422 | not measured, demande la connexion claude.ai du propriétaire | `plugins/skraft-framework/engine/application/config/github-mcp.mjs` (`claude_ai_Github` parmi les serveurs de confiance) |
| Claude Code (mod) : une règle `permissions.allow` d'un `.claude/settings.json` accorde-t-elle un `$.mcp.call` dans une session interactive, dans un dossier approuvé | #422 | not measured, demande une session interactive ; sous `-p`, aucune forme de règle essayée n'accorde (voir la section #422) | la documentation à écrire pour autoriser le serveur GitHub dans Claude Code |
| panneau déjà ouvert : le rendu (app Copilot, VS Code, TUI) recharge-t-il la page quand open rend une autre url ? | #430 | not measured, demande une session interactive avec un rendu de canvas (la sonde est headless) | rien : le serveur pousse l'onglet dans le flux de la page ouverte |

### Sonde d'hôte Copilot — 2026-10-30 (branche feat/429-phases-relecture, phase non déclarée, #429)

Copilot CLI GitHub Copilot CLI 1.0.105. · SDK 1.0.105 · Node v22.17.1 · darwin 25.5.0. Aucun appel de modèle (`npm run probe:copilot -- --require workflow-undeclared-phase`, sans `--agent-calls` ni `--report-issues`), CLI connecté.

Question : dans un run, `ctx.phase` d'un titre que `meta.phases` ne déclare pas lève-t-il, ou l'hôte l'ignore-t-il ? Le pilote relaie chaque phase du moteur par `ctx.phase` (`ctx-progress.mjs`) ; un workflow éjecté (`.skraft/pipeline.skraft.dot`) peut nommer une phase que `SKRAFT_PIPELINE_META` ne déclare pas, et `defineWorkflow` fige `meta` à l'enregistrement, avant que le répertoire soit connu.

| Contrôle | Issue | Verdict | Observé |
| --- | --- | --- | --- |
| `workflow-undeclared-phase` | — | pass | run `completed`, `threw: false` ; `getRunDetail` liste `Probe` (`ordinal` 0, `entryCount` 1) puis `UNDECLARED` (`ordinal: null`, `status: completed`, `entryCount` 1) ; `declaredPhaseCount` 1 |
| `workflow-undeclared-phase`, mutation à la main : `UNDECLARED_PHASE = 'Probe'` (titre déclaré) | — | fail | seule `Probe` est listée : le contrôle ne passe que si la phase entrée est listée sans ordinal. Restauré, `pass` |

Lecture : `pass`. Copilot CLI 1.0.105 garde une phase que la meta ne déclare pas comme une phase à part, sans ordinal ; `ctx.phase` ne lève pas. Décision : le pilote garde le relais tel quel (branche KEEP), sans filtre ni `try`. « Déclarer les phases depuis le DOT » ne pourrait de toute façon épingler que celles du DOT du plugin (la meta est figée à l'enregistrement) ; un test épingle la liste déclarée sur les phases du DOT du plugin.

### Mod Claude Code : forme de `$.tool.list()` et permission de `$.mcp.call` — 2026-10-30 (branche test/422-mod-mcp-wiring, #422)

Mesuré par `node eng/host-probe/claude-mod-mcp-trial.mjs` (trois passes : outils accordés par `--allowedTools`, rien d'accordé, serveur accordé par `permissions.allow: ["mcp__skraft-probe-mcp"]` dans le `.claude/settings.json` du dossier de travail), sur darwin 25.5.0, Node v22.17.1, `claude -p` avec un modèle inexistant : aucun appel de modèle. Versions : 2.1.291 (`claude` du PATH, `~/.local/share/claude/versions/2.1.291`) et 2.1.314 (`node eng/host-probe/claude-mod-mcp-trial.mjs --claude ~/.vscode-insiders/extensions/anthropic.claude-code-2.1.314-darwin-arm64/resources/native-binary/claude`). Les deux versions donnent les mêmes résultats, passe par passe. Non écrits, en attente de la mesure interactive du propriétaire : la documentation qui dit comment autoriser le serveur GitHub dans Claude Code, et l'avertissement de `skraft doctor` ; aucune règle de `.claude/settings.json` ne s'est montrée efficace sous `-p`, il n'y a donc pas de forme à recommander.

| Hôte | Comportement | Verdict | Version | Preuve |
| --- | --- | --- | --- | --- |
| Claude Code (mod) | forme d'une entrée de `$.tool.list()` : un objet `{ description, mcp, name }`, `name` = `mcp__<serveur>__<outil>`, `mcp: true` pour un outil MCP ; 33 outils listés dont 4 `mcp: true` (les trois du serveur de la sonde et un quatrième non identifié) | oui | Claude Code 2.1.291 et 2.1.314 | essai, champ `tools` (`type: "object"`, `keys: ["description","mcp","name"]`) et `listed` (`count: 33`, `mcpCount: 4`) ; typage `ToolInfo` de 2.1.314 |
| Claude Code (mod) | appel sans permission accordée : `$.mcp.call` rejette `refused: Claude requested permissions to use mcp__skraft-probe-mcp__<outil>, but you haven't granted it yet.` ; le typage 2.1.314 (« No permission prompt ») est contredit sous `-p` | oui, sous `-p` | Claude Code 2.1.291 et 2.1.314 | passe sans `--allowedTools` : `echo`, `touch` et `fail` rejetés |
| Claude Code (mod) | appel accordé par `--allowedTools mcp__<serveur>__echo,mcp__<serveur>__fail` : résout `{ content: [{ type: 'text', text: 'echo:skraft-probe-sentinel' }], isError: false }` ; `touch`, non accordé, rejeté dans cette passe | oui, sous `-p` | Claude Code 2.1.291 et 2.1.314 | passe accordée |
| Claude Code (mod) | appel accordé par `permissions.allow: ["mcp__skraft-probe-mcp"]` dans `<dossier>/.claude/settings.json`, sans `--allowedTools` : rejeté comme sans accord (`echo`, `touch`, `fail`). Seule la forme de règle de serveur est mesurée : les formes outil et `__*` ne sont pas essayées par l'essai commité | non, sous `-p` | Claude Code 2.1.291 et 2.1.314 | passe `settings`. Cause non mesurée : dossier non approuvé sous `-p`, règle non lue au moment de l'appel du mod, ou forme de règle |
| Claude Code (mod) | erreur de l'outil : résout `{ content: [{ type: 'text', text: 'skraft-probe-tool-error' }], isError: true }` sans rejeter, quand l'outil est accordé | oui | Claude Code 2.1.291 et 2.1.314 | passe accordée, outil `fail` |
| Claude Code (mod) | outil absent, serveur mort ou absent : rejette `no connected MCP tool "<outil>" on a server named "<serveur>"`, les trois cas indistincts | oui | Claude Code 2.1.291 et 2.1.314 | `unknownTool`, `failingServer`, `absentServer`, identiques dans les trois passes |

### Sonde d'hôte Copilot — 2026-10-30 (branche feat/430-canvas-navigation-durcissement, panneau déjà ouvert, autre onglet)

Copilot CLI GitHub Copilot CLI 1.0.105. · SDK 1.0.105 · Node v22.17.1 · darwin 25.5.0. Aucun appel de modèle (`npm run probe:copilot`, sans `--agent-calls` ni `--report-issues`).

Question : rouvrir une instance de canvas déjà ouverte avec un autre `input` (`{ tab: 'configuration' }`) rappelle-t-il le `open` de l'extension avec ce nouvel `input` ? Le canvas `skraft-pipeline` en dépend (#430) : il pousse alors l'onglet à la page déjà ouverte par son flux.

| Contrôle | Issue | Verdict | Observé |
| --- | --- | --- | --- |
| `canvas-reopen-other-tab` | — | pass | `open` entendu deux fois (`input` `{}` puis `{ tab: 'configuration' }`) ; l'hôte rend et garde (`listOpen`) l'url `…/?t=skraft-probe-token&tab=configuration`, et émet un `session.canvas.opened` pour chaque ouverture, le second avec cette url et `input: { tab: 'configuration' }` |

Lecture : `pass`, et l'url rendue, gardée et portée par `session.canvas.opened` porte `&tab=`. L'hôte donne donc aux rendus la nouvelle url ; qu'un rendu recharge un panneau déjà monté reste non mesuré (la sonde est headless). La trame `focus` poussée par le serveur déplace la page dans les deux cas. Les contrôles `unknown-arg-ignored`, `decide-without-confirm` et `decide-after-cd` restent `fail` comme avant : ce sont les prémisses des issues #249, #244 et #245 que le pilote corrigé ne montre plus ; aucun autre contrôle n'a changé de verdict.

### Serveurs MCP depuis le pilote, par hôte — 2026-10-30 (branche chore/400-mcp-from-driver, #400)

Question : le code du pilote d'un hôte peut-il lister les serveurs MCP que le développeur a configurés, appeler un de leurs outils et en lire le résultat, sans passer par le modèle ? Mesuré sur darwin 25.5.0, Node v22.17.1, avec le serveur MCP stdio sans dépendance de la sonde (`echo` et `fail` en `readOnlyHint`, `touch` sans ; `fail` répond `isError: true`), un serveur dont le processus meurt avant la poignée de main, et un nom de serveur jamais configuré. Aucun appel de modèle.

- Copilot CLI : contrôles de `eng/host-probe/copilot-probe.mjs` (section de sonde ci-dessous).
- Claude Code : essai rejouable `node eng/host-probe/claude-mod-mcp-trial.mjs` (un essai, pas un contrôle à verdict) : `claude -p` avec `--plugin-dir` sur un mod jetable dont le hook `prompt.submit` appelle `$.mcp.call`, écrit ce qu'il reçoit et rend `{ drop }` (aucun tour ne démarre ; le modèle nommé n'existe pas), le serveur de la sonde par `--mcp-config --strict-mcp-config` ; une passe avec `--allowedTools` sur `echo` et `fail`, une sans rien accorder.

| Hôte | Comportement | Verdict | Version | Preuve |
| --- | --- | --- | --- | --- |
| Copilot CLI (extension, run de workflow) | lister les serveurs et leur statut : `session.rpc.mcp.list()` ; leurs outils : `session.rpc.mcp.listTools({ serverName })` | oui | CLI 1.0.102-1, SDK 1.0.102-1 | `mcp-tool-from-workflow` ; typages `copilot-sdk/generated/rpc.d.ts` l. 35735-35755 (`mcp.list`, `mcp.listTools`, `@experimental`), `extension.d.ts` l. 59 (`joinSession` rend une `CopilotSession`, `session.d.ts` l. 98 `rpc`) |
| Copilot CLI | appeler un outil et lire son résultat : `session.rpc.tools.execute({ name: '<serveur>-<outil>', arguments })` rend `{ resultType, textResultForLlm, contents }` | oui | CLI 1.0.102-1 | `mcp-tool-from-workflow` (`echo:skraft-probe-sentinel` lu dans le run) ; `rpc.d.ts` l. 36306 (`tools.execute`, « currently offered tool set ») |
| Copilot CLI | permission : un outil sans `readOnlyHint` passe par `onPermissionRequest` de l'hôte (`kind: 'mcp'`, `toolName: '<serveur>-<outil>'`), une fois par appel ; refusé, `resultType: 'rejected'` sans lever ; un outil `readOnlyHint` ne demande rien | oui | CLI 1.0.102-1 | `mcp-permission-from-workflow`. Dans une session interactive, la demande arrive à la personne : non mesuré |
| Copilot CLI | serveur absent, mort ou outil absent : `listTools` lève `MCP server "<nom>" is not connected` ; un serveur dont le processus meurt est listé `failed` avec son `error` ; `tools.execute` d'un outil absent rend `resultType: 'failure'` (`Tool '<nom>' does not exist.`) sans lever | oui | CLI 1.0.102-1 | `mcp-unavailable-from-workflow` ; statuts `copilot-sdk/generated/session-events.d.ts` l. 1568. `needs-auth`, `disabled`, `stopped`, `pending` : non mesurés (aucun serveur distant OAuth, aucun serveur désactivé) ; `denied` et `timeout` de `resultType` : non mesurés |
| Copilot CLI | erreur de l'outil (`isError: true`) : `resultType: 'failure'`, texte `MCP server '<serveur>': <texte de l'outil>` | oui | CLI 1.0.102-1 | `mcp-tool-error-from-workflow` |
| Copilot CLI | `session.rpc.mcp.apps.callTool` | non | CLI 1.0.102-1 | essai manuel, non rejouable : « The "mcp-apps" capability is not available in this session » ; `rpc.d.ts` l. 35933 (réservé à une vue MCP App). Non retenu |
| Copilot CLI | un serveur du développeur dans `~/.copilot/mcp-config.json` listé dans la session SDK headless | non mesuré | CLI 1.0.102-1 | la sonde liste un `github-mcp-server` connecté à 0 outil, et cette machine en configure un de ce nom dans `~/.copilot/mcp-config.json` ; mais le serveur intégré porte le même nom : rien ne dit lequel est listé. À mesurer avec un serveur de nom unique dans une configuration isolée |
| Copilot CLI | un serveur du `.mcp.json` du dossier de travail | non mesuré | CLI 1.0.102-1 | essai manuel, non rejouable, dans un dossier temporaire non git, non approuvé : non chargé. Dans un dépôt approuvé : non mesuré |
| Copilot CLI | serveur GitHub intégré (`github-mcp-server`) visible de l'extension, avec ses outils | non mesuré | CLI 1.0.102-1 | `github-mcp-in-session` non concluant (connecté, 0 outil). Lu dans `cli-main.js`, non mesuré : le CLI l'ajoute à son démarrage quand il est connecté (`mcp.configureGitHub({ authInfo })`), et un `github-mcp-server` configuré par le développeur le remplace. À mesurer dans une session CLI interactive connectée |
| Claude Code (mod) | appeler un outil et lire son résultat : `$.mcp.call(server, tool, args)` rend `{ content, isError }` | oui, avec une permission accordée | Claude Code 2.1.291 | `claude-mod-mcp-trial.mjs`, passe accordée : `echo:skraft-probe-sentinel`, `isError: false`. Typage : `claude-code.d.ts` 2.1.310 l. 2750-2788 (`$.mcp.call`, `$.mcp.connect`) |
| Claude Code (mod) | erreur de l'outil : `$.mcp.call` résout `{ content, isError: true }` sans rejeter | oui | Claude Code 2.1.291 | même essai, outil `fail` accordé : `isError: true`, texte `skraft-probe-tool-error` |
| Claude Code (mod) | permission : sans permission accordée, `$.mcp.call` rejette `refused: Claude requested permissions to use mcp__<serveur>__<outil>, but you haven't granted it yet.`, `readOnlyHint` ou non ; `touch`, non accordé, est refusé dans les deux passes | mesuré sous `-p` | Claude Code 2.1.291 | même essai, passe sans `--allowedTools`. Le typage 2.1.310 dit « No permission prompt » : contredit par la mesure 2.1.291 ; 2.1.310 et la session interactive (dialogue de permission) : non mesurés. 2.1.314 sous `-p` : même refus, voir la section #422 ci-dessus |
| Claude Code (mod) | lister : `$.tool.list()` rend les outils `mcp__<serveur>__<outil>` ; l'API n'expose ni la liste des serveurs ni leur statut | oui (outils seulement) | Claude Code 2.1.291 | même essai ; `claude-code.d.ts` 2.1.310 l. 3097. Forme des entrées (`{ description, mcp, name }`) mesurée sur 2.1.291 et 2.1.314 : voir la section #422 ci-dessus |
| Claude Code (mod) | serveur absent, mort ou outil absent : `$.mcp.call` rejette `no connected MCP tool "<outil>" on a server named "<serveur>"`, les trois cas indistincts | oui | Claude Code 2.1.291 | même essai. `$.mcp.connect` ne vaut que pour un serveur du manifeste du plugin (`McpConnectRefusal`, l. 6071) |
| VS Code, pilote SDK (`skraft-run.mjs`) | le moteur tourne dans l'extension d'une session Copilot CLI headless : même API que Copilot CLI | non mesuré (déduit) | CLI 1.0.102-1 | `skraft-run.mjs` n'a pas tourné. Déduit : il ouvre la session par le même `createSession` (`pluginDirectories`, `requestExtensions`) que la sonde (`drivers/copilot-sdk/sdk-pipeline-run.mjs` l. 92-98), sans `mcpServers` : il ne verrait que les serveurs de la configuration de Copilot CLI. Les serveurs configurés dans VS Code : le CLI 1.0.102-1 ne lit plus `.vscode/mcp.json` (« support for .vscode/mcp.json has been removed », `cli-main.js`), non mesuré sous VS Code |
| VS Code, boucle d'agent (`skraft next`) | le moteur tourne dans `node skraft.mjs`, sans session d'hôte : il ne voit aucun serveur MCP de VS Code | non | — | par construction : `drivers/cli/skraft.mjs` câble `createNodeAdapters` dans un processus Node ; seuls les agents de VS Code (le modèle) atteignent ses serveurs MCP |
| tout hôte | serveur Azure DevOps (`@azure-devops/mcp`) | non mesuré | — | aucune organisation Azure DevOps de test. Reste à mesurer : noms d'outils (work item, PR, commentaire), authentification (`az login` ou PAT) au démarrage du serveur, statut quand elle manque, sous Copilot CLI et Claude Code |
| tout hôte | serveur MCP GitHub, outils de lecture d'issue et de commentaire | non mesuré | — | demande un serveur GitHub connecté avec ses outils ; non disponible sur cette machine en session headless (voir ci-dessus) |
| tout hôte | forme des réponses du serveur GitHub que le moteur lit (#401) : `html_url` d'une issue, d'une PR et d'un commentaire ; `url` rendu par `create_pull_request`, `update_pull_request`, `add_issue_comment` et `update_issue_comment` ; `merged_at` d'une PR fusionnée listée (absent d'une PR fermée) ; commentaires en tableau (`issue_read` `get_comments`) ; `login` de `get_me` | non mesuré (lu dans github-mcp-server v2.0.3) | — | `pkg/github/minimal_types.go`, `issues.go`, `pullrequests.go` de v2.0.3. Le moteur refuse toute URL hors `https://github.com/<owner>/<repo>/…` du dépôt en cours et repasse par `gh` sur une réponse qu'il ne sait pas lire ; une PR fermée sans `merged_at` est laissée à `gh` |

### Sonde d'hôte Copilot — 2026-10-30 (branche chore/400-mcp-from-driver, serveurs MCP depuis l'extension)

Copilot CLI GitHub Copilot CLI 1.0.102-1. · SDK 1.0.102-1 · Node v22.17.1 · darwin 25.5.0. Aucun appel de modèle.

| Contrôle | Issue | Verdict | Observé |
| --- | --- | --- | --- |
| `extension-loads-agent-plugins` | — | pass | {"toolOffered":true,"extensions":[{"name":"microcks-canvas","status":"running"},{"name":"skraft-probe-agent:skraft-probe-a","status":"running"},{"name":"skraft-probe-legacy:skraft-probe-l","status":"running"}]} |
| `extension-loads-claude-plugin` | — | pass | {"toolOffered":true} |
| `cwd-after-cd` | #245 | pass | {"atLoad":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-OcVTbC/repo-a","processCwdAfter":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-OcVTbC/repo-a","trackedAfter":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe |
| `snapshot-working-directory` | — | pass | {"atLoad":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-OcVTbC/repo-a","afterCd":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-OcVTbC/repo-b","repoA":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-OcVTbC/repo-a" |
| `confirm-from-tool` | #244 | pass | {"elicitationCapability":true,"mode":"interactive","modeError":null,"accepted":{"value":true},"declined":{"value":false},"hostAsked":2} |
| `confirm-in-autopilot` | #244 | inconclusive | {"result":null,"hostAsked":0} |
| `confirm-from-workflow` | #244 | pass | {"status":"completed","result":{"hasSession":true,"elicitation":true,"value":true},"error":null} |
| `confirm-joined-session-from-workflow` | — | pass | {"status":"completed","result":{"elicitation":true,"mode":"interactive","value":true},"error":null} |
| `select-joined-session-from-workflow` | — | pass | {"accepted":{"elicitation":true,"value":"RATIFIED"},"declined":{"elicitation":true,"value":null},"requests":[{"fields":["selection"],"options":["RATIFIED","REJECTED"]},{"fields":["selection"],"options":["RATIFIED","REJECTED"]}]} |
| `input-joined-session-from-workflow` | — | pass | {"accepted":{"elicitation":true,"value":"skraft probe instruction"},"declined":{"elicitation":true,"value":null},"requests":[{"fields":["value"],"options":null},{"fields":["value"],"options":null}]} |
| `throwing-workflow` | #247 | pass | {"status":"error","hasResult":false,"error":"Request workflow.execute failed with message: skraft-probe-sentinel","failure":null} |
| `copilot-model-refusal` | — | inconclusive | {"reason":"needs --agent-calls: each of these checks starts one agent, which may spend AI credits"} |
| `copilot-effort-refusal` | — | inconclusive | {"reason":"needs --agent-calls: each of these checks starts one agent, which may spend AI credits"} |
| `broken-workflow-isolation` | #246 | pass | {"toolOffered":false} |
| `bad-tool-name-isolation` | #246 | pass | {"status":"rpc-error","error":"No workflow registered with name \"skraft-probe-iso\""} |
| `canvas-accepted-at-join` | — | pass | {"toolOffered":true,"canvasListed":true,"error":null,"createCanvas":true} |
| `canvas-open-headless` | — | pass | {"error":null,"url":"http://127.0.0.1:64922/?t=skraft-probe-token","queryKept":true,"sameUrlAgain":true,"page":200,"openCalls":2,"hostCanvases":null,"sessionWorkingDirectory":"/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-OcVTbC/repo-a","title":"skraft probe canvas"} |
| `canvas-action-invoke` | — | pass | {"error":null,"result":{"result":{"ok":true,"opened":2}}} |
| `confirm-from-canvas` | — | pass | {"answer":{"value":true,"error":null},"hostAsked":1} |
| `canvas-close` | — | pass | {"closed":["skraft-probe-instance"]} |
| `canvas-open-from-extension` | — | pass | {"answer":{"result":{"instanceId":"skraft-probe-self","extensionId":"plugin:skraft-probe-canvas:skraft-probe-canvas","extensionName":"skraft-probe-canvas:skraft-probe-canvas","canvasId":"skraft-probe-canvas","title":"skraft probe canvas","status":"open","url":"http://127.0.0.1:64924/?t=skraft-probe- |
| `canvas-agent-tools` | — | pass | {"without":[],"withRenderer":["invoke_canvas_action","list_canvas_capabilities","open_canvas"]} |
| `mcp-tool-from-workflow` | #400 | pass | {"servers":[{"name":"github-mcp-server","status":"connected"},{"name":"skraft-probe-mcp","status":"connected"},{"name":"skraft-probe-mcp-failing","status":"failed","error":"MCP server process exited before completing the MCP initialize handshake (exit code 3)"}],"tools":["echo","touch","fail"],"echo |
| `mcp-permission-from-workflow` | #400 | pass | {"approvedAsked":["skraft-probe-mcp-touch"],"approved":{"type":"success","text":"touched"},"rejectedAsked":["skraft-probe-mcp-touch"],"rejected":{"type":"rejected","text":"The user rejected this tool call."}} |
| `mcp-unavailable-from-workflow` | #400 | pass | {"absentServer":{"error":"Request session.mcp.listTools failed with message: MCP server \"skraft-probe-mcp-absent\" is not connected"},"failing":{"name":"skraft-probe-mcp-failing","status":"failed","error":"MCP server process exited before completing the MCP initialize handshake (exit code 3)"},"abs |
| `mcp-tool-error-from-workflow` | #400 | pass | {"fail":{"type":"failure","text":"MCP server 'skraft-probe-mcp': skraft-probe-tool-error"}} |
| `github-mcp-in-session` | #400 | inconclusive | {"listed":true,"status":"connected","github":{"tools":0}} |
| `skraft-extension-loaded` | — | pass | {"skraftDecideOffered":true} |
| `skraft-workflow-registered` | — | pass | {"status":"completed","result":{"status":"refused","slug":null,"phase":null,"code":"invalid-slug","reason":"slug must be kebab-case: lowercase letters and digits, joined by single hyphens"},"error":null} |
| `unknown-arg-ignored` | #249 | fail | {"status":"completed","result":{"status":"refused","slug":null,"phase":null,"code":"invalid-args","reason":"the workflow takes only slug, issue, title, base, fromArtifacts, configure (true or false) and agentIds; nothing was started"},"error":null} |
| `decide-without-confirm` | #244 | fail | {"toolResult":"Refused: you did not answer the question in Copilot; answer it with skraft decide adr-0 RATIFIED\|REJECTED typed in a terminal; nothing was recorded.","answeredBy":[],"hostAsked":1} |
| `skraft-canvas-registered` | — | pass | {"declared":true,"error":null} |
| `skraft-canvas-opens` | — | pass | {"error":null,"title":"skraft probe-question","status":"waiting","loopback":true,"tokenInUrl":true,"page":200,"pageWithoutToken":403,"csp":"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'","question":"adr-0","contentStatus":"waiting"} |
| `skraft-canvas-read-only` | — | pass | {"posted":{"status":404,"body":{"error":"nothing here"}},"answeredBy":[],"hostAsked":0} |
| `skraft-decide-one-question` | — | pass | {"toolResult":"Recorded: probe-question: adr-0 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).","requests":[{"fields":["selection"],"options":["RATIFIED","REJECTED"]}],"answered":[["RATIFIED","host-confirmed"]]} |
| `decide-after-cd` | #245 | fail | {"toolResult":"Recorded: probe-question: adr-0 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).","answeredInSecondRepo":true} |
| `session-agents` | — | pass | {"agentFiles":19,"missing":[],"sample":[{"id":"skraft:finding-refuter","name":"skraft:finding-refuter"},{"id":"skraft:business-alignment-lens","name":"skraft:business-alignment-lens"},{"id":"skraft:fitness-lens","name":"skraft:fitness-lens"},{"id":"skraft:solution-researcher","name":"skraft:solution |
| `copilot-models-available` | — | inconclusive | {"configured":[]} |
| `skraft-tool-names-free` | — | pass | {"native":["bash","create","dynamic_workflows_manage","edit","extensions_manage","extensions_reload","glob","grep","list_agents","list_bash","read_agent","read_bash","run_dynamic_workflow","semantic_code_search","skill","sql","stop_bash","task","view","web_fetch","write_agent"],"skraft":["skraft_dec |

### Sonde d'hôte Copilot — 2026-10-29 (branche feat/355-configuration-canvas, onglet Configuration)

Copilot CLI GitHub Copilot CLI 1.0.102-1. · SDK 1.0.102-1 · Node v22.17.1 · darwin 25.5.0. Aucun appel de modèle.

| Contrôle | Issue | Verdict | Observé |
| --- | --- | --- | --- |
| `extension-loads-agent-plugins` | — | pass | {"toolOffered":true,"extensions":[{"name":"microcks-canvas","status":"running"},{"name":"skraft-probe-agent:skraft-probe-a","status":"running"},{"name":"skraft-probe-legacy:skraft-probe-l","status":"running"}]} |
| `extension-loads-claude-plugin` | — | pass | {"toolOffered":true} |
| `cwd-after-cd` | #245 | pass | {"atLoad":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-X2UL5f/repo-a","processCwdAfter":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-X2UL5f/repo-a","trackedAfter":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe |
| `snapshot-working-directory` | — | pass | {"atLoad":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-X2UL5f/repo-a","afterCd":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-X2UL5f/repo-b","repoA":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-X2UL5f/repo-a" |
| `confirm-from-tool` | #244 | pass | {"elicitationCapability":true,"mode":"interactive","modeError":null,"accepted":{"value":true},"declined":{"value":false},"hostAsked":2} |
| `confirm-in-autopilot` | #244 | inconclusive | {"result":null,"hostAsked":0} |
| `confirm-from-workflow` | #244 | pass | {"status":"completed","result":{"hasSession":true,"elicitation":true,"value":true},"error":null} |
| `confirm-joined-session-from-workflow` | — | pass | {"status":"completed","result":{"elicitation":true,"mode":"interactive","value":true},"error":null} |
| `select-joined-session-from-workflow` | — | pass | {"accepted":{"elicitation":true,"value":"RATIFIED"},"declined":{"elicitation":true,"value":null},"requests":[{"fields":["selection"],"options":["RATIFIED","REJECTED"]},{"fields":["selection"],"options":["RATIFIED","REJECTED"]}]} |
| `input-joined-session-from-workflow` | — | pass | {"accepted":{"elicitation":true,"value":"skraft probe instruction"},"declined":{"elicitation":true,"value":null},"requests":[{"fields":["value"],"options":null},{"fields":["value"],"options":null}]} |
| `throwing-workflow` | #247 | pass | {"status":"error","hasResult":false,"error":"Request workflow.execute failed with message: skraft-probe-sentinel","failure":null} |
| `copilot-model-refusal` | — | inconclusive | {"reason":"needs --agent-calls: each of these checks starts one agent, which may spend AI credits"} |
| `copilot-effort-refusal` | — | inconclusive | {"reason":"needs --agent-calls: each of these checks starts one agent, which may spend AI credits"} |
| `broken-workflow-isolation` | #246 | pass | {"toolOffered":false} |
| `bad-tool-name-isolation` | #246 | pass | {"status":"rpc-error","error":"No workflow registered with name \"skraft-probe-iso\""} |
| `canvas-accepted-at-join` | — | pass | {"toolOffered":true,"canvasListed":true,"error":null,"createCanvas":true} |
| `canvas-open-headless` | — | pass | {"error":null,"url":"http://127.0.0.1:60185/?t=skraft-probe-token","queryKept":true,"sameUrlAgain":true,"page":200,"openCalls":2,"hostCanvases":null,"sessionWorkingDirectory":"/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-X2UL5f/repo-a","title":"skraft probe canvas"} |
| `canvas-action-invoke` | — | pass | {"error":null,"result":{"result":{"ok":true,"opened":2}}} |
| `confirm-from-canvas` | — | pass | {"answer":{"value":true,"error":null},"hostAsked":1} |
| `canvas-close` | — | pass | {"closed":["skraft-probe-instance"]} |
| `canvas-open-from-extension` | — | pass | {"answer":{"result":{"instanceId":"skraft-probe-self","extensionId":"plugin:skraft-probe-canvas:skraft-probe-canvas","extensionName":"skraft-probe-canvas:skraft-probe-canvas","canvasId":"skraft-probe-canvas","title":"skraft probe canvas","status":"open","url":"http://127.0.0.1:60187/?t=skraft-probe- |
| `canvas-agent-tools` | — | pass | {"without":[],"withRenderer":["invoke_canvas_action","list_canvas_capabilities","open_canvas"]} |
| `skraft-extension-loaded` | — | pass | {"skraftDecideOffered":true} |
| `skraft-workflow-registered` | — | pass | {"status":"completed","result":{"status":"refused","slug":null,"phase":null,"code":"invalid-slug","reason":"slug must be kebab-case: lowercase letters and digits, joined by single hyphens"},"error":null} |
| `unknown-arg-ignored` | #249 | fail | {"status":"completed","result":{"status":"refused","slug":null,"phase":null,"code":"invalid-args","reason":"the workflow takes only slug, issue, title, base, fromArtifacts, configure (true or false) and agentIds; nothing was started"},"error":null} |
| `decide-without-confirm` | #244 | fail | {"toolResult":"Refused: you did not answer the question in Copilot; answer it with skraft decide adr-0 RATIFIED\|REJECTED typed in a terminal; nothing was recorded.","answeredBy":[],"hostAsked":1} |
| `skraft-canvas-registered` | — | pass | {"declared":true,"error":null} |
| `skraft-canvas-opens` | — | pass | {"error":null,"title":"skraft probe-question","status":"waiting","loopback":true,"tokenInUrl":true,"page":200,"pageWithoutToken":403,"csp":"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'","question":"adr-0","contentStatus":"waiting"} |
| `skraft-canvas-read-only` | — | pass | {"posted":{"status":404,"body":{"error":"nothing here"}},"answeredBy":[],"hostAsked":0} |
| `skraft-decide-one-question` | — | pass | {"toolResult":"Recorded: probe-question: adr-0 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).","requests":[{"fields":["selection"],"options":["RATIFIED","REJECTED"]}],"answered":[["RATIFIED","host-confirmed"]]} |
| `decide-after-cd` | #245 | fail | {"toolResult":"Recorded: probe-question: adr-0 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).","answeredInSecondRepo":true} |
| `session-agents` | — | pass | {"agentFiles":19,"missing":[],"sample":[{"id":"skraft:finding-refuter","name":"skraft:finding-refuter"},{"id":"skraft:business-alignment-lens","name":"skraft:business-alignment-lens"},{"id":"skraft:fitness-lens","name":"skraft:fitness-lens"},{"id":"skraft:solution-researcher","name":"skraft:solution |
| `copilot-models-available` | — | inconclusive | {"configured":[]} |
| `skraft-tool-names-free` | — | pass | {"native":["bash","create","dynamic_workflows_manage","edit","extensions_manage","extensions_reload","glob","grep","list_agents","list_bash","read_agent","read_bash","run_dynamic_workflow","semantic_code_search","skill","sql","stop_bash","task","view","web_fetch","write_agent"],"skraft":["skraft_dec |

Mesuré sur la CLI 1.0.102-1, darwin, connecté. Depuis un appel d'outil, la session jointe d'une extension ouvre son propre canvas par `session.rpc.canvas.open` : l'hôte appelle le `open` de l'extension pour l'instance donnée avec l'`input` donné et rend l'instance ouverte (`canvas-open-from-extension`). Le run `skraft-pipeline` ouvre ainsi le canvas skraft sur l'onglet Configuration avant de demander s'il démarre ; un échec de cette ouverture laisse la question dans le chat, qui nomme l'onglet. L'hôte valide l'`input` de `open` contre l'`inputSchema` du canvas : la première passe, avant que le canvas de la sonde déclare `tab`, a échoué sur `Additional properties are not allowed ('tab' was unexpected)` ; le canvas skraft déclare donc `tab` (`run`, `configuration`, `workflow`) dans son schéma.

Non mesuré : que l'app GitHub Copilot et VS Code montrent le panneau ouvert ainsi depuis un run de workflow (la sonde est un hôte headless : elle voit l'appel du `open`, pas un panneau à l'écran).

### Sonde d'hôte Copilot — 2026-10-29 (branche fix/copilot-questions-chat-only, une question = une élicitation)

Copilot CLI GitHub Copilot CLI 1.0.102-1. · SDK 1.0.102-1 · Node v22.17.1 · darwin 25.5.0. Aucun appel de modèle.

| Contrôle | Issue | Verdict | Observé |
| --- | --- | --- | --- |
| `extension-loads-agent-plugins` | — | pass | {"toolOffered":true,"extensions":[{"name":"microcks-canvas","status":"running"},{"name":"skraft-probe-agent:skraft-probe-a","status":"running"},{"name":"skraft-probe-legacy:skraft-probe-l","status":"running"}]} |
| `extension-loads-claude-plugin` | — | pass | {"toolOffered":true} |
| `cwd-after-cd` | #245 | pass | {"atLoad":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-qcabmb/repo-a","processCwdAfter":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-qcabmb/repo-a","trackedAfter":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe |
| `snapshot-working-directory` | — | pass | {"atLoad":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-qcabmb/repo-a","afterCd":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-qcabmb/repo-b","repoA":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-qcabmb/repo-a" |
| `confirm-from-tool` | #244 | pass | {"elicitationCapability":true,"mode":"interactive","modeError":null,"accepted":{"value":true},"declined":{"value":false},"hostAsked":2} |
| `confirm-in-autopilot` | #244 | inconclusive | {"result":null,"hostAsked":0} |
| `confirm-from-workflow` | #244 | pass | {"status":"completed","result":{"hasSession":true,"elicitation":true,"value":true},"error":null} |
| `confirm-joined-session-from-workflow` | — | pass | {"status":"completed","result":{"elicitation":true,"mode":"interactive","value":true},"error":null} |
| `select-joined-session-from-workflow` | — | pass | {"accepted":{"elicitation":true,"value":"RATIFIED"},"declined":{"elicitation":true,"value":null},"requests":[{"fields":["selection"],"options":["RATIFIED","REJECTED"]},{"fields":["selection"],"options":["RATIFIED","REJECTED"]}]} |
| `input-joined-session-from-workflow` | — | pass | {"accepted":{"elicitation":true,"value":"skraft probe instruction"},"declined":{"elicitation":true,"value":null},"requests":[{"fields":["value"],"options":null},{"fields":["value"],"options":null}]} |
| `throwing-workflow` | #247 | pass | {"status":"error","hasResult":false,"error":"Request workflow.execute failed with message: skraft-probe-sentinel","failure":null} |
| `copilot-model-refusal` | — | inconclusive | {"reason":"needs --agent-calls: each of these checks starts one agent, which may spend AI credits"} |
| `copilot-effort-refusal` | — | inconclusive | {"reason":"needs --agent-calls: each of these checks starts one agent, which may spend AI credits"} |
| `broken-workflow-isolation` | #246 | pass | {"toolOffered":false} |
| `bad-tool-name-isolation` | #246 | pass | {"status":"rpc-error","error":"No workflow registered with name \"skraft-probe-iso\""} |
| `canvas-accepted-at-join` | — | pass | {"toolOffered":true,"canvasListed":true,"error":null,"createCanvas":true} |
| `canvas-open-headless` | — | pass | {"error":null,"url":"http://127.0.0.1:64364/?t=skraft-probe-token","queryKept":true,"sameUrlAgain":true,"page":200,"openCalls":2,"hostCanvases":null,"sessionWorkingDirectory":"/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-qcabmb/repo-a","title":"skraft probe canvas"} |
| `canvas-action-invoke` | — | pass | {"error":null,"result":{"result":{"ok":true,"opened":2}}} |
| `confirm-from-canvas` | — | pass | {"answer":{"value":true,"error":null},"hostAsked":1} |
| `canvas-close` | — | pass | {"closed":["skraft-probe-instance"]} |
| `canvas-agent-tools` | — | pass | {"without":[],"withRenderer":["invoke_canvas_action","list_canvas_capabilities","open_canvas"]} |
| `skraft-extension-loaded` | — | pass | {"skraftDecideOffered":true} |
| `skraft-workflow-registered` | — | pass | {"status":"completed","result":{"status":"refused","slug":null,"phase":null,"code":"invalid-slug","reason":"slug must be kebab-case: lowercase letters and digits, joined by single hyphens"},"error":null} |
| `unknown-arg-ignored` | #249 | fail | {"status":"completed","result":{"status":"refused","slug":null,"phase":null,"code":"invalid-args","reason":"the workflow takes only slug, issue, title, base, fromArtifacts and agentIds; nothing was started"},"error":null} |
| `decide-without-confirm` | #244 | fail | {"toolResult":"Refused: you did not answer the question in Copilot; answer it with skraft decide adr-0 RATIFIED\|REJECTED typed in a terminal; nothing was recorded.","answeredBy":[],"hostAsked":1} |
| `skraft-canvas-registered` | — | pass | {"declared":true,"error":null} |
| `skraft-canvas-opens` | — | pass | {"error":null,"title":"skraft probe-question","status":"waiting","loopback":true,"tokenInUrl":true,"page":200,"pageWithoutToken":403,"csp":"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'","question":"adr-0","contentStatus":"waiting"} |
| `skraft-canvas-read-only` | — | pass | {"posted":{"status":404,"body":{"error":"nothing here"}},"answeredBy":[],"hostAsked":0} |
| `skraft-decide-one-question` | — | pass | {"toolResult":"Recorded: probe-question: adr-0 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).","requests":[{"fields":["selection"],"options":["RATIFIED","REJECTED"]}],"answered":[["RATIFIED","host-confirmed"]]} |
| `decide-after-cd` | #245 | fail | {"toolResult":"Recorded: probe-question: adr-0 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).","answeredInSecondRepo":true} |
| `session-agents` | — | pass | {"agentFiles":19,"missing":[],"sample":[{"id":"skraft:finding-refuter","name":"skraft:finding-refuter"},{"id":"skraft:business-alignment-lens","name":"skraft:business-alignment-lens"},{"id":"skraft:fitness-lens","name":"skraft:fitness-lens"},{"id":"skraft:solution-researcher","name":"skraft:solution |
| `copilot-models-available` | — | inconclusive | {"configured":[]} |
| `skraft-tool-names-free` | — | pass | {"native":["bash","create","dynamic_workflows_manage","edit","extensions_manage","extensions_reload","glob","grep","list_agents","list_bash","read_agent","read_bash","run_dynamic_workflow","semantic_code_search","skill","sql","stop_bash","task","view","web_fetch","write_agent"],"skraft":["skraft_dec |

Mesuré sur la CLI 1.0.102-1, darwin, connecté. Dans un run de workflow, le `session.ui.select` de la session jointe atteint le handler d'élicitation de l'hôte avec les options en `enum` du champ `selection` et rend l'option choisie, `null` quand il refuse (`select-joined-session-from-workflow`) ; son `session.ui.input` y arrive comme un champ texte `value` et rend le texte saisi, `null` quand il refuse (`input-joined-session-from-workflow`). Le run `skraft-pipeline` pose donc chaque question pendant le run, une seule fois : un choix parmi les options, ou un champ texte pour l'instruction d'une étape bloquée et la raison d'un refus ; la valeur rendue est la réponse, sans `confirm` après elle. `skraft_decide`, sans argument, pose la question qu'attend le pipeline actif en une seule élicitation à options et journalise l'option choisie `host-confirmed` (`skraft-decide-one-question`). Le canvas ne prend plus de réponse : un POST `/answer` avec le jeton et l'Origin de la page répond 404, rien n'est demandé à l'hôte ni journalisé (`skraft-canvas-read-only`, qui remplace `skraft-canvas-answer`). `decide-without-confirm` et `decide-after-cd` restent en échec : leur prémisse (#244, #245) ne tient pas.

Non mesuré : que l'app GitHub Copilot (2.0.0-alpha.14) et VS Code affichent dans le chat une élicitation demandée par un run de workflow, hors d'un appel d'outil (la mesure #302 de VS Code ne couvre qu'une action du canvas et un appel d'outil). Si l'hôte ne la montre pas, le run dit `not-asked`, se met en pause et renvoie la personne au chat, où `skraft_decide` pose la question dans un tour de chat, ou à `skraft decide` dans un terminal.

### Canvas `skraft-pipeline` : modèle de menace et cadre

- **Le canvas ne prend aucune réponse** (depuis le 2026-10-29). Sa page n'a ni bouton ni route de réponse, et les actions offertes au modèle (`get_pipeline`, `get_configuration`) sont en lecture seule : chaque question se pose dans le chat, par l'élicitation de l'hôte (règle « A human decision needs the host » d'`AGENTS.md`). « Démarrer avec cette configuration ? » aussi : l'onglet Configuration la montre, la réponse START ou STOP vient du chat et se journalise `host-confirmed`.
- **L'onglet Configuration écrit la configuration, et rien d'autre** (#355). Sa seule route d'écriture, `POST /configuration`, exige le jeton du panneau dans l'en-tête `X-Skraft-Token` (comparé en temps constant ; un formulaire d'un autre site ne pose pas d'en-tête), aucune autre `Origin` que celle du panneau, `Content-Type: application/json` et un corps de 64 Kio au plus. Le moteur vérifie la modification avec les règles du chargement de la configuration et n'écrit rien quand un fichier serait invalide. Aucune action du modèle n'écrit la configuration : un argument écrit par un modèle ne choisit jamais un modèle ni une commande.
- **Le jeton tient à l'écart les autres lecteurs.** Chaque panneau a un jeton aléatoire qui ne voyage que dans l'url que `open` rend à l'hôte (`http://127.0.0.1:<port>/?t=<jeton>`) ; la page et le flux l'exigent, comparé par empreinte SHA-256 en temps constant, et le HTML ne le porte pas. Un autre processus local ou une page de navigateur ne lit donc pas la vue du run. Le Host doit être l'adresse loopback liée (pas de rebinding DNS), le serveur n'écoute que sur 127.0.0.1, et `Referrer-Policy: no-referrer` garde le jeton hors des en-têtes `Referer`.
- **La limite de débit** (`host-confirmation.mjs`, cinq demandes en dix minutes, partagée par le run et `skraft_decide`) ne compte une demande qu'une fois passées les gardes d'élicitation et de mode, juste avant d'appeler le dialogue. Une requête refusée avant ne la consomme pas.
- **`Sec-Fetch-Site` (#430).** Le flux et l'enregistrement exigent, avec le jeton, un `Sec-Fetch-Site` absent, `same-origin` ou `none` : une requête qu'un navigateur dit venue d'un autre site (`cross-site`) ou d'une autre origine du même site (`same-site`, un autre port de 127.0.0.1) est refusée 403, même avec le jeton. Jamais sur `GET /` : l'hôte navigue le cadre depuis sa propre origine (`cross-site`), et l'origine qui l'embarque n'est pas mesurée.
- **`Cross-Origin-Resource-Policy: same-origin` (#430)** sur les assets, le flux et les réponses JSON (refus compris), **pas sur la page** : sous un embarqueur COEP `require-corp`, un document en `same-origin` serait bloqué dans le cadre, et l'origine qui embarque le panneau reste non mesurée.
- **Limites de connexion (#430, Node 22.17.1).** `requestTimeout` et `headersTimeout` à 10 s, `keepAliveTimeout` à 5 s, `connectionsCheckingInterval` à un dixième du délai de requête : une socket muette ou une requête dont les en-têtes ne finissent pas reçoit 408 et est fermée, une connexion inactive est fermée. Un flux SSE n'est pas coupé : `requestTimeout` ne couvre que la réception de la requête (mesuré, une réponse ouverte 3 s). `server.close()` n'aboutit pas tant qu'une connexion qui n'a envoyé aucune requête reste ouverte : `closeAllConnections()` suit donc `close()`. Un écouteur `error` sans effet évite qu'un événement sans écouteur n'emporte le processus de la session.
- **Flux (#430).** Première trame `retry: 1500` (la page revenue réessaie vite), commentaire `: ping` toutes les 15 s (un flux silencieux n'est pas coupé en chemin), trame `event: focus` quand le canvas est rouvert sur un autre onglet : le serveur la pousse aux pages qui écoutent, ou la garde pour la prochaine page, une fois. Le serveur n'en attend pas de l'hôte : `canvas-reopen-other-tab` mesure que l'hôte rappelle `open` avec le nouvel `input`, pas ce qu'un rendu fait de la nouvelle url.
- **`frame-ancestors`.** Le CSP du canvas n'en fixe pas : l'origine qui embarque le panneau dans l'app Copilot n'est pas mesurée, et le canvas du backlog pose `frame-ancestors *` exprès. Le restreindre attend cette mesure.

### VS Code : confirmation depuis le canvas `skraft-pipeline` — 2026-10-28 (mesure manuelle, #302)

VS Code Insiders · hôte d'agent Copilot 1.0.101 · darwin. Mesure à la main dans l'app, hors de la sonde headless.

| Contrôle | Issue | Verdict | Observé |
| --- | --- | --- | --- |
| clic RATIFIED/REJECTED dans le canvas `skraft-pipeline` | #302 | fail | aucune confirmation affichée ; refus immédiat `not-confirmed` ; aucun événement d'élicitation dans le journal de session après le clic (sessions e84828d3 et 471a46b5) |
| `skraft_decide` appelé par le modèle dans un tour de chat | #302 | pass | confirmation affichée et acceptée (télémétrie du résultat d'outil `elicitation_action: accept`) ; réponse journalisée `by: host-confirmed` (session f771b953) |

Sous VS Code, une action du canvas tourne hors de tout tour de chat et `session.ui.confirm` n'y donne pas de réponse, alors que `confirm-from-canvas` passe sous Copilot CLI 1.0.102-1 (sonde headless ci-dessous). `host-confirmation.mjs` distingue désormais ce cas : un `false` littéral ou l'absence de réponse dans les 120 s reste `not-confirmed` (la personne a dit non ou n'a pas répondu) ; une exception ou tout autre résultat devient `not-asked` (l'hôte n'a pas posé la question). Le canvas dit alors de répondre à la question dans le chat Copilot ; l'outil, déjà dans un tour de chat, renvoie vers `skraft decide` dans un terminal. Rien n'est enregistré dans aucun des deux cas.

Non mesuré : un dialogue que la personne ferme sans répondre pourrait rendre `undefined` plutôt que `false` ; il serait alors lu comme `not-asked`, sans enregistrement non plus.

### Sonde d'hôte Copilot — 2026-10-28 (branche feat/301-canvas-pipeline, jeton dans l'url)

Copilot CLI GitHub Copilot CLI 1.0.102-1. · SDK 1.0.102-1 · Node v22.17.1 · darwin 25.5.0. Aucun appel de modèle.

| Contrôle | Issue | Verdict | Observé |
| --- | --- | --- | --- |
| `extension-loads-agent-plugins` | — | pass | {"toolOffered":true,"extensions":[{"name":"microcks-canvas","status":"running"},{"name":"skraft-probe-agent:skraft-probe-a","status":"running"},{"name":"skraft-probe-legacy:skraft-probe-l","status":"running"}]} |
| `extension-loads-claude-plugin` | — | pass | {"toolOffered":true} |
| `cwd-after-cd` | #245 | pass | {"atLoad":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-tkFsfl/repo-a","processCwdAfter":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-tkFsfl/repo-a","trackedAfter":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe |
| `snapshot-working-directory` | — | pass | {"atLoad":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-tkFsfl/repo-a","afterCd":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-tkFsfl/repo-b","repoA":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-tkFsfl/repo-a" |
| `confirm-from-tool` | #244 | pass | {"elicitationCapability":true,"mode":"interactive","modeError":null,"accepted":{"value":true},"declined":{"value":false},"hostAsked":2} |
| `confirm-in-autopilot` | #244 | inconclusive | {"result":null,"hostAsked":0} |
| `confirm-from-workflow` | #244 | pass | {"status":"completed","result":{"hasSession":true,"elicitation":true,"value":true},"error":null} |
| `confirm-joined-session-from-workflow` | — | pass | {"status":"completed","result":{"elicitation":true,"mode":"interactive","value":true},"error":null} |
| `throwing-workflow` | #247 | pass | {"status":"error","hasResult":false,"error":"Request workflow.execute failed with message: skraft-probe-sentinel","failure":null} |
| `copilot-model-refusal` | — | inconclusive | {"reason":"needs --agent-calls: each of these checks starts one agent, which may spend AI credits"} |
| `copilot-effort-refusal` | — | inconclusive | {"reason":"needs --agent-calls: each of these checks starts one agent, which may spend AI credits"} |
| `broken-workflow-isolation` | #246 | pass | {"toolOffered":false} |
| `bad-tool-name-isolation` | #246 | pass | {"status":"rpc-error","error":"No workflow registered with name \"skraft-probe-iso\""} |
| `canvas-accepted-at-join` | — | pass | {"toolOffered":true,"canvasListed":true,"error":null,"createCanvas":true} |
| `canvas-open-headless` | — | pass | {"error":null,"url":"http://127.0.0.1:60818/?t=skraft-probe-token","queryKept":true,"sameUrlAgain":true,"page":200,"openCalls":2,"hostCanvases":null,"sessionWorkingDirectory":"/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-tkFsfl/repo-a","title":"skraft probe canvas"} |
| `canvas-action-invoke` | — | pass | {"error":null,"result":{"result":{"ok":true,"opened":2}}} |
| `confirm-from-canvas` | — | pass | {"answer":{"value":true,"error":null},"hostAsked":1} |
| `canvas-close` | — | pass | {"closed":["skraft-probe-instance"]} |
| `canvas-agent-tools` | — | pass | {"without":[],"withRenderer":["invoke_canvas_action","list_canvas_capabilities","open_canvas"]} |
| `skraft-extension-loaded` | — | pass | {"skraftDecideOffered":true} |
| `skraft-workflow-registered` | — | pass | {"status":"completed","result":{"status":"refused","slug":null,"phase":null,"code":"invalid-slug","reason":"slug must be kebab-case: lowercase letters and digits, joined by single hyphens"},"error":null} |
| `unknown-arg-ignored` | #249 | fail | {"status":"completed","result":{"status":"refused","slug":null,"phase":null,"code":"invalid-args","reason":"the workflow takes only slug, issue, title, base, fromArtifacts and agentIds; nothing was started"},"error":null} |
| `decide-without-confirm` | #244 | fail | {"toolResult":"Refused: you did not confirm the decision in Copilot; nothing was recorded.","answeredBy":[],"hostAsked":1} |
| `skraft-canvas-registered` | — | pass | {"declared":true,"error":null} |
| `skraft-canvas-opens` | — | pass | {"error":null,"title":"skraft probe-question","status":"waiting","loopback":true,"tokenInUrl":true,"page":200,"pageWithoutToken":403,"csp":"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'","question":"adr-0","contentStatus":"waiting"} |
| `skraft-canvas-answer` | — | pass | {"answered":{"recorded":true,"text":"Recorded: probe-question: adr-0 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows)."},"answeredBy":["host-confirmed"],"hostAsked":1} |
| `decide-after-cd` | #245 | fail | {"toolResult":"Recorded: probe-question: adr-0 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).","answeredInSecondRepo":true} |
| `session-agents` | — | pass | {"agentFiles":19,"missing":[],"sample":[{"id":"skraft:finding-refuter","name":"skraft:finding-refuter"},{"id":"skraft:business-alignment-lens","name":"skraft:business-alignment-lens"},{"id":"skraft:fitness-lens","name":"skraft:fitness-lens"},{"id":"skraft:solution-researcher","name":"skraft:solution |
| `copilot-models-available` | — | inconclusive | {"configured":[]} |
| `skraft-tool-names-free` | — | pass | {"native":["bash","create","dynamic_workflows_manage","edit","extensions_manage","extensions_reload","glob","grep","list_agents","list_bash","read_agent","read_bash","run_dynamic_workflow","semantic_code_search","skill","sql","stop_bash","task","view","web_fetch","write_agent"],"skraft":["skraft_dec |

Le jeton du panneau passe dans l'url : un open headless rend l'url avec sa chaîne de requête intacte (`canvas-open-headless`, `queryKept`), la page du canvas `skraft-pipeline` répond 200 avec le jeton et 403 sans (`skraft-canvas-opens`). Les autres verdicts sont inchangés.

### Sonde d'hôte Copilot — 2026-10-27 (branche feat/301-canvas-pipeline, canvas skraft-pipeline livré)

Copilot CLI GitHub Copilot CLI 1.0.102-1. · SDK 1.0.102-1 · Node v22.17.1 · darwin 25.5.0. Aucun appel de modèle.

| Contrôle | Issue | Verdict | Observé |
| --- | --- | --- | --- |
| `extension-loads-agent-plugins` | — | pass | {"toolOffered":true,"extensions":[{"name":"microcks-canvas","status":"running"},{"name":"skraft-probe-agent:skraft-probe-a","status":"running"},{"name":"skraft-probe-legacy:skraft-probe-l","status":"running"}]} |
| `extension-loads-claude-plugin` | — | pass | {"toolOffered":true} |
| `cwd-after-cd` | #245 | pass | {"atLoad":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-dr5dcy/repo-a","processCwdAfter":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-dr5dcy/repo-a","trackedAfter":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe |
| `snapshot-working-directory` | — | pass | {"atLoad":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-dr5dcy/repo-a","afterCd":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-dr5dcy/repo-b","repoA":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-dr5dcy/repo-a" |
| `confirm-from-tool` | #244 | pass | {"elicitationCapability":true,"mode":"interactive","modeError":null,"accepted":{"value":true},"declined":{"value":false},"hostAsked":2} |
| `confirm-in-autopilot` | #244 | inconclusive | {"result":null,"hostAsked":0} |
| `confirm-from-workflow` | #244 | pass | {"status":"completed","result":{"hasSession":true,"elicitation":true,"value":true},"error":null} |
| `confirm-joined-session-from-workflow` | — | pass | {"status":"completed","result":{"elicitation":true,"mode":"interactive","value":true},"error":null} |
| `throwing-workflow` | #247 | pass | {"status":"error","hasResult":false,"error":"Request workflow.execute failed with message: skraft-probe-sentinel","failure":null} |
| `copilot-model-refusal` | — | inconclusive | {"reason":"needs --agent-calls: each of these checks starts one agent, which may spend AI credits"} |
| `copilot-effort-refusal` | — | inconclusive | {"reason":"needs --agent-calls: each of these checks starts one agent, which may spend AI credits"} |
| `broken-workflow-isolation` | #246 | pass | {"toolOffered":false} |
| `bad-tool-name-isolation` | #246 | pass | {"status":"rpc-error","error":"No workflow registered with name \"skraft-probe-iso\""} |
| `canvas-accepted-at-join` | — | pass | {"toolOffered":true,"canvasListed":true,"error":null,"createCanvas":true} |
| `canvas-open-headless` | — | pass | {"error":null,"url":"http://127.0.0.1:55714/","sameUrlAgain":true,"page":200,"openCalls":2,"hostCanvases":null,"sessionWorkingDirectory":"/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-dr5dcy/repo-a","title":"skraft probe canvas"} |
| `canvas-action-invoke` | — | pass | {"error":null,"result":{"result":{"ok":true,"opened":2}}} |
| `confirm-from-canvas` | — | pass | {"answer":{"value":true,"error":null},"hostAsked":1} |
| `canvas-close` | — | pass | {"closed":["skraft-probe-instance"]} |
| `canvas-agent-tools` | — | pass | {"without":[],"withRenderer":["invoke_canvas_action","list_canvas_capabilities","open_canvas"]} |
| `skraft-extension-loaded` | — | pass | {"skraftDecideOffered":true} |
| `skraft-workflow-registered` | — | pass | {"status":"completed","result":{"status":"refused","slug":null,"phase":null,"code":"invalid-slug","reason":"slug must be kebab-case: lowercase letters and digits, joined by single hyphens"},"error":null} |
| `unknown-arg-ignored` | #249 | fail | {"status":"completed","result":{"status":"refused","slug":null,"phase":null,"code":"invalid-args","reason":"the workflow takes only slug, issue, title, base, fromArtifacts and agentIds; nothing was started"},"error":null} |
| `decide-without-confirm` | #244 | fail | {"toolResult":"Refused: you did not confirm the decision in Copilot; nothing was recorded.","answeredBy":[],"hostAsked":1} |
| `skraft-canvas-registered` | — | pass | {"declared":true,"error":null} |
| `skraft-canvas-opens` | — | pass | {"error":null,"title":"skraft probe-question","status":"waiting","loopback":true,"page":200,"csp":"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'","question":"adr-0","contentStatus":"waiting"} |
| `skraft-canvas-answer` | — | pass | {"answered":{"recorded":true,"text":"Recorded: probe-question: adr-0 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows)."},"answeredBy":["host-confirmed"],"hostAsked":1} |
| `decide-after-cd` | #245 | fail | {"toolResult":"Recorded: probe-question: adr-0 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).","answeredInSecondRepo":true} |
| `session-agents` | — | pass | {"agentFiles":19,"missing":[],"sample":[{"id":"skraft:finding-refuter","name":"skraft:finding-refuter"},{"id":"skraft:business-alignment-lens","name":"skraft:business-alignment-lens"},{"id":"skraft:fitness-lens","name":"skraft:fitness-lens"},{"id":"skraft:solution-researcher","name":"skraft:solution |
| `copilot-models-available` | — | inconclusive | {"configured":[]} |
| `skraft-tool-names-free` | — | pass | {"native":["bash","create","dynamic_workflows_manage","edit","extensions_manage","extensions_reload","glob","grep","list_agents","list_bash","read_agent","read_bash","run_dynamic_workflow","semantic_code_search","skill","sql","stop_bash","task","view","web_fetch","write_agent"],"skraft":["skraft_dec |

Le canvas `skraft-pipeline` du plugin, CLI 1.0.102-1, darwin, connecté : déclaré au join à côté des deux workflows et de `skraft_decide` (`skraft-canvas-registered`) ; ouvert headless dans le dépôt dont le pipeline attend `adr-0`, il rend le titre `skraft probe-question` et le statut `waiting`, sa page répond 200 sous `default-src 'none'` et son flux d'événements porte la question (`skraft-canvas-opens`) ; un POST `/answer` de la page, jeton et Origin de la page, fait paraître une seule fois le dialogue de confirmation de l'hôte, et la réponse acceptée est journalisée `host-confirmed` (`skraft-canvas-answer`). Les autres verdicts sont ceux de la passe précédente du même jour.

### Sonde d'hôte Copilot — 2026-10-27 (branche feat/301-canvas-pipeline)

Copilot CLI GitHub Copilot CLI 1.0.102-1. · SDK 1.0.102-1 · Node v22.17.1 · darwin 25.5.0. Aucun appel de modèle.

| Contrôle | Issue | Verdict | Observé |
| --- | --- | --- | --- |
| `extension-loads-agent-plugins` | — | pass | {"toolOffered":true,"extensions":[{"name":"microcks-canvas","status":"running"},{"name":"skraft-probe-agent:skraft-probe-a","status":"running"},{"name":"skraft-probe-legacy:skraft-probe-l","status":"running"}]} |
| `extension-loads-claude-plugin` | — | pass | {"toolOffered":true} |
| `cwd-after-cd` | #245 | pass | {"atLoad":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-1obyHZ/repo-a","processCwdAfter":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-1obyHZ/repo-a","trackedAfter":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe |
| `snapshot-working-directory` | — | pass | {"atLoad":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-1obyHZ/repo-a","afterCd":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-1obyHZ/repo-b","repoA":"/private/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-1obyHZ/repo-a" |
| `confirm-from-tool` | #244 | pass | {"elicitationCapability":true,"mode":"interactive","modeError":null,"accepted":{"value":true},"declined":{"value":false},"hostAsked":2} |
| `confirm-in-autopilot` | #244 | inconclusive | {"result":null,"hostAsked":0} |
| `confirm-from-workflow` | #244 | pass | {"status":"completed","result":{"hasSession":true,"elicitation":true,"value":true},"error":null} |
| `confirm-joined-session-from-workflow` | — | pass | {"status":"completed","result":{"elicitation":true,"mode":"interactive","value":true},"error":null} |
| `throwing-workflow` | #247 | pass | {"status":"error","hasResult":false,"error":"Request workflow.execute failed with message: skraft-probe-sentinel","failure":null} |
| `copilot-model-refusal` | — | inconclusive | {"reason":"needs --agent-calls: each of these checks starts one agent, which may spend AI credits"} |
| `copilot-effort-refusal` | — | inconclusive | {"reason":"needs --agent-calls: each of these checks starts one agent, which may spend AI credits"} |
| `broken-workflow-isolation` | #246 | pass | {"toolOffered":false} |
| `bad-tool-name-isolation` | #246 | pass | {"status":"rpc-error","error":"No workflow registered with name \"skraft-probe-iso\""} |
| `canvas-accepted-at-join` | — | pass | {"toolOffered":true,"canvasListed":true,"error":null,"createCanvas":true} |
| `canvas-open-headless` | — | pass | {"error":null,"url":"http://127.0.0.1:51059/","sameUrlAgain":true,"page":200,"openCalls":2,"hostCanvases":null,"sessionWorkingDirectory":"/var/folders/rt/7b90yj812s398841w6cdbk040000gn/T/skraft-host-probe-1obyHZ/repo-a","title":"skraft probe canvas"} |
| `canvas-action-invoke` | — | pass | {"error":null,"result":{"result":{"ok":true,"opened":2}}} |
| `confirm-from-canvas` | — | pass | {"answer":{"value":true,"error":null},"hostAsked":1} |
| `canvas-close` | — | pass | {"closed":["skraft-probe-instance"]} |
| `canvas-agent-tools` | — | pass | {"without":[],"withRenderer":["invoke_canvas_action","list_canvas_capabilities","open_canvas"]} |
| `skraft-extension-loaded` | — | pass | {"skraftDecideOffered":true} |
| `skraft-workflow-registered` | — | pass | {"status":"completed","result":{"status":"refused","slug":null,"phase":null,"code":"invalid-slug","reason":"slug must be kebab-case: lowercase letters and digits, joined by single hyphens"},"error":null} |
| `unknown-arg-ignored` | #249 | fail | {"status":"completed","result":{"status":"refused","slug":null,"phase":null,"code":"invalid-args","reason":"the workflow takes only slug, issue, title, base, fromArtifacts and agentIds; nothing was started"},"error":null} |
| `decide-without-confirm` | #244 | fail | {"toolResult":"Refused: you did not confirm the decision in Copilot; nothing was recorded.","answeredBy":[],"hostAsked":1} |
| `decide-after-cd` | #245 | fail | {"toolResult":"Recorded: probe-question: adr-0 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).","answeredInSecondRepo":true} |
| `session-agents` | — | pass | {"agentFiles":19,"missing":[],"sample":[{"id":"skraft:finding-refuter","name":"skraft:finding-refuter"},{"id":"skraft:business-alignment-lens","name":"skraft:business-alignment-lens"},{"id":"skraft:fitness-lens","name":"skraft:fitness-lens"},{"id":"skraft:solution-researcher","name":"skraft:solution |
| `copilot-models-available` | — | inconclusive | {"configured":[]} |
| `skraft-tool-names-free` | — | pass | {"native":["bash","create","dynamic_workflows_manage","edit","extensions_manage","extensions_reload","glob","grep","list_agents","list_bash","read_agent","read_bash","run_dynamic_workflow","semantic_code_search","skill","sql","stop_bash","task","view","web_fetch","write_agent"],"skraft":["skraft_dec |

Canvas (#251), CLI 1.0.102-1, darwin, connecté. Un canvas d'extension (`createCanvas` du SDK 1.0.102-1) se joint avec un outil dans le même `joinSession`. Une session SDK headless l'ouvre par `session.rpc.canvas.open` : l'hôte appelle le `open` de l'extension, qui démarre alors seulement son serveur loopback, et la page répond. Rouvrir la même `instanceId` rappelle `open` : le pilote doit rendre la même instance au lieu d'en démarrer une seconde. L'action et la fermeture atteignent l'extension. Un POST de la page sur ce serveur, hors de tout appel d'outil, fait arriver `session.ui.confirm` de la session jointe au handler d'élicitation de l'hôte : le bouton de réponse peut passer par la décision 7. La requête d'ouverture porte `session.workingDirectory` mais aucun `host.capabilities.canvases` (`null`, avec ou sans `requestCanvasRenderer`) : rien ne dit au pilote si l'hôte affiche le panneau. Le modèle ne reçoit `list_canvas_capabilities`, `open_canvas` et `invoke_canvas_action` que d'une session qui demande `requestCanvasRenderer`. `confirm-joined-session-from-workflow` est mesuré pour la première fois : sa ligne quitte « En attente de mesure ».

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
commit hors du dossier `.git`, dans un dossier à lui : `<tmp>/skraft-replay-<uid>/<id>/<sha>-<aléa>`,
le parent en 0700 à l'utilisateur, le worktree verrouillé (`--lock`) le temps du rejeu.

| Commande | Où | Sortie | Observé |
| --- | --- | --- | --- |
| `npx vitest run` | rejeu, graine verte | exit 0 | 3 fichiers, 5 tests passés |
| `npx vitest run` | rejeu, commit rouge Vitest | exit 1 | `rouge.test.ts` : 1 échec, 5 passés |
| `npx vitest run` | rejeu, commit rouge e2e | exit 0 | 5 tests passés : le rejeu passe à l'e2e |
| `npx playwright test` | rejeu, commit rouge e2e | exit 1 | `toBeVisible` : bouton absent (vrai échec) |
| `npx playwright test` | rejeu, son parent | exit 0 | 2 passés : l'e2e prouve le rouge |
| `git status` de la copie de travail | avant et après deux rejeux Playwright | vide | un seul worktree listé ; les liens ne sont jamais suivis au retrait (voir les limites) |

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

### Python et installation éditable — 2026-10-28 (branche fix/303-rejeu-dependances)

Python 3.14.7, un paquet `src/shop/` installé en éditable (`pip install pytest -e .`) dans le
`.venv` de la copie de travail, un commit `test(…)` rouge (`shop.VALUE == 2` quand le commit dit
1) puis le commit vert ; la copie de travail est au vert. Rejeu avec l'adaptateur du moteur,
`.venv` lié.

| Backend | Rejeu du rouge, `.venv` lié seul | Même rejeu, `PYTHONPATH=<worktree>/src` en tête | Rejeu du vert |
| --- | --- | --- | --- |
| setuptools ≥ 64 | exit 0, 1 passé : le code vert de la copie de travail est importé | exit 1, 1 échec | exit 0 |
| hatchling | exit 0, 1 passé | exit 1, 1 échec | exit 0 |

Le rejeu d'un composant `python` met donc ses dossiers `paths.src`, pris dans le commit, en tête de
`PYTHONPATH`, avant la valeur déjà là ; il lance chaque choix d'interpréteur par un lanceur
`node -e`, le mod ne passant pas d'environnement.

### Espaces de travail npm/pnpm — 2026-10-28 (branche v2/dotnet-and-misc-fixes, #330)

Les paquets frères se résolvent par des liens relatifs dans le `node_modules` racine
(`node_modules/<paquet>` → `../packages/<paquet>`). Lié en entier, ce dossier faisait suivre ces
liens depuis la copie de travail : le rejeu importait les paquets frères de la copie de travail.
Le rejeu reconstruit donc chaque `node_modules` d'un niveau dans le worktree : un dossier, un lien
par entrée (un niveau de plus dans un `@portée` et dans `.bin`), une copie de chaque fichier. Une
entrée qui se résout dans le dépôt vers un chemin que le worktree contient est liée à celui du
worktree ; les autres, dont le magasin `.pnpm`, restent liées à la copie de travail. Mesuré
(Node 22.17.1, macOS) par les tests d'intégration du rejeu : `core` à 1 et `@acme/util` à 10 au
commit, 2 et 20 dans la copie de travail ; le rejeu lit 1 et 10, le bin `.bin/core` →
`../core/bin.js` lance celui du commit, et aucun lien ne reste quand Git retire le worktree.

### Magasin pnpm — 2026-10-30 (branche v2/replay-pnpm-store, #330)

Dans un espace de travail pnpm, `apps/web/node_modules/lib` pointe dans `node_modules/.pnpm`, que le
rejeu liait en entier à la copie de travail : Node résout depuis le chemin réel, donc `lib` lisait
`core` dans la copie de travail. Git liste `apps/web/node_modules` avant `node_modules` ; les
dossiers sont désormais remplis du moins profond au plus profond, `.pnpm` avant les autres entrées
de son dossier. Le rejeu reconstruit le magasin quand une de ses entrées atteint un paquet frère,
directement ou par une autre entrée (point fixe) : l'entrée est copiée (déréférencée, pour que le
chemin réel reste dans le worktree) et ses liens sont repointés vers le frère du commit ; les autres
entrées, et les liens qui sortent du dépôt, restent liés à la copie de travail. Un magasin qu'aucune
entrée n'atteint reste lié en entier. Un lien du magasin vers un frère est reconnu qu'il soit relatif
(POSIX) ou absolu (jonction Windows). Mesuré (Node 22.17.1, macOS) par les tests d'intégration du
rejeu : `lib` (lit `core` et un dossier hors dépôt, 40) répond 41 au lieu de 42 ; `wrap` (lit `lib`)
141 au lieu de 142 ; `@acme/kit` (lit `@acme/util` par un lien absolu) 10 au lieu de 20 ; un magasin
qu'aucune entrée n'atteint reste un lien (`dep` répond 5) ; aucun lien ne reste quand Git retire le
worktree, et la copie de travail garde ses liens. Windows : non mesuré ; les tests ne sont pas
ignorés sous win32, la CI `windows-latest` de la pull request donne la mesure.

### Ce que le rejeu ne couvre pas

- Espaces de travail : un paquet frère dont le point d'entrée est une sortie de build ignorée
  par Git (`dist/`) n'a pas cette sortie dans le worktree ; le rejeu ne construit rien. Un paquet
  frère injecté (`dependenciesMeta.injected`, entrée `core@file+packages+core`) : son nom de
  dossier ne se décode pas de façon fiable. Un magasin hors du dépôt (magasin virtuel global,
  `virtual-store-dir`) n'est pas reconstruit. `.pnpm/node_modules` est reconstruit
  quand il atteint un frère, mais une recherche fantôme par ce dossier depuis un paquet du magasin
  qui ne déclare aucun frère (donc non reconstruit) lit la copie de travail : le corriger copie
  tout le magasin. Un lien d'un paquet copié vers son propre dossier (cycle) est sauté dans la
  copie. Les liens vers des fichiers ne sont
  pas faits sous Windows. Chemins longs : un worktree dont les chemins du magasin dépassent 260
  caractères peut échouer au retrait sans `core.longpaths`. Les jonctions et la copie des fichiers
  de `node_modules` n'ont pas été mesurées sous Windows.
- Le programme rejoué écrit à travers les liens dans les vrais dossiers : un cache que l'outil
  garde sous `node_modules`, un `__pycache__` sous `.venv`, et toute installation. Mesuré sur
  Mastermind : `web/node_modules/.vite/deps` de la copie de travail porte l'heure des rejeux. Le rejeu refuse une commande test ou e2e qui contient
  `npm ci`, `npm install`, `npm cit`, `npm install-ci-test`, `pnpm install`, `yarn install`,
  `uv sync` ou `pip install` ; il ne voit pas un script qui installe (`npm test` dont le script
  installe), ni `uv run`, qui synchronise le `.venv` par défaut.
- Un `.venv` qui est lui-même un lien n'est pas lié quand `.gitignore` dit `.venv/` : mesuré, Git
  ne le liste pas parmi les dossiers ignorés (git 2.47) ; avec `.venv` sans barre finale, il le
  liste et le rejeu le lie.
- Playwright avec `reuseExistingServer: true` et un serveur de dev déjà lancé sur le port : l'e2e
  rejoué parle à l'application de la copie de travail, pas à celle du commit (comportement documenté de
  Playwright, non mesuré ici).

## Non vérifié

- Ce que la vue `/workflows` de la TUI et l'app Copilot affichent d'une phase non déclarée (lu dans `cli-main.js` 1.0.105 : `phase ?/N` et une ligne `· <titre>`), et la ligne `logPhaseNames` du transcript : la sonde lit `getRunDetail`, pas un rendu (#429).
- Tout ce que liste la sonde, tant qu'aucune section ci-dessus ne le mesure.
- L'app Copilot (canvas, élicitation, réponse sans personne), une session CLI interactive, Windows.
- Où l'hôte affiche un canvas : la sonde mesure une ouverture headless, pas un affichage. Le canvas `skraft-pipeline` dans l'app Copilot (la sonde l'ouvre et lit son flux headless, sans l'afficher) : qu'elle affiche la page loopback dans son panneau, qu'elle garde la chaîne de requête de l'url du canvas (le jeton `?t=`), que le CSP `default-src 'none'` y tienne, que le flux d'événements (`EventSource`) reste ouvert et que la page se redessine pendant un run, qu'un clic sur un bouton de réponse fasse paraître le dialogue de confirmation de Copilot. À vérifier à la main dans l'app, sur un run réel qui attend une ratification d'ADR. La sonde mesure l'ouverture headless et la confirmation demandée depuis la page, pas l'affichage.
- Le canvas sous une session CLI interactive (terminal) : si la TUI demande `requestCanvasRenderer`, si `open_canvas` y est offert au modèle et ce qu'elle fait d'une `url` de canvas. La sonde ne lance pas de TUI.
- Un panneau `skraft-pipeline` déjà monté : si le rendu (app Copilot, VS Code, TUI) recharge la page quand `open` rend une autre url (`&tab=`). La sonde mesure que l'hôte rappelle `open` et rend la nouvelle url (`canvas-reopen-other-tab`), pas ce qu'un rendu en fait ; le serveur pousse l'onglet dans le flux de la page ouverte, sans en dépendre (#430).
- Si l'app Copilot passe `host.capabilities.canvases` à `open` : la session SDK headless ne le passe pas (`null`, CLI 1.0.102-1).
- L'origine qui embarque le panneau dans l'app, dont dépend un `frame-ancestors`.
- Le motif de nom d'outil que l'hôte accepte pour un outil d'extension : seul le refus de `bad name!` est observé (`bad-tool-name-isolation`).
- Le comportement des sous-agents lancés par `ctx.agent` : noms acceptés par l'option `model`, effet de `maxConcurrentSubagents`, coût d'un run.
- Le texte d'un refus de modèle et d'un refus de `reasoningEffort` (le classifieur `refusalOf` du pilote suppose des textes) : `copilot-model-refusal` et `copilot-effort-refusal`, à lancer avec `--agent-calls`.
- Le préchargement d'une skill par le champ `skills:` d'un agent Copilot (`.agent.md`) en session réelle : `agent-skills-preload`, à lancer avec `--agent-calls` (deux agents). Lu dans Copilot CLI 1.0.78 : `customAgentsParseMarkdown` garde `skills` dans la définition de l'agent et ignore `metadata` ; au lancement, l'agent charge chaque skill listée (`skillsLoadForAgent`, mode `context-load`). Les deux arbres déclarent `skills:` depuis cette lecture.
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

Aucun hook ajouté au lot 10. `AGENTS.md` (règles du moteur) n'en admet un que s'il protège une action irréversible que le moteur ne peut pas détecter après coup, avec un coût mesuré et un comportement documenté sur les trois hôtes ; ses règles du pilote Copilot excluent tout hook pré-outil sous Copilot. Revue des candidats :

| Action | Détectée après coup | Hook |
| --- | --- | --- |
| Écriture hors périmètre par un agent | Oui : diff git de l'étape, étape refusée | Non |
| Journal ou état modifié à la main | Oui : chaîne de hachage, run arrêté | Non |
| Fichier de réponse de la boucle écrit par l'orchestrateur | Oui, en partie : une réponse illisible ou absente est redemandée, puis le run s'arrête | Non |
| `skraft decide` lancé par l'orchestrateur à la place de la personne (boucle VS Code) | Non | Non : garde dans le moteur à la place. En boucle, `next` n'imprime plus de commande `skraft decide` prête à lancer ; `skraft decide` en ligne de commande demande à la personne de confirmer la réponse à une invite interactive, refuse sans TTY, et journalise `by: 'cli-tty'` (le mod et l'outil Copilot gardent `by: 'decide'`). Garde au mieux : dans un terminal partagé, quiconque y tape répond. |
| `git push`, publication | Aucun agent du workflow ne pousse ; la publication passe par le moteur (lot 8) | Non |
