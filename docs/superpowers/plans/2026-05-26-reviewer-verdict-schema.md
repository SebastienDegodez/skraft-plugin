# Reviewer Verdict Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unifier les verdicts des 5 reviewers `skraft-plugin` autour d'un schéma JSON v1 validé par un renderer Node ESM, et brancher l'orchestrateur pour rendre le Markdown et peupler `state.json`.

**Architecture :** Un nouveau skill `reviewer-verdict-schema` package le schéma + le renderer `render-verdict.mjs` (Node ESM, zéro dep npm). Chaque reviewer émet du JSON via Option C (link + rappel condensé) ; l'orchestrateur exécute le renderer, valide `payload.status`, écrit `state.json::reviewerVerdicts[phase]`. Breaking change, pas de couche de compat.

**Tech Stack :** Node ESM ≥ 20 (built-in `node:test` + `node:assert` pour les tests), template literals, JSON natif, zéro dépendance npm. Spec source : [docs/superpowers/specs/2026-05-26-reviewer-verdict-schema-design.md](../specs/2026-05-26-reviewer-verdict-schema-design.md).

---

## File Structure

**Créés (skill complet) :**
- `plugins/skills/reviewer-verdict-schema/SKILL.md` — entry-point skill, contrat d'invocation, mapping gate→tag par reviewer.
- `plugins/skills/reviewer-verdict-schema/scripts/render-verdict.mjs` — renderer + validateur (autorité unique).
- `plugins/skills/reviewer-verdict-schema/assets/reference/schema-v1.md` — référence humaine.
- `plugins/skills/reviewer-verdict-schema/assets/examples/verdict-approved.json`
- `plugins/skills/reviewer-verdict-schema/assets/examples/verdict-needs-rework.json`
- `plugins/skills/reviewer-verdict-schema/assets/examples/verdict-rejected.json`
- `plugins/skills/reviewer-verdict-schema/assets/examples/verdict-with-dissent.json`
- `plugins/skills/reviewer-verdict-schema/assets/examples/verdict-with-escaping-edge-cases.json`
- `plugins/skills/reviewer-verdict-schema/assets/fixtures/broken-skipped-without-reason.json`
- `plugins/skills/reviewer-verdict-schema/assets/fixtures/broken-unknown-tag.json`
- `plugins/skills/reviewer-verdict-schema/assets/fixtures/broken-lenses-length-mismatch.json`
- `plugins/skills/reviewer-verdict-schema/assets/fixtures/broken-weighted-score.json`
- `plugins/skills/reviewer-verdict-schema/references/render-internals.md` — load-on-demand.
- `plugins/skills/reviewer-verdict-schema/tests/render-verdict.test.mjs` — `node --test`.

**Modifiés :**
- `plugins/skills/adversarial-review-lenses/SKILL.md` — §"Output format" → cross-ref.
- `plugins/agents/backlog-discoverer-reviewer.agent.md` — Option C + skill load + fix enum.
- `plugins/agents/backlog-planner-reviewer.agent.md` — Option C + skill load.
- `plugins/agents/acceptance-designer-reviewer.agent.md` — Option C + skill load.
- `plugins/agents/solution-architect-reviewer.agent.md` — Option C + skill load.
- `plugins/agents/software-engineer-reviewer.agent.md` — Option C + skill load (était déjà JSON).
- `plugins/agents/skraft-orchestrator.agent.md` — Step 3.5 (render), Step 3.6 (validate), Step 4 (state).

**Découpage par responsabilité :** un fichier par lens de validation aurait été plus pur, mais le renderer reste sous ~250 LoC et la cohésion validate↔render est forte ; un seul `render-verdict.mjs` est le bon arbitrage.

---

## Pré-requis — Audit reviewer write capability (Tâche #0)

### Task 0: Audit capacité d'écriture des 5 reviewers

