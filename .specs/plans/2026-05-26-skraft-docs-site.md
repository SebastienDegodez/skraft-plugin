# Site de documentation SKRAFT — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publier un site Jekyll public bilingue FR/EN documentant le pipeline SKRAFT, **hébergé directement depuis le repo `skraft-plugin`** sur GitHub Pages. Aucun sync cross-repo. Le design (palette, tokens, layout glass) est **copié (vendored)** depuis le portfolio pour garantir la cohérence visuelle.

**Architecture:** Site Jekyll standalone dans `skraft-plugin/docs/site/`. Publication GitHub Pages via une GitHub Action qui build et déploie vers la branche `gh-pages` (mode « build with Actions »), ce qui permet de garder un dossier source non-conventionnel et d'exclure proprement les artefacts internes (`docs/superpowers/**`, `docs/agents/**`, `docs/skills/**`, `docs/journal/**`, etc.). URL publique : `https://sebastiendegodez.github.io/skraft-plugin/`. Design **vendored** : `design-tokens.css` et un layout `default.html` adapté sont copiés depuis le portfolio dans `docs/site/assets/css/` et `docs/site/_layouts/`. i18n via deux arborescences `/fr/` `/en/` sans plugin.

**Tech Stack:** Jekyll 4.x · kramdown · GitHub Pages (déploiement Actions) · Node.js (lint citations) · Playwright (smoke tests) · Mermaid via partial `_includes/mermaid.html`.

**Spec source de vérité :** `docs/superpowers/specs/2026-05-26-skraft-docs-site.md`. Toute divergence se résout en faveur de la spec.

**Repo touché — un seul :**

- `skraft-plugin` — branche `feat/docs-site`. Reçoit `docs/site/**` (site Jekyll complet, design vendored compris), `scripts/check-citations.mjs` (lint), `scripts/check-design-drift.mjs` (lint optionnel de drift design vs portfolio), `tests/site/` (Playwright), `.github/workflows/site-ci.yml`, `.github/workflows/pages-deploy.yml`.

**Politique de cohérence design (sans sync automatique) :**

1. `design-tokens.css` du portfolio est copié bit-pour-bit dans `docs/site/assets/css/design-tokens.css` avec un en-tête de commentaire : `/* VENDORED FROM SebastienDegodez.github.io@<sha> on <date>. Do not edit. Resync manually if portfolio changes. */`.
2. Un script optionnel `scripts/check-design-drift.mjs` peut comparer (via clone éphémère du portfolio) le hash du fichier vendored avec celui du portfolio et émettre un **warning** (jamais un fail) dans la CI.
3. Toute mise à jour visuelle se fait par re-copie manuelle (1 commande documentée) — pas de pipeline automatique.

**Hard-rules :**

- Aucun schéma sans plan GENESIS persisté sous `docs/superpowers/plans/{date}-{slug}-genesis.md` (cf. spec §4.3).
- Aucune citation sans entrée correspondante dans `docs/site/_data/citations.yml` (lint §4.2).
- Aucun fichier sous `docs/superpowers/**`, `docs/agents/**`, `docs/skills/**`, `docs/journal/**` exposé sur le site (exclusion via `_config.yml`).
- Le fichier `design-tokens.css` vendored n'est **jamais** édité localement : toute correction se fait en amont (portfolio) puis re-copie.
- DRY · YAGNI · TDD pour le code (script lint + smoke tests). Pages éditoriales : revue manuelle contre critères §9.

---

## Carte des fichiers

### Dans `skraft-plugin`

