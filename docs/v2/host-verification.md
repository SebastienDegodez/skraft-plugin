<!-- markdownlint-disable-file -->
# Vérification d'hôte Copilot — index d'évidence

Ce que le pilote Copilot suppose de l'hôte, mesuré par `eng/host-probe/copilot-probe.mjs` (hôte SDK headless, aucun appel de modèle) — [ADR-002](../adr/adr-002-copilot-host-driver-contract.md), issue #251. Chaque passage de la sonde ajoute sa section en tête, avec les versions mesurées.

## Mesures

### En attente de mesure

Ce que le pilote suppose déjà sans mesure ; la prochaine passe de la sonde remplace chaque ligne par son verdict.

| Contrôle | Issue | Verdict | Supposé par |
| --- | --- | --- | --- |
| agent lancé : charge-t-il `AGENTS.md`, `CLAUDE.md` ou `.github/copilot-instructions.md` de la copie de travail (Copilot CLI) | — | not measured, aucun contrôle de sonde | rien : la revue d'une pull request (#240) n'en suppose rien ; si l'hôte les charge, ses lentilles lisent la version de l'auteur de la pull request à côté des copies de la base que leur brief désigne |
| agent lancé : même question sous Claude Code et sous VS Code | — | not measured, hors de cette sonde | idem |

### Canvas `skraft-pipeline` : modèle de menace et cadre

- **La porte, c'est la confirmation de l'hôte.** Aucune réponse n'est enregistrée depuis le canvas sans que `session.ui.confirm` du Copilot rende `true` (ADR-002, décision 7), quel que soit l'auteur de la requête ; l'action offerte au modèle est en lecture seule.
- **Le jeton tient à l'écart les autres lecteurs.** Chaque panneau a un jeton aléatoire qui ne voyage que dans l'url que `open` rend à l'hôte (`http://127.0.0.1:<port>/?t=<jeton>`) ; la page, le flux et les réponses l'exigent, comparé par empreinte SHA-256 en temps constant, et le HTML ne le porte pas. Un autre processus local ou une page de navigateur ne lit donc pas la vue du run, ne fait pas paraître de dialogue et n'use pas la limite partagée de cinq demandes en dix minutes, qui bloquerait `skraft_decide` et les boutons. Le Host doit être l'adresse loopback liée (pas de rebinding DNS), le serveur n'écoute que sur 127.0.0.1, et `Referrer-Policy: no-referrer` garde le jeton hors des en-têtes `Referer`.
- **La limite de débit** (`host-confirmation.mjs`) ne compte une demande qu'une fois passées les gardes d'élicitation et de mode, juste avant d'appeler le dialogue ; Decide ne l'appelle qu'après avoir validé la clé et la réponse. Une requête refusée avant ne la consomme pas.
- **Origin.** Une réponse exige aussi l'`Origin` même de la page, comme le fixe ADR-002 (décision 10). Une webview en iframe isolée enverrait `Origin: null` et chaque réponse serait refusée (403) ; la personne répondrait alors par `skraft_decide` ou `skraft decide`. Accepter `null` sur le seul jeton serait sûr maintenant que le jeton ne se lit plus par `GET /`, mais cela amende la décision 10 : à décider une fois l'`Origin` de l'app mesurée, pas avant.
- **`frame-ancestors`.** Le CSP du canvas n'en fixe pas : l'origine qui embarque le panneau dans l'app Copilot n'est pas mesurée, et le canvas du backlog pose `frame-ancestors *` exprès. Le restreindre attend cette mesure.

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

Canvas (ADR-002 décision 10, #251), CLI 1.0.102-1, darwin, connecté. Un canvas d'extension (`createCanvas` du SDK 1.0.102-1) se joint avec un outil dans le même `joinSession`. Une session SDK headless l'ouvre par `session.rpc.canvas.open` : l'hôte appelle le `open` de l'extension, qui démarre alors seulement son serveur loopback, et la page répond. Rouvrir la même `instanceId` rappelle `open` : le pilote doit rendre la même instance au lieu d'en démarrer une seconde. L'action et la fermeture atteignent l'extension. Un POST de la page sur ce serveur, hors de tout appel d'outil, fait arriver `session.ui.confirm` de la session jointe au handler d'élicitation de l'hôte : le bouton de réponse peut passer par la décision 7. La requête d'ouverture porte `session.workingDirectory` mais aucun `host.capabilities.canvases` (`null`, avec ou sans `requestCanvasRenderer`) : rien ne dit au pilote si l'hôte affiche le panneau. Le modèle ne reçoit `list_canvas_capabilities`, `open_canvas` et `invoke_canvas_action` que d'une session qui demande `requestCanvasRenderer`. `confirm-joined-session-from-workflow` est mesuré pour la première fois : sa ligne quitte « En attente de mesure ».

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

## Non vérifié

- Tout ce que liste la sonde, tant qu'aucune section ci-dessus ne le mesure.
- L'app Copilot (canvas, élicitation, réponse sans personne), une session CLI interactive, Windows.
- Où l'hôte affiche un canvas (ADR-002, décision 10) : la sonde mesure une ouverture headless, pas un affichage. Le canvas `skraft-pipeline` dans l'app Copilot (la sonde l'ouvre, lit son flux et y répond headless, sans l'afficher) : qu'elle affiche la page loopback dans son panneau, qu'elle garde la chaîne de requête de l'url du canvas (le jeton `?t=`), que le CSP `default-src 'none'` y tienne, que le flux d'événements (`EventSource`) reste ouvert et que la page se redessine pendant un run, qu'un clic sur un bouton de réponse fasse paraître le dialogue de confirmation de Copilot. À vérifier à la main dans l'app, sur un run réel qui attend une ratification d'ADR. La sonde mesure l'ouverture headless et la confirmation demandée depuis la page, pas l'affichage.
- Le canvas sous une session CLI interactive (terminal) : si la TUI demande `requestCanvasRenderer`, si `open_canvas` y est offert au modèle et ce qu'elle fait d'une `url` de canvas. La sonde ne lance pas de TUI.
- Si l'app Copilot passe `host.capabilities.canvases` à `open` : la session SDK headless ne le passe pas (`null`, CLI 1.0.102-1).
- Que le POST d'une réponse porte `Origin: http://127.0.0.1:<port>` dans la webview de l'app : une iframe isolée enverrait `Origin: null`, et chaque réponse serait refusée (voir « Canvas `skraft-pipeline` : modèle de menace et cadre »).
- L'origine qui embarque le panneau dans l'app, dont dépend un `frame-ancestors`.
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