**Files:**
- Read: `plugins/agents/{backlog-discoverer,backlog-planner,acceptance-designer,solution-architect,software-engineer}-reviewer.agent.md`
- Write: `.copilot-tracking/changes/2026-05-26-reviewer-write-audit.md` (journal du résultat)

- [ ] **Step 1 : Inspecter les 5 frontmatter `tools:`**

```bash
grep -A1 '^tools:' plugins/agents/*-reviewer.agent.md
```

Consigner pour chaque reviewer la liste exacte de tools.

- [ ] **Step 2 : Vérifier la présence d'un grant d'écriture**

Le grant attendu est `edit` (idéalement) ou tout autre tool documenté comme permettant d'écrire un fichier. Si aucun reviewer n'a `edit` mais que l'instruction `adversarial-review-lenses` exige d'écrire le `.md`, c'est un bug pré-existant.

- [ ] **Step 3 : Décision**

- **Si tous OK** → marquer audit ✅, continuer Task #1.
- **Si bug pré-existant** → ajouter `edit` à la frontmatter `tools:` des reviewers concernés (correctif scope-limité, à commit séparé `fix(agents): grant edit to reviewers`). Re-run Step 2.

- [ ] **Step 4 : Commit (si correctif appliqué)**

```bash
git add plugins/agents/*-reviewer.agent.md .copilot-tracking/changes/2026-05-26-reviewer-write-audit.md
git commit -m "fix(agents): ensure reviewers have edit tool grant"
```

---

## Phase 1 — Skill scaffolding + renderer (TDD)

### Task 1: Scaffolding du skill `reviewer-verdict-schema`

**Files:**
- Create: `plugins/skills/reviewer-verdict-schema/SKILL.md`
- Create: `plugins/skills/reviewer-verdict-schema/scripts/render-verdict.mjs` (stub)
- Create: `plugins/skills/reviewer-verdict-schema/tests/render-verdict.test.mjs` (stub)

- [ ] **Step 1 : Créer l'arborescence**

```bash
mkdir -p plugins/skills/reviewer-verdict-schema/{scripts,assets/examples,assets/fixtures,assets/reference,references,tests}
```

- [ ] **Step 2 : SKILL.md minimal**

Créer `SKILL.md` avec frontmatter conforme `hve-core/prompt-builder.instructions.md` (name, description impératif avec indirect-trigger). Le contenu détaillé sera ajouté en Task #10 (après que le renderer existe). Pour l'instant : sections vides "Output Format / Mapping gate→tag / Script invocation".

- [ ] **Step 3 : Stub renderer**

```javascript
#!/usr/bin/env node
// render-verdict.mjs — verdict v1 JSON validator + Markdown renderer
const NODE_MIN = 20;
if (Number(process.versions.node.split('.')[0]) < NODE_MIN) {
  console.error(`Node >=${NODE_MIN} required`);
  process.exit(1);
}
// TODO: parseArgs / validate / render
```

- [ ] **Step 4 : Stub test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('placeholder', () => assert.ok(true));
```

- [ ] **Step 5 : Vérifier que le test runner est fonctionnel**

Run: `node --test plugins/skills/reviewer-verdict-schema/tests/`
Expected: `tests 1, pass 1`.

- [ ] **Step 6 : Commit**

```bash
git add plugins/skills/reviewer-verdict-schema/
git commit -m "feat(skills): scaffold reviewer-verdict-schema"
```

### Task 2: Validation — parsing + champs requis racine

**Files:**
- Modify: `plugins/skills/reviewer-verdict-schema/scripts/render-verdict.mjs`
- Modify: `plugins/skills/reviewer-verdict-schema/tests/render-verdict.test.mjs`

- [ ] **Step 1 : Test RED — JSON invalide doit échouer**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../scripts/render-verdict.mjs';

test('JSON.parse failure → validation KO', () => {
  const res = validate('{not json');
  assert.equal(res.ok, false);
  assert.match(res.error, /JSON/);
});

test('missing $schema → KO', () => {
  const res = validate(JSON.stringify({}));
  assert.equal(res.ok, false);
  assert.match(res.error, /\$schema/);
});
```