| Fichier | Responsabilité |
| --- | --- |
| `docs/site/_data/citations.yml` | Bibliographie canon (28 entrées spec §6) — source de vérité pour le lint. |
| `docs/site/_data/nav.yml` | Structure de navigation (sections principales, ordre, libellés FR/EN). |
| `docs/site/_data/personas.yml` | 4 personae (spec §2). |
| `docs/site/fr/index.md` | Landing « SKRAFT en 15 min » (FR). |
| `docs/site/en/index.md` | Landing (EN). |
| `docs/site/fr/pour-decideurs.md` | Pitch décideur SCQA (spec §2.1). |
| `docs/site/en/for-executives.md` | idem (EN). |
| `docs/site/fr/pipeline/index.md` + `fr/pipeline/{discover,discuss,design,distill,deliver}.md` | Une page par phase. |
| `docs/site/fr/architecture.md` | Vue orchestrateur ↔ agents ↔ reviewers (schéma GENESIS). |
| `docs/site/fr/concepts.md` | Use Case, CQS, CQRS, Walking Skeleton, Mutation, Object Calisthenics (spec §5.2). |
| `docs/site/fr/customisation.md` | L1/L2/L3 + invariants opposables (spec §5.1, §5.3, §5.4). |
| `docs/site/fr/reference/agents/{name}.md` | 1 par agent (template §4.4). 12 agents min. |
| `docs/site/fr/reference/skills/{name}.md` | 1 par skill (template §4.4). 5 skills min. |
| `docs/site/fr/getting-started.md` | Installation locale, premier `/skraft`. |
| `docs/site/fr/contributing.md` | Comment proposer une PR doc. |
| `docs/site/fr/changelog.md` | Versions publiées (initialement vide). |
| `docs/site/fr/citations.md` | Index citations (généré à partir de `citations.yml`). |
| `docs/site/_layouts/default.html` | Layout principal, **vendored** depuis portfolio + adapté (nav latérale SKRAFT, lang toggle). |
| `docs/site/assets/css/design-tokens.css` | **Vendored** depuis portfolio, ne pas éditer. |
| `docs/site/assets/css/site.css` | CSS spécifique site SKRAFT (au-dessus des tokens vendored). |
| `docs/site/_includes/mermaid.html` | Partial Mermaid (chargement CDN + init). |
| `docs/site/_includes/lang-toggle.html` | Sélecteur FR/EN. |
| `docs/site/_includes/citation.html` | Macro pour citation formatée. |
| `docs/site/_config.yml` | Config Jekyll standalone (baseurl, exclude internal docs, collections, defaults). |
| `docs/site/Gemfile` | Dépendances Jekyll pour build local + Actions. |
| `scripts/check-citations.mjs` | Lint : chaque `> — Auteur, …` dans `docs/site/**/*.md` existe dans `citations.yml`. |
| `scripts/check-design-drift.mjs` | Optionnel. Diff `design-tokens.css` vendored vs portfolio (warning only). |
| `scripts/vendor-design-from-portfolio.sh` | Procédure documentée de re-copie manuelle du design. |
| `tests/site/check-citations.test.mjs` | Tests unitaires du lint. |
| `tests/site/smoke.spec.mjs` | Playwright smoke (home FR, home EN, pipeline, un agent ref). |
| `playwright.config.mjs` | Config Playwright (`baseURL` = preview Jekyll local OR URL GH Pages). |
| `.github/workflows/site-ci.yml` | CI sur PR : lint citations + build Jekyll + smoke tests Playwright. |
| `.github/workflows/pages-deploy.yml` | Déploiement GH Pages sur push `main` (build Jekyll → upload artifact → deploy). |

---

## Tâche 1 : Scaffolding sources Jekyll dans `skraft-plugin`

**Files:**
- Create: `skraft-plugin/docs/site/_config-fragment.yml`
- Create: `skraft-plugin/docs/site/_data/citations.yml`
- Create: `skraft-plugin/docs/site/_data/nav.yml`
- Create: `skraft-plugin/docs/site/_data/personas.yml`
- Create: `skraft-plugin/docs/site/_includes/{mermaid,lang-toggle,citation}.html`
- Create: `skraft-plugin/docs/site/_layouts/skraft.html`

- [ ] **Step 1.1 : Créer la branche**

```bash
cd skraft-plugin
git checkout -b feat/docs-site
```

- [ ] **Step 1.2 : Créer `_data/citations.yml` à partir de la bibliographie §6**

Format YAML d'une entrée :

```yaml
- key: forsgren-accelerate-2018
  authors: "Forsgren, N., Humble, J., & Kim, G."
  year: 2018
  title: "Accelerate: The Science of Lean Software and DevOps"
  type: book
```

Inclure les 28 entrées spec §6 (de Abelson 1985 à Wiegers 2002).

- [ ] **Step 1.3 : Créer `_data/personas.yml`**

```yaml
- key: tech-lead
  name_fr: "Tech Lead"
  name_en: "Tech Lead"
  need_fr: "Comprendre l'architecture en 15 minutes"
  citation_key: maclane-categories-1971
- key: software-engineer
  name_fr: "Software Engineer"
  …
- key: reviewer
  …
- key: manager
  name_fr: "Manager / Décideur"
  name_en: "Manager / Executive"
  need_fr: "Argumentaire chiffré en 5 minutes pour pousser ses équipes"
  citation_key: forsgren-accelerate-2018
```

- [ ] **Step 1.4 : Créer `_data/nav.yml`**

Refléter l'IA §3 : 11 sections + ajout `/pour-decideurs`. Chaque entrée a `path_fr`, `path_en`, `title_fr`, `title_en`.

- [ ] **Step 1.5 : Créer les includes**

`_includes/mermaid.html` :

```html
<div class="mermaid">{{ include.code }}</div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>mermaid.initialize({ startOnLoad: true, theme: 'dark' });</script>
```

`_includes/lang-toggle.html` : toggle qui swap segment d'URL `/fr/` ↔ `/en/`.

`_includes/citation.html` : prend `key`, lookup dans `site.data.citations`, rend le bloc citation formaté §4.2.

