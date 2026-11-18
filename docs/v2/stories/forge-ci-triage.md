# Story — Forge-driven CI triage-and-design dispatcher for V2

## Why

Aujourd'hui, les issues du scope V2 (épic `#211` et ses lots `#212–#223`) sont
traitées à la main : un humain ouvre `skraft-demarrer`, les agents
`solution-researcher` et `solution-architect` tournent sur sa machine, et si
l'un ou l'autre détecte une zone d'ombre, il émet un `{"status":"blocked",
summary}` que l'engine transforme en `question.asked`. Cette question reste
coincée dans son terminal : rien n'atterrit sur l'issue qui l'a motivée,
l'équipe ne voit rien, et un run ne peut pas être repris par quelqu'un
d'autre.

On veut lancer la même séquence en CI, sur toutes les issues V2 ouvertes, et
que les questions agentiques atterrissent sur l'issue concernée.

## What

Ajouter un dispatcher GitHub Actions `workflow_dispatch` qui :

1. Liste les issues ouvertes du scope V2 (épic `#211` + lots), via
   `gh search issues ... --match body "Refs #<epic>"` filtré sur `^Lot `. Un
   fallback `docs/v2/lots.json` dépanne si la recherche renvoie vide.
2. Pour chaque issue, lance le workflow skraft `epic-design.skraft.dot`
   (futur, story d'hier) en mode **forge-ci** : les agents tournent dans le
   runner, un host Claude Code (ou Copilot) y est installé, le secret
   `ANTHROPIC_API_KEY` est passé en env.
3. Quand l'engine arrive à un nœud `ask` (le `solution-researcher` ou le
   `solution-architect` s'est bloqué, ou l'ADR a besoin d'être ratifiée), un
   nouvel adaptateur `HumanInteraction` publie la question en comment sur
   l'issue et pose le label `needs-clarification`. Le run sort
   `status: 'waiting'`, exit code 0.
4. L'humain répond sur l'issue par un comment commençant par `/skraft-answer
   <key> <OPTION> [reason: <text>]`. Au prochain dispatch, une sous-commande
   `skraft forge answer --issue <n>` lit ce comment et appelle
   `createDecide(...).decide(...)`. Le run reprend, le pipeline continue, et
   quand il atteint la fin, `pr-writer` + `publish` sortent la PR de l'épic.

## Done criteria

### Domaine

- `HUMAN_PROVENANCES` dans `engine/domain/journal/run-state.mjs` inclut
  `'forge-comment'`. Le reste du domaine n'est pas touché.

### Ports et adaptateurs

- `application/ports/code-host.mjs` déclare deux nouvelles méthodes :
  `addLabel(number, label)` et `listComments(number)`.
- `infrastructure/code-host/gh-code-host.mjs` les implémente via `gh api
  --method POST repos/<r>/issues/<n>/labels` et `gh api repos/<r>/issues/<n>/comments
  --paginate`. Les deux appels sont whitelistés par
  `skills/github-forge-writes/SKILL.md` — aucune autre écriture sur l'issue.

### Driver nouveau

- `engine/drivers/forge-ci/forge-human.mjs` implémente
  `HumanInteraction` : à chaque `ask`, il poste (ou met à jour) un comment
  dont la première ligne est `<sub>skraft-ask key=<question.key>
  run=<slug> step=<question.step></sub>`, liste `question.text` + options en
  task-list + un gabarit `/skraft-answer <key> <OPTION> [reason: <text>]`,
  pose le label `needs-clarification`, et retourne `null`.
- `engine/drivers/forge-ci/forge-ci-driver.mjs` compose l'adaptateur avec le
  `codeHost` existant.
- `engine/drivers/forge-ci/one-pass.mjs` lance `createRunPipeline({
  ...adapters, human }).run({})` **une seule fois** (pas de boucle agent).
- `engine/drivers/forge-ci/scope-discovery.mjs` filtre les lots depuis la
  réponse `gh search issues` et fournit le fallback `docs/v2/lots.json`.

### CLI

- Deux nouvelles rows dans `TABLE` de `drivers/cli/run-cli.mjs` :
  - `skraft forge run <workflow> --issue <n>` — ouvre/reprend le run,
    lance une passe, émet le `RunOutcome` en JSON sur stdout, exit 0 sur
    `done`/`waiting`/`blocked:environment`.
  - `skraft forge answer --issue <n>` — lit les comments de l'issue,
    trouve le dernier commençant par `/skraft-answer`, appelle
    `createDecide(...).decide({ key, answer, reason, by:'forge-comment' })`.
- `skraft commands --json` liste les deux.

### GitHub Actions

- `.github/workflows/skraft-triage-and-design.yml`, `workflow_dispatch`
  seulement, inputs `epic` (default `211`), `workflow` (default
  `epic-design`), `max_parallel` (default `3`), `dry_run` (default `false`).
- Permissions `issues: write`, `pull-requests: write`, `contents: write`.
- `concurrency: skraft-triage-${{ inputs.epic }}`,
  `cancel-in-progress: false`.
- Deux jobs : `scope` (produit la matrix) et `run` (matrix, `max-parallel`,
  `actions/checkout`, `setup-node`, `npm ci --prefix plugins/skraft-framework/engine`,
  installation du host, `skraft forge answer` puis `skraft forge run`).
- Secrets requis : `ANTHROPIC_API_KEY`. Le label `needs-clarification` est créé
  à la première pose.
- Invocation `node "<absolute>" <subcommand>` — jamais `shell: true`, jamais
  d'env var côté agent (règles de portabilité AGENTS.md).

### Scope V2

- Requête primaire `gh search issues --repo <r> --state open --json
  number,title --match body "Refs #${epic}"`, filtrage `jq` sur `^Lot `.
- Fallback `docs/v2/lots.json` (hand-maintained,
  `{"epic":211,"lots":[{"issue":212},…]}`), warning CI non bloquant.

### Tests

- `tests/skraft-framework/unit/forge-ci/forge-human.test.mjs` : entre par
  `createRunPipeline`, InMemory `TrackingFiles` et `CommandRunner` scripté ;
  séquence `step.started → ask → question.asked` ; assertions sur les argv
  `gh` (POST comments, POST labels) et `null` retourné → `waiting`. Deuxième
  passe sur la même key → PATCH, pas de second POST (idempotence).
- `tests/skraft-framework/unit/forge-ci/forge-answer.test.mjs` : entre par
  `createDecide`, feed des comments scriptés avec `/skraft-answer K1 YES`,
  assertion `question.answered { by:'forge-comment' }`.
- `tests/skraft-framework/unit/forge-ci/scope-discovery.test.mjs` : filtre
  des lots + fallback `lots.json`.
- `tests/skraft-framework/integration/forge-ci/forge-run-end-to-end.test.mjs` :
  vrai process `skraft.mjs` sur HOME temporaire, `gh` stub sur PATH qui
  enregistre argv et renvoie du JSON scripté ; assertions journal sur disque
  + exit code 0 ; tourne sur Linux, macOS, Windows.
- Pas de test du YAML.

### Lint et portabilité

- `npm run lint:engine` vert : 12 lignes / 12 statements / complexité 8 /
  profondeur 3, aucun `eslint-disable`.
- Tests verts sur les trois OS (ajouter la couverture dans
  `skraft-framework-ci.yml` si besoin).
- `claude plugin validate plugins/skraft-framework` reste vert.

### Routing

Le dispatcher invoque `skraft forge run --workflow <name> --issue <n>`.
`<name>` est un fichier `.skraft.dot` du plugin :

- `--workflow epic-design` (défaut du YAML) → `epic-design.skraft.dot`
  (livré par ce lot) : architecture end to end avec PR d'architecture.
- `--workflow pipeline` → `pipeline.skraft.dot` (inchangé) : run complet
  d'une story, pour les cas où l'architecture n'est pas séparée.
- `--workflow epic-story` → `epic-story.skraft.dot` (livré par ce lot) :
  delivery-only, exige `architecture` et `story` en inputs runtime —
  aujourd'hui pas atteignable sans init-time brief lookup (A2 #624).

Les commandes futures `skraft architecture --issue|--epic` (A5 #627) et
`skraft run --issue` (A2 #624) choisiront le workflow sans passer par
`forge run`, et appelleront la bonne commande selon le contexte.

### Dépendance et non-scope

- **Dépendances satisfaites** : `plugins/skraft-framework/workflows/epic-design.skraft.dot`
  et `.../epic-story.skraft.dot` sont livrés par ce même lot (dossier
  `workflows/`).
- **Hors scope** : commande dédiée `skraft architecture` (A5 #627),
  lookup init-time du brief (A2 #624), nœud readiness (A3 #625),
  support Azure DevOps complet (A4 #626) — chacun son lot.

### PR

- Branche : `v2/lot-12-forge-ci-triage` depuis `integration/v2-next`.
- Titre : `feat(engine): forge-driven CI triage dispatcher for V2 issues`.
- Corps : `Refs #211`, pas de `Closes`.