Run: `node --test plugins/skills/reviewer-verdict-schema/tests/` → FAIL (validate non exporté).

- [ ] **Step 2 : Implémenter `validate(input: string) → {ok, error?, payload?}`**

Définir la liste exhaustive des champs racine requis (cf. spec §"Schéma JSON v1 — racine"). Pour chaque champ manquant → `{ok: false, error: 'missing field: X'}`.

- [ ] **Step 3 : Test PASS + commit**

```bash
git commit -am "feat(verdict-schema): root field validation"
```

### Task 3: Validation — enums (status, tag, lens, phase, depth_tier, gate.status)

**Files:** `render-verdict.mjs`, `render-verdict.test.mjs`

- [ ] **Step 1 : Tests RED — chaque enum hors-domaine doit échouer**

Un test par enum, payload valide partout sauf le champ ciblé.

- [ ] **Step 2 : Implémenter les check `ALLOWED_*` constantes + boucle**

- [ ] **Step 3 : Run + commit**

```bash
git commit -am "feat(verdict-schema): enum validation"
```

### Task 4: Validation — ISO-8601 timestamp

**Files:** `render-verdict.mjs`, `render-verdict.test.mjs`

- [ ] **Step 1 : Test RED — `timestamp: "2026-05-26 10:30:00"` (espace au lieu de T) → KO**

Test PASS — `2026-05-26T10:30:00Z`. Test PASS — `2026-05-26T10:30:00+02:00`. Test KO — `2026-05-26T10:30:00.123Z` (fractions interdites).

- [ ] **Step 2 : Implémenter avec la regex exacte de la spec**

```javascript
const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/;
```

- [ ] **Step 3 : Run + commit**

```bash
git commit -am "feat(verdict-schema): ISO-8601 strict validation"
```

### Task 5: Validation — gates (skipped requires reason, key pattern)

**Files:** `render-verdict.mjs`, `render-verdict.test.mjs`

- [ ] **Step 1 : Tests RED**

- Gate `{status: skipped}` sans `reason` → KO.
- Gate `{status: skipped, reason: "x"}` → OK.
- Clé `gates.G1` OK, clé `gates.foo` → KO.
- `gates: {}` → OK (phase sans gates).

- [ ] **Step 2 : Implémenter `validateGates(gates)`**

- [ ] **Step 3 : Run + commit**

```bash
git commit -am "feat(verdict-schema): gates validation"
```

### Task 6: Validation — `lens_results.length == lenses_executed`

**Files:** `render-verdict.mjs`, `render-verdict.test.mjs`

- [ ] **Step 1 : Test RED — `lenses_executed: 4` mais `lens_results.length: 3` → KO**

- [ ] **Step 2 : Implémenter le check strict**

- [ ] **Step 3 : Run + commit**

```bash
git commit -am "feat(verdict-schema): lens count consistency"
```

### Task 7: Validation — recalcul `weighted_score` (tolérance ±0.01)

**Files:** `render-verdict.mjs`, `render-verdict.test.mjs`

- [ ] **Step 1 : Test RED — payload avec score émis = 0.50 mais recalcul = 0.85 → KO**

Test PASS — émis = 0.85, recalcul = 0.851 (dans tolérance).

- [ ] **Step 2 : Implémenter avec les poids `Completeness 0.30, Business Fit 0.30, Quality 0.15, Risk 0.25`**

- [ ] **Step 3 : Run + commit**

```bash
git commit -am "feat(verdict-schema): weighted score recompute"
```

### Task 8: Validation — règles inter-champs status/findings

**Files:** `render-verdict.mjs`, `render-verdict.test.mjs`

- [ ] **Step 1 : Tests RED**