- [ ] **Step 1.6 : Stub `_layouts/default.html`**

Créer un fichier marqueur `_layouts/default.html` contenant uniquement `{{ content }}` + un commentaire `<!-- PLACEHOLDER. Replaced by vendored layout in Tâche 7. -->`. Permet aux pages créées en Tâches 3-6 de builder localement avant le vendoring final.

- [ ] **Step 1.7 : Créer `_config.yml` + `Gemfile`**

`docs/site/_config.yml` :

```yaml
title: "SKRAFT"
description: "Pipeline SDLC piloté par agents IA — documentation publique"
baseurl: "/skraft-plugin"
url: "https://sebastiendegodez.github.io"
lang: fr

markdown: kramdown
kramdown:
  input: GFM
  syntax_highlighter: rouge

collections: {}

defaults:
  - scope: { path: "fr" }
    values: { lang: fr, layout: default }
  - scope: { path: "en" }
    values: { lang: en, layout: default }

exclude:
  - Gemfile
  - Gemfile.lock
  - node_modules
  - vendor
  - README.md
```

`docs/site/Gemfile` :

```ruby
source "https://rubygems.org"
gem "jekyll", "~> 4.3"
gem "webrick", "~> 1.8"
```

- [ ] **Step 1.8 : Commit**

```bash
git add docs/site
git commit -m "feat(site): scaffold standalone Jekyll site for SKRAFT docs"
```

---

## Tâche 2 : Script de lint des citations (TDD)

**Files:**
- Create: `skraft-plugin/scripts/check-citations.mjs`
- Create: `skraft-plugin/tests/site/check-citations.test.mjs`
- Create: `skraft-plugin/tests/site/fixtures/citations.yml`
- Create: `skraft-plugin/tests/site/fixtures/good-page.md`, `bad-page.md`

- [ ] **Step 2.1 : Écrire le test qui échoue**

```javascript
// tests/site/check-citations.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCitations } from '../../scripts/check-citations.mjs';

test('passes when all citations exist in bibliography', async () => {
  const result = await checkCitations({
    citationsPath: 'tests/site/fixtures/citations.yml',
    pagesGlob: 'tests/site/fixtures/good-page.md',
  });
  assert.equal(result.errors.length, 0);
});

test('fails when a quote references unknown author', async () => {
  const result = await checkCitations({
    citationsPath: 'tests/site/fixtures/citations.yml',
    pagesGlob: 'tests/site/fixtures/bad-page.md',
  });
  assert.ok(result.errors.length > 0);
  assert.match(result.errors[0].message, /unknown citation/i);
});

test('fails when quote exceeds 25 words', async () => {
  // page contenant une citation > 25 mots
  …
});
```

- [ ] **Step 2.2 : Créer les fixtures**

`fixtures/citations.yml` : 2 entrées minimales (ex. Beck, Fowler).

`fixtures/good-page.md` : 1 citation valide.

`fixtures/bad-page.md` : 1 citation non référencée + 1 citation > 25 mots.

- [ ] **Step 2.3 : Lancer le test, vérifier l'échec**

```bash
node --test tests/site/check-citations.test.mjs
```

Expected: FAIL (`checkCitations` undefined).

- [ ] **Step 2.4 : Implémenter `check-citations.mjs`**

Logique minimale :
1. Charger `citations.yml` → map par `authors lastname + year`.
2. Parser chaque `.md` matché par glob, extraire les blocs `> — Auteur, *Titre*, année`.
3. Pour chaque bloc : (a) auteur/année trouvés dans la map ? (b) longueur du `> «  »` ≤ 25 mots ?
4. Retourner `{ errors: [...] }` puis exit non-zéro côté CLI.

- [ ] **Step 2.5 : Tests passent**

```bash
node --test tests/site/check-citations.test.mjs
```

Expected: PASS.

- [ ] **Step 2.6 : Lancer le lint sur les sources de la Tâche 1**

```bash
node scripts/check-citations.mjs --citations docs/site/_data/citations.yml --pages "docs/site/**/*.md"
```

Expected: 0 erreurs (pages encore vides à ce stade).

- [ ] **Step 2.7 : Commit**

```bash
git add scripts/check-citations.mjs tests/site
git commit -m "feat(site): citation linter (TDD)"
```

---

## Tâche 3 : Pages cœur — landing, pitch décideur, pipeline

**Files:**
- Create: `docs/site/fr/index.md`, `docs/site/en/index.md`
- Create: `docs/site/fr/pour-decideurs.md`, `docs/site/en/for-executives.md`
- Create: `docs/site/fr/pipeline/index.md` + 5 sous-pages
- Create: `docs/superpowers/plans/2026-05-26-pipeline-spiral-genesis.md` (plan GENESIS du schéma pipeline)