- `status=APPROVED` + 1 finding `INVARIANT_VIOLATION` → KO.
- `status=APPROVED` + gate `failed` → KO.
- `status=REJECTED` + zéro `INVARIANT_VIOLATION` + zéro `score==0` → KO.

- [ ] **Step 2 : Implémenter `validateStatusConsistency()`**

- [ ] **Step 3 : Run + commit**

```bash
git commit -am "feat(verdict-schema): status consistency rules"
```

### Task 9: Rendu Markdown — template + escaping étage 2

**Files:** `render-verdict.mjs`, `render-verdict.test.mjs`

- [ ] **Step 1 : Test RED — un payload valide produit un MD non-vide avec en-têtes attendus**

```javascript
test('render produces MD with expected sections', () => {
  const md = render(VALID_PAYLOAD);
  assert.match(md, /^# DISCOVER Review/m);
  assert.match(md, /## Gates/);
  assert.match(md, /## Synthesis/);
});
```

- [ ] **Step 2 : Test RED — escaping**

- `description` avec `|` → rendue avec `\|`.
- `description` avec `\n` → rendue avec `<br>`.
- `description` avec ``` ``` ``` → validation KO **avant** render.
- `description` > 500 chars → tronquée + `…`.

- [ ] **Step 3 : Implémenter `render(payload) → string`**

Template literals, sections : header, Gates table, 1 bloc par lens, Synthesis, Dissent. Helpers : `escapeMd(s)`, `cap(s, n)`.

- [ ] **Step 4 : Run + commit**

```bash
git commit -am "feat(verdict-schema): MD renderer with escaping"
```

### Task 10: CLI contract

**Files:** `render-verdict.mjs`, `render-verdict.test.mjs`

- [ ] **Step 1 : Test RED — `--help` affiche l'usage + exit 0**

```javascript
import { spawnSync } from 'node:child_process';
test('--help prints usage', () => {
  const r = spawnSync('node', [SCRIPT, '--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout.toString(), /Usage:/);
});
```

- [ ] **Step 2 : Tests RED supplémentaires**

- `--validate-only --input <fixture-valid>` → exit 0.
- `--validate-only --input <fixture-broken>` → exit 1 + stderr non vide.
- `--input <fixture-valid> --output /tmp/out.md` → exit 0 + fichier créé.
- `--input -` (stdin) → exit 0 si valide.

- [ ] **Step 3 : Implémenter le parser `parseArgs` (manuel, zéro dep)**

Reject toute option non-listée. Exit 1 + message clair sur option inconnue.

- [ ] **Step 4 : Run + commit**

```bash
git commit -am "feat(verdict-schema): CLI entry point"
```

### Task 11: Fixtures examples + broken

**Files:** `assets/examples/*.json` (×5), `assets/fixtures/*.json` (×4)

- [ ] **Step 1 : Créer `verdict-approved.json`**

Payload complet conforme schéma, 4 lenses scores `[1, 1, 1, 1]`, `weighted_score: 1.0`, gates `{G1..G3: pass}`, dissent `""`.

- [ ] **Step 2 : Créer `verdict-needs-rework.json`**

Reprendre l'exemple BEFORE/AFTER de la spec (DISCOVER, `backlog-discoverer-reviewer`, P0-issue-123 manquante).

- [ ] **Step 3 : Créer `verdict-rejected.json`**

≥1 finding `INVARIANT_VIOLATION`, score lens à 0, `status: REJECTED`.

- [ ] **Step 4 : Créer `verdict-with-dissent.json`**

Lenses `[1, 1, 1, 0.5]` mais le `0.5` aurait flippé le verdict si re-pondéré ; `dissent` non vide expliquant le raisonnement.

- [ ] **Step 5 : Créer `verdict-with-escaping-edge-cases.json`**

Description avec `|` et `\n` (triple-backtick **non** inclus — c'est un cas refusé, donc dans `fixtures/broken-*`).

- [ ] **Step 6 : Créer 4 fixtures broken-***

Un par règle critique : `broken-skipped-without-reason`, `broken-unknown-tag`, `broken-lenses-length-mismatch`, `broken-weighted-score`.

- [ ] **Step 7 : Test E2E**

```javascript
test('all examples validate', () => {
  for (const f of fs.readdirSync(EXAMPLES_DIR)) {
    const r = spawnSync('node', [SCRIPT, '--validate-only', '--input', join(EXAMPLES_DIR, f)]);
    assert.equal(r.status, 0, `${f} should validate`);
  }
});

test('all broken fixtures fail', () => {
  for (const f of fs.readdirSync(FIXTURES_DIR)) {
    const r = spawnSync('node', [SCRIPT, '--validate-only', '--input', join(FIXTURES_DIR, f)]);
    assert.equal(r.status, 1, `${f} should fail`);
  }
});
```

- [ ] **Step 8 : Run + commit**

```bash
git commit -am "test(verdict-schema): full fixtures suite"
```

### Task 12: SKILL.md + assets/reference/schema-v1.md complets

**Files:** `SKILL.md`, `assets/reference/schema-v1.md`, `references/render-internals.md`

- [ ] **Step 1 : Étoffer `SKILL.md`**

Sections : Quand l'utiliser, contrat d'invocation reviewer, mapping gate→tag (1 table par reviewer — 5 tables), pointer vers `assets/reference/schema-v1.md` et `references/render-internals.md`.

- [ ] **Step 2 : Rédiger `assets/reference/schema-v1.md`**

Reprise condensée de la §"Schéma JSON v1 — référence" de la spec (tables racine / GateEntry / LensResult / Finding / Synthesis / règles).

- [ ] **Step 3 : Rédiger `references/render-internals.md`**

Décrit la structure interne du template Markdown produit (load-on-demand, pour le maintainer).

- [ ] **Step 4 : Commit**

```bash
git add plugins/skills/reviewer-verdict-schema/
git commit -m "docs(verdict-schema): finalize SKILL.md and references"
```

---

## Phase 2 — Réconciliation `adversarial-review-lenses`

### Task 13: Cross-ref dans `adversarial-review-lenses/SKILL.md`

**Files:** `plugins/skills/adversarial-review-lenses/SKILL.md`

- [ ] **Step 1 : Lire la §"Output format" actuelle**

- [ ] **Step 2 : Remplacer le bloc par**

```markdown
## Output format

Verdict written as JSON v1 — see [`reviewer-verdict-schema`](../reviewer-verdict-schema/SKILL.md). The reviewer emits only the JSON; the orchestrator renders the Markdown via `render-verdict.mjs`.
```

- [ ] **Step 3 : Commit**

```bash
git commit -am "refactor(adversarial-review-lenses): defer output format to verdict-schema skill"
```

---

## Phase 3 — Migration des 5 reviewers (Option C)

> **Pattern commun pour tasks 14–18 :** ajouter `reviewer-verdict-schema` au bloc MANDATORY skill-loading + remplacer la §"Output Format" par le bloc rappel JSON v1 défini dans la spec §"Modification des agents reviewers". Un commit par reviewer.

### Task 14: Migrer `backlog-discoverer-reviewer.agent.md` (corrige enum)

**Files:** `plugins/agents/backlog-discoverer-reviewer.agent.md`

- [ ] **Step 1 : Repérer l'ancien bloc Output (YAML inline avec `verdict: approved|changes_requested|rejected`)**

- [ ] **Step 2 : Remplacer par le bloc Option C**

Vocabulaire passe de `changes_requested` → `NEEDS_REWORK`. Documenter dans le message de commit.

- [ ] **Step 3 : Ajouter `reviewer-verdict-schema` à la frontmatter / liste skills**

- [ ] **Step 4 : Test fumée**

Demander à un sub-Explore : « dans cet agent, le bloc Output Format ne mentionne plus `approved|changes_requested|rejected` ? le skill `reviewer-verdict-schema` est-il listé ? » Confirmer.

- [ ] **Step 5 : Commit**

```bash
git commit -am "feat(backlog-discoverer-reviewer): JSON v1 verdict + enum fix (BREAKING)"
```

### Task 15: Migrer `backlog-planner-reviewer.agent.md`

**Files:** `plugins/agents/backlog-planner-reviewer.agent.md`

- [ ] **Step 1 : Lire l'ancien bloc Output (YAML, champs `story/criterion/ac/dor_item/antipattern`)**
- [ ] **Step 2 : Remplacer par le bloc Option C. Documenter le mapping : ces champs passent dans `findings[*].extras`.**
- [ ] **Step 3 : Skill load**
- [ ] **Step 4 : Commit**

```bash
git commit -am "feat(backlog-planner-reviewer): JSON v1 verdict (BREAKING)"
```

### Task 16: Migrer `acceptance-designer-reviewer.agent.md`

**Files:** `plugins/agents/acceptance-designer-reviewer.agent.md`

- [ ] **Step 1 : Lire l'ancien bloc Output (YAML, `finding: ...`)**
- [ ] **Step 2 : Remplacer par bloc Option C ; champ `finding` ancien → `description` nouveau**
- [ ] **Step 3 : Skill load**
- [ ] **Step 4 : Commit**

```bash
git commit -am "feat(acceptance-designer-reviewer): JSON v1 verdict (BREAKING)"
```

### Task 17: Migrer `solution-architect-reviewer.agent.md`

**Files:** `plugins/agents/solution-architect-reviewer.agent.md`

- [ ] **Step 1 : Lire l'ancien bloc (YAML, `confidence` top-level)**
- [ ] **Step 2 : Remplacer par bloc Option C ; `confidence` est drop (cf. spec §"Champs abandonnés"). Signal capté par `weighted_score`. Ajouter si pertinent à `synthesis.headline`.**
- [ ] **Step 3 : Skill load**
- [ ] **Step 4 : Commit**

```bash
git commit -am "feat(solution-architect-reviewer): JSON v1 verdict, drop confidence (BREAKING)"
```

### Task 18: Migrer `software-engineer-reviewer.agent.md`

**Files:** `plugins/agents/software-engineer-reviewer.agent.md`

- [ ] **Step 1 : Lire l'ancien bloc (JSON inline ad-hoc, `lens_results.verdict: pass/fail`)**
- [ ] **Step 2 : Remplacer par bloc Option C. `verdict: pass/fail` ancien → `score: 0|0.5|1`. `dissent_analysis` ancien → `dissent`.**
- [ ] **Step 3 : Skill load**
- [ ] **Step 4 : Commit**

```bash
git commit -am "feat(software-engineer-reviewer): JSON v1 verdict (BREAKING)"
```

---

## Phase 4 — Orchestrateur

### Task 19: Ajouter Step 3.5 / 3.6 / 4 dans `skraft-orchestrator.agent.md`

**Files:** `plugins/agents/skraft-orchestrator.agent.md`

- [ ] **Step 1 : Lire la section actuelle "Phase 4 / Handle verdict"**

- [ ] **Step 2 : Ajouter §"Convention de chemin"**

Reprendre le bloc déterministe `.copilot-tracking/skraft-plans/{project_slug}/reviews/{YYYY-MM-DD}/{phase}-review-{N}.json` de la spec.

- [ ] **Step 3 : Ajouter Step 3.5 — Render verdict**

Texte exact :

```markdown
After dispatching the reviewer, build the deterministic path from state.json::projectSlug, state.currentReviewDate, current phase, and state.retryCount[phase] + 1. Then execute:

  node plugins/skills/reviewer-verdict-schema/scripts/render-verdict.mjs --input <verdict.json> --output <verdict.md>

If exit code ≠ 0, phase = error; do not advance.
```

- [ ] **Step 4 : Ajouter Step 3.6 — Validate status enum (portée réduite)**

```markdown
Parse the JSON file. Extract payload.status. Confirm it matches exactly one of {APPROVED, NEEDS_REWORK, REJECTED}. If any check fails, set state.json::reviewerVerdicts[phase] = null and mark phase error.
```

- [ ] **Step 5 : Mettre à jour Step 4 — Update state**

```markdown
If Step 3.5 exit 0 AND Step 3.6 OK, write state.json::reviewerVerdicts[phase] = payload.status. Otherwise leave null.
```

- [ ] **Step 6 : Test fumée**

Sub-Explore : « le workflow décrit les trois étapes Step 3.5 / 3.6 / 4 dans l'ordre et avec le chemin déterministe ? »

- [ ] **Step 7 : Commit**

```bash
git commit -am "feat(skraft-orchestrator): wire render-verdict + state validation"
```

---

## Phase 5 — Documentation et manifestes

### Task 20: Mettre à jour `docs/agents/*.md` + `docs/architecture.md` si nécessaire

**Files:** `docs/agents/*-reviewer.md`, `docs/architecture.md`

- [ ] **Step 1 : Grep des références à l'ancien format**

```bash
grep -rE 'verdict:.*(approved|changes_requested|rejected)' docs/
```

- [ ] **Step 2 : Pour chaque match, remplacer par les nouvelles valeurs**

- [ ] **Step 3 : Commit**

```bash
git commit -am "docs: align reviewer verdict references with JSON v1"
```

### Task 21: Mettre à jour `plugins/collections/*` (si applicable)

**Files:** rechercher d'abord avec `find plugins -name '*.collection.yml' -o -name '*.collection.md'`.

- [ ] **Step 1 : Vérifier si un manifest skraft liste les skills**

- [ ] **Step 2 : Si oui, ajouter `reviewer-verdict-schema` (kind: skill)**

- [ ] **Step 3 : Commit**

```bash
git commit -am "chore(collections): register reviewer-verdict-schema"
```

### Task 22: Mettre à jour `docs/superpowers/journal/`

**Files:** `docs/superpowers/journal/2026-05-26-reviewer-verdict-schema.md`

- [ ] **Step 1 : Créer une entrée journal résumant les changements + lien vers spec et plan**

- [ ] **Step 2 : Commit**

```bash
git commit -am "docs(journal): record reviewer-verdict-schema migration"
```

---

## Phase 6 — Validation end-to-end

### Task 23: Smoke test intégration orchestrateur ↔ reviewer

**Files:** un fichier de scénario manuel `docs/superpowers/plans/2026-05-26-reviewer-verdict-schema-e2e.md` (optionnel) ; sinon décrit verbalement.

- [ ] **Step 1 : Préparer un payload JSON v1 conforme pour la phase DISCOVER**
- [ ] **Step 2 : Le placer manuellement au chemin déterministe attendu**
- [ ] **Step 3 : Invoquer l'orchestrateur sur cette phase**
- [ ] **Step 4 : Confirmer**
  - Le `.md` est rendu au même répertoire.
  - `state.json::reviewerVerdicts.DISCOVER` est peuplé avec la valeur du `status`.
- [ ] **Step 5 : Répéter avec un payload malformé → confirmer `reviewerVerdicts.DISCOVER = null` et message d'erreur clair.**

Aucun commit (smoke test live).

---

## Remember

- Exact file paths always.
- Code complet dans le plan, pas "ajouter validation".
- Commandes exactes avec sortie attendue.
- DRY, YAGNI, TDD, commits fréquents (1 par task — chaque task se commit indépendamment).
- Breaking change assumé : pas de couche de compatibilité YAML→JSON.

## Plan Review Loop

Après écriture du plan, dispatch d'un sub-reviewer (Explore agent en mode review) pour vérifier alignment plan ↔ spec. Si NEEDS_REWORK, corriger et re-dispatcher (max 3 itérations). Si APPROVED, passer au handoff exécution.