- [ ] **Step 3.1 : Plan GENESIS pour le schéma « spirale du pipeline »**

Suivre le SKILL GENESIS (8 étapes). Produire le mermaid + interface sketch + plan persisté.

- [ ] **Step 3.2 : Écrire `fr/index.md`**

Front-matter :
```yaml
---
layout: skraft
lang: fr
title: "SKRAFT en 15 minutes"
persona: tech-lead
---
```

Contenu : exec summary, persona en-tête, lien vers `/pour-decideurs`, lien vers `/pipeline`. Cite 1 source max (cf. règle §4.2 : citation = justification).

- [ ] **Step 3.3 : Écrire `fr/pour-decideurs.md`**

Reprendre **mot pour mot** la structure §2.1 de la spec : SCQA + 3 leviers + ROI DORA + engagement sponsor. Toutes les citations doivent référencer `citations.yml`.

- [ ] **Step 3.4 : Écrire `fr/pipeline/index.md`**

Schéma GENESIS (mermaid embedded). Pour chaque phase, lien vers sa sous-page + une phrase d'invariant.

- [ ] **Step 3.5 : Écrire les 5 sous-pages `fr/pipeline/{phase}.md`**

Pour chaque phase :
- Trigger d'entrée, artefact attendu en sortie.
- Agent(s) responsable(s).
- Reviewer associé (CQS §5.2).
- 1 citation qui défend l'existence de cette phase.

- [ ] **Step 3.6 : Traductions EN équivalentes**

`en/index.md`, `en/for-executives.md`, `en/pipeline/*` — citations identiques (anglais original), prose traduite.

- [ ] **Step 3.7 : Lint citations**

```bash
node scripts/check-citations.mjs --citations docs/site/_data/citations.yml --pages "docs/site/**/*.md"
```

Expected: 0 erreurs.

- [ ] **Step 3.8 : Commit**

```bash
git add docs/site docs/superpowers/plans/2026-05-26-pipeline-spiral-genesis.md
git commit -m "feat(site): landing, exec pitch, pipeline pages (FR+EN)"
```

---

## Tâche 4 : Pages architecturales — `/architecture` et `/concepts`

**Files:**
- Create: `docs/site/fr/architecture.md` + EN
- Create: `docs/site/fr/concepts.md` + EN
- Create: `docs/superpowers/plans/2026-05-26-architecture-flow-genesis.md` (plan GENESIS)

- [ ] **Step 4.1 : Plan GENESIS pour `/architecture`**

Schéma : Orchestrateur (commande) ↔ Agents executors (écriture) ↔ State.json (read model) ↔ Reviewers (lecture seule). CQS visible dans le diagramme. Persister le plan GENESIS.

- [ ] **Step 4.2 : Écrire `fr/architecture.md`**

Inclure le schéma. Légender chaque arête. Référencer §5.2 de la spec pour le détail CQS/CQRS.

- [ ] **Step 4.3 : Écrire `fr/concepts.md`**

6 sous-sections : Use Case, CQS, CQRS, Walking Skeleton, Mutation, Object Calisthenics. Chacune avec **sa citation originelle** (cf. spec §5.2 / §5.3). C'est la page la plus citation-dense ; elle est la pierre de touche du lint.

- [ ] **Step 4.4 : Traductions EN**

- [ ] **Step 4.5 : Lint + commit**

```bash
node scripts/check-citations.mjs --citations docs/site/_data/citations.yml --pages "docs/site/**/*.md"
git add docs/site docs/superpowers/plans/2026-05-26-architecture-flow-genesis.md
git commit -m "feat(site): architecture + concepts pages with GENESIS diagrams"
```

---

## Tâche 5 : Pages de référence — agents et skills (template §4.4)

**Files:**
- Create: `docs/site/fr/reference/agents/{12 agents}.md`
- Create: `docs/site/fr/reference/skills/{5 skills}.md`
- Create: `docs/site/fr/customisation.md`
- (Idem EN.)

Liste des agents (depuis `docs/agents/`) : `acceptance-designer`, `acceptance-designer-reviewer`, `backlog-discoverer`, `backlog-discoverer-reviewer`, `backlog-planner`, `backlog-planner-reviewer`, `skraft-orchestrator`, `software-engineer`, `software-engineer-reviewer`, `solution-architect`, `solution-architect-reviewer`, + `software-engineer-and-reviewer` (page d'overview).

Liste des skills : `clean-architecture-testing`, `craft-discipline`, `create-custom-agent`, `outside-in-tdd`, `red-synthesize-green`.

- [ ] **Step 5.1 : Boilerplate template §4.4**

Créer un script `scripts/scaffold-reference-page.mjs` qui prend `{kind, name}` et émet un MD pré-rempli avec les 7 sections du template §4.4. Optionnel si jugé YAGNI.

- [ ] **Step 5.2 : Rédiger les 12 pages agents (FR)**

Pour chaque agent, remplir le template §4.4. La section « Pourquoi cette forme » doit contenir 1 à 3 citations, chacune défendant un trait spécifique de l'agent.

- [ ] **Step 5.3 : Rédiger les 5 pages skills (FR)**

Idem.

- [ ] **Step 5.4 : Écrire `fr/customisation.md`**

Sections : niveaux L1/L2/L3 (§5.1), invariants opposables (§5.3), étendre une phase (§5.4). Tableau d'invariants avec citation par ligne.

- [ ] **Step 5.5 : Traductions EN**

- [ ] **Step 5.6 : Lint + commit**

```bash
node scripts/check-citations.mjs --citations docs/site/_data/citations.yml --pages "docs/site/**/*.md"
git add docs/site
git commit -m "feat(site): reference pages for 12 agents + 5 skills + customization"
```

---

## Tâche 6 : Pages d'accueil utilisateur — getting-started, contributing, citations, changelog

**Files:**
- Create: `docs/site/fr/getting-started.md` + EN
- Create: `docs/site/fr/contributing.md` + EN
- Create: `docs/site/fr/citations.md` + EN
- Create: `docs/site/fr/changelog.md` + EN

- [ ] **Step 6.1 : Écrire `fr/getting-started.md`**

Pas-à-pas : clone `skraft-plugin`, install `apm`, premier lancement `/skraft`. Captures (placeholder à valider).

- [ ] **Step 6.2 : Écrire `fr/contributing.md`**

Règle des citations (§4.2), règle GENESIS (§4.3), comment proposer une PR (lien vers `CONTRIBUTING.md` du repo).

- [ ] **Step 6.3 : Écrire `fr/citations.md`**

Page générée via Liquid : itère `site.data.citations` et rend chaque entrée avec ancre permanente `#{key}`.

- [ ] **Step 6.4 : Initialiser `fr/changelog.md`**

Section « v0 — Bootstrap (2026-05) ». Rien d'autre.

- [ ] **Step 6.5 : Traductions EN**

- [ ] **Step 6.6 : Commit**

```bash
git add docs/site
git commit -m "feat(site): getting-started, contributing, citations index, changelog"
```

---

## Tâche 7 : Vendoring du design depuis le portfolio

**Goal :** Importer `design-tokens.css` et adapter le layout `default.html` du portfolio pour obtenir un rendu cohérent avec `sebastiendegodez.github.io`, sans aucun lien d'exécution entre les deux sites.

**Files:**
- Create : `skraft-plugin/docs/site/assets/css/design-tokens.css` (vendored bit-pour-bit).
- Create : `skraft-plugin/docs/site/assets/css/site.css` (CSS spécifique SKRAFT).
- Create/Replace : `skraft-plugin/docs/site/_layouts/default.html` (adapté du portfolio).
- Create : `skraft-plugin/scripts/vendor-design-from-portfolio.sh` (procédure de re-copie).
- Create : `skraft-plugin/scripts/check-design-drift.mjs` (optionnel, warning only).

- [ ] **Step 7.1 : Identifier les fichiers sources du portfolio**

Depuis le portfolio local :

```bash
cd ../SebastienDegodez.github.io
ls assets/css/design-tokens.css
ls _layouts/default.html
git rev-parse HEAD  # noter le SHA pour l'en-tête vendoring
```

Expected : les 2 fichiers existent. Noter le SHA (ex : `a1b2c3d`).

- [ ] **Step 7.2 : Vendoring `design-tokens.css`**

```bash
cd ../skraft-plugin
PORTFOLIO_SHA=$(cd ../SebastienDegodez.github.io && git rev-parse --short HEAD)
DATE=$(date -u +%Y-%m-%d)
mkdir -p docs/site/assets/css
{
  echo "/* VENDORED FROM SebastienDegodez/SebastienDegodez.github.io@${PORTFOLIO_SHA} on ${DATE}."
  echo " * Do not edit. Resync via: bash scripts/vendor-design-from-portfolio.sh"
  echo " */"
  cat ../SebastienDegodez.github.io/assets/css/design-tokens.css
} > docs/site/assets/css/design-tokens.css
```

- [ ] **Step 7.3 : Adapter `_layouts/default.html`**

Copier `../SebastienDegodez.github.io/_layouts/default.html` vers `docs/site/_layouts/default.html`. Modifier :

1. Références CSS : `{{ '/assets/css/design-tokens.css' | relative_url }}` + `{{ '/assets/css/site.css' | relative_url }}`.
2. Bloc nav : remplacer par boucle sur `site.data.nav` avec le toggle FR/EN (`{% include lang-toggle.html %}`).
3. Pied de page : conserver le style glass, adapter le copyright (« SKRAFT — documentation publique »).
4. En-tête de commentaire : `<!-- ADAPTED FROM portfolio default.html@<sha>. Resync structure manually if portfolio nav changes. -->`.

- [ ] **Step 7.4 : Créer `site.css`**

`docs/site/assets/css/site.css` contient uniquement les ajouts SKRAFT (sidebar, citation blocks, mermaid wrapper) au-dessus des tokens vendored. Aucune redéfinition de couleur primaire.

- [ ] **Step 7.5 : Écrire `scripts/vendor-design-from-portfolio.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
PORTFOLIO="${PORTFOLIO_PATH:-../SebastienDegodez.github.io}"
[[ -d "$PORTFOLIO" ]] || { echo "Portfolio repo not found at $PORTFOLIO"; exit 1; }
SHA=$(cd "$PORTFOLIO" && git rev-parse --short HEAD)
DATE=$(date -u +%Y-%m-%d)
{
  echo "/* VENDORED FROM SebastienDegodez/SebastienDegodez.github.io@${SHA} on ${DATE}."
  echo " * Do not edit. Resync via: bash scripts/vendor-design-from-portfolio.sh"
  echo " */"
  cat "$PORTFOLIO/assets/css/design-tokens.css"
} > docs/site/assets/css/design-tokens.css
echo "design-tokens.css vendored from portfolio@${SHA}"
echo "Reminder: review _layouts/default.html manually if portfolio nav structure changed."
```

`chmod +x scripts/vendor-design-from-portfolio.sh`.

- [ ] **Step 7.6 : Optionnel — `scripts/check-design-drift.mjs`**

Script Node qui :
1. Lit l'en-tête de `docs/site/assets/css/design-tokens.css` pour extraire le SHA vendored.
2. Si `PORTFOLIO_PATH` est défini, compare le contenu (après strip de l'en-tête) avec `$PORTFOLIO_PATH/assets/css/design-tokens.css`.
3. Émet un **warning** sur stdout si diff. **N'échoue jamais** — c'est informatif.

- [ ] **Step 7.7 : Build local pour valider**

```bash
cd docs/site
bundle install
bundle exec jekyll serve
# Visiter http://localhost:4000/skraft-plugin/fr/
```

Expected : la palette glass est en place, la nav s'affiche, le lang toggle fonctionne.

- [ ] **Step 7.8 : Commit**

```bash
git add docs/site/assets docs/site/_layouts scripts/vendor-design-from-portfolio.sh scripts/check-design-drift.mjs
git commit -m "feat(site): vendor design tokens + layout from portfolio for visual coherence"
```

---

## Tâche 8 : Tests Playwright + CI + Deploy GH Pages dans `skraft-plugin`

**Files:**
- Create: `skraft-plugin/playwright.config.mjs`
- Create: `skraft-plugin/tests/site/smoke.spec.mjs`
- Create: `skraft-plugin/.github/workflows/site-ci.yml`
- Create: `skraft-plugin/.github/workflows/pages-deploy.yml`

- [ ] **Step 8.1 : Écrire `playwright.config.mjs`**

`baseURL` configurable via `BASE_URL` env (par défaut `http://localhost:4000/skraft-plugin`). `webServer` optionnel : commande `bundle exec jekyll serve --source docs/site` pour démarrer le site automatiquement.

- [ ] **Step 8.2 : Écrire les smoke tests (TDD : tests d'abord)**

```javascript
// tests/site/smoke.spec.mjs
import { test, expect } from '@playwright/test';

test('home FR loads with SKRAFT title', async ({ page }) => {
  await page.goto('/fr/');
  await expect(page.locator('h1')).toContainText(/SKRAFT/i);
});

test('home FR has lang toggle to EN', async ({ page }) => {
  await page.goto('/fr/');
  await page.click('[data-lang-toggle="en"]');
  await expect(page).toHaveURL(/\/en\//);
});

test('pipeline page renders mermaid diagram', async ({ page }) => {
  await page.goto('/fr/pipeline/');
  await expect(page.locator('.mermaid svg')).toBeVisible({ timeout: 5000 });
});

test('concepts page cites CQS, CQRS, Use Case', async ({ page }) => {
  await page.goto('/fr/concepts');
  await expect(page.locator('body')).toContainText('CQS');
  await expect(page.locator('body')).toContainText('CQRS');
  await expect(page.locator('body')).toContainText('Use Case');
});

test('executive pitch page exists and contains DORA metrics', async ({ page }) => {
  await page.goto('/fr/pour-decideurs');
  await expect(page.locator('body')).toContainText(/Change Failure Rate|MTTR|Deployment Frequency/);
});

test('reference page for skraft-orchestrator renders 7-section template', async ({ page }) => {
  await page.goto('/fr/reference/agents/skraft-orchestrator');
  const headings = await page.locator('h2').allTextContents();
  for (const expected of ['Quand', 'Contrat d\'entrée', 'Contrat de sortie', 'Invariants', 'Pourquoi', 'Customisation', 'Voir aussi']) {
    expect(headings.some(h => h.includes(expected))).toBeTruthy();
  }
});

test('design tokens are loaded (CSS variables present)', async ({ page }) => {
  await page.goto('/fr/');
  const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim());
  expect(primary).toBe('#4ed58a');
});
```

- [ ] **Step 8.3 : Lancer les tests — ils doivent échouer**

Sans Jekyll servi, FAIL attendu.

- [ ] **Step 8.4 : Setup Jekyll local + relancer**

```bash
cd docs/site && bundle install && cd ../..
bundle exec --gemfile=docs/site/Gemfile jekyll serve --source docs/site --detach
BASE_URL=http://localhost:4000/skraft-plugin npx playwright test tests/site/smoke.spec.mjs
```

Expected : tests PASS si toutes les pages des Tâches 3-7 sont OK. Sinon, corriger les pages.

- [ ] **Step 8.5 : Écrire `.github/workflows/site-ci.yml`**

Sur PR vers `main` :
1. Checkout `skraft-plugin`.
2. Setup Ruby + `bundle install --gemfile=docs/site/Gemfile`.
3. Setup Node + `npm ci` + `npx playwright install --with-deps chromium`.
4. Run `node scripts/check-citations.mjs`.
5. Run `bundle exec --gemfile=docs/site/Gemfile jekyll build --source docs/site --destination _site`.
6. Serve `_site` localement (background) puis run `BASE_URL=... npx playwright test tests/site/smoke.spec.mjs`.

- [ ] **Step 8.6 : Écrire `.github/workflows/pages-deploy.yml`**

Sur push `main` :
1. Job `build` : setup Ruby + Jekyll build de `docs/site`.
2. Upload artifact via `actions/upload-pages-artifact@v3`.
3. Job `deploy` (dépend de `build`) : `actions/deploy-pages@v4`.
4. Permissions : `pages: write`, `id-token: write`, `contents: read`.
5. Concurrency : `group: pages, cancel-in-progress: false`.

Activer GH Pages dans Settings du repo en mode « GitHub Actions » après premier run.

- [ ] **Step 8.7 : Commit**

```bash
git add playwright.config.mjs tests/site .github/workflows/site-ci.yml .github/workflows/pages-deploy.yml
git commit -m "feat(site): playwright smoke tests + CI + GH Pages deploy workflow"
```

---

## Tâche 9 : Migration de l'existant `docs/` (spec §7)

**Files:**
- Modify: `skraft-plugin/docs/README.md` (pointe vers site public)
- Modify: `skraft-plugin/docs/architecture.md` (split)
- Modify: `skraft-plugin/docs/conventions.md` (split)
- Delete: `skraft-plugin/docs/agents/*.md` (remplacés par `docs/site/fr/reference/agents/*`)
- Delete: `skraft-plugin/docs/skills/*.md` (remplacés par `docs/site/fr/reference/skills/*`)
- Modify: `skraft-plugin/docs/site/_config.yml` (s'assurer que `exclude` couvre les dossiers internes à côté de `site/`)

- [ ] **Step 9.1 : Mettre à jour `docs/README.md`**

Section : « Pour la documentation publique, voir `https://sebastiendegodez.github.io/skraft-plugin/`. Ce dossier ne contient plus que les artefacts internes (specs, plans, journal). »

- [ ] **Step 9.2 : Split `docs/architecture.md`**

Conserver côté interne uniquement les schémas détaillés non publiables. Le reste est déjà couvert par `docs/site/fr/architecture.md`.

- [ ] **Step 9.3 : Split `docs/conventions.md`**

Glossaire + invariants → site (Tâche 5). Reste interne : conventions de contribution code.

- [ ] **Step 9.4 : Supprimer `docs/agents/` et `docs/skills/`**

```bash
git rm -r docs/agents docs/skills
```

- [ ] **Step 9.5 : Vérifier que `docs/roadmap.md` reste interne**

Pas de changement.

- [ ] **Step 9.6 : Confirmer l'exclusion via la source Jekyll**

Jekyll ne build que `docs/site/` (paramètre `--source docs/site` dans `pages-deploy.yml` Tâche 8.6). Les dossiers frères (`docs/superpowers/`, `docs/journal/`, `docs/agents/` etc.) ne sont **physiquement pas dans la source** — ils ne peuvent donc pas apparaître sur le site publié.

Vérifier que `docs/site/_config.yml` n'a aucune référence à `../`. Le `baseurl: "/skraft-plugin"` garantit l'URL finale.

- [ ] **Step 9.7 : Commit**

```bash
git add docs
git commit -m "refactor(docs): migrate internal docs split between public site and internal-only"
```

---

## Tâche 10 : PR unique + activation GH Pages

- [ ] **Step 10.1 : Push branche**

```bash
cd skraft-plugin && git push -u origin feat/docs-site
```

- [ ] **Step 10.2 : Ouvrir la PR (draft d'abord)**

- PR : `skraft-plugin#feat/docs-site` → `main` — titre « feat(site): SKRAFT public docs site (Jekyll + lint + smoke + GH Pages deploy) ».
- Body : résumer les 10 tâches, lier la spec (`docs/superpowers/specs/2026-05-26-skraft-docs-site.md`), expliciter la politique de vendoring design.

- [ ] **Step 10.3 : Vérifier la CI sur la PR**

Les deux workflows tournent :
- `site-ci.yml` : lint citations vert + Playwright vert.
- `pages-deploy.yml` : **ne se déclenche pas sur PR** (seulement sur push `main`).

- [ ] **Step 10.4 : Activer GH Pages dans le repo**

Settings → Pages → Source : **GitHub Actions**. Une seule fois, manuel.

- [ ] **Step 10.5 : Merge + premier déploiement**

Aprs merge sur `main` : `pages-deploy.yml` tourne. Vérifier le run, puis visiter `https://sebastiendegodez.github.io/skraft-plugin/fr/`.

- [ ] **Step 10.6 : Vérification finale**

Cocher chacun des 7 critères §9 de la spec :

| Critère | Vérification |
| --- | --- |
| 1. FR + EN navigables (home + pipeline + concepts + 1 agent + 1 skill) | Manuel, capture |
| 2. Lint citations vert | CI green sur PR |
| 3. Citations attachées à leur pratique | Revue éditoriale manuelle |
| 4. Use Case + CQS + CQRS documentés | `/fr/concepts` |
| 5. Design cohérent avec portfolio | Inspection visuelle côte-à-côte + test CSS variable (Playwright step 8.2) |
| 6. Schémas GENESIS persistés | `ls docs/superpowers/plans/2026-05-26-*-genesis.md` |
| 7. Aucun fichier interne exposé sur le site | Tester 404 sur `/skraft-plugin/superpowers/` et `/skraft-plugin/journal/` |

- [ ] **Step 10.7 : Mettre à jour le changelog public**

`docs/site/fr/changelog.md` : ajouter entrée v0.1.0 — « Initial public docs site. ». Commit + push direct sur `main` (ou via micro-PR).

---

## Remember

- **Exact file paths always** — pas de « quelque part dans `docs/` ».
- **Code complet dans le plan** — chaque step est exécutable tel quel.
- **Commandes avec output attendu** — pour qu'un agent puisse détecter une régression.
- **TDD strict** sur le lint citations et les smoke tests (Tâches 2 et 8).
- **Revue éditoriale manuelle** sur les pages prose (Tâches 3-6) — pas de TDD possible, mais lint citations + smoke Playwright forment le filet.
- **GENESIS obligatoire** pour les 2 schémas du site (`/pipeline` Tâche 3, `/architecture` Tâche 4).
- **Frequent commits** : 1 commit par tâche minimum, souvent 1 par sous-étape logique.

## Plan Review Loop

> **Note** : le skill `writing-plans` prescrit la dispatch d'un `plan-document-reviewer` subagent. Aucun agent de ce nom n'existe dans la liste disponible. L'agent `acceptance-designer-reviewer` est cadré sur les artefacts DISTILL (Gherkin, test plans), pas sur les plans d'implémentation de site documentaire. Le plan **part donc en revue utilisateur directement** ; un agent de revue dédié pourra être créé ultérieurement si le pattern se répète.

## Execution Handoff

Plan complet et sauvegardé sous `docs/superpowers/plans/2026-05-26-skraft-docs-site.md`. Deux options d'exécution :

1. **Subagent-Driven (recommandé)** — je dispatch un `runSubagent` frais par tâche (1 à 10), avec relecture entre tâches. Itération rapide, contexte chirurgical à chaque appel.
2. **Inline Execution** — j'exécute les tâches dans cette session via le skill `executing-plans`, avec checkpoints après chaque tâche.

**Lequel souhaites-tu ?**

> Avant de lancer, à confirmer :
> 1. URL publique cible `https://sebastiendegodez.github.io/skraft-plugin/` OK (ou préfères-tu un custom domain) ?
> 2. Le vendoring `design-tokens.css` + `_layouts/default.html` depuis le portfolio est OK, ou tu préfères un design from scratch aligné manuellement ?
> 3. Le script optionnel `check-design-drift.mjs` (warning only) est-il utile, ou on s'en passe ?
> 4. Visibilité de `presentation-skraft-agents.html` depuis le site public (link en home, ou laissé sous le portfolio uniquement) ?
