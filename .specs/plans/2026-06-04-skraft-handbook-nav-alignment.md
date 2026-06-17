# SKRAFT Handbook Navigation Alignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Réaligner le site `docs/site/**` sur le modèle handbook de `learning-path-copilot` : menu haut réduit à 4 portes, corps en sidebar gauche groupée par phase, agents documentés (but + pourquoi cité), principes/gates ancrés sur des citations nommées, et chapitres deep-dive.

**Architecture:** Site Jekyll natif, bilingue FR/EN par arborescence. La sidebar handbook est déjà pilotée par `_data/book.yml` + `_layouts/doc.html` ; la quasi-totalité des pages est déjà sur `layout: doc`. Le travail consiste à (1) slimmer `nav.yml`, (2) réorganiser `book.yml` en sections Démarrer/Pipeline/Principes/Catalogue/Aller-plus-loin, (3) basculer la home sur `doc`, (4) combler les pages manquantes (agents/index, skills/index, catalogue/{patterns,gates,lens}), (5) enrichir les pages phase/agent/principe avec des citations nommées, (6) ajouter les deep-dives, (7) verrouiller par lint citations + smoke test.

**Tech Stack:** Jekyll (Liquid, kramdown/GFM), YAML data files, Mermaid, Node.js (`scripts/check-citations.mjs`), Playwright (`playwright.config.mjs`).

**Décisions sur les questions ouvertes de la spec (defaults appliqués) :**
1. Libellé porte handbook → **« Le handbook » / « The handbook »** (path `/fr/pipeline/`).
2. Pages historiques `architecture`/`concepts` → **conservées, rangées dans la sidebar** (Pipeline pour `architecture`, Principes pour `concepts`) ; URLs inchangées.
3. Granularité agents → **les deux niveaux** : page par phase (résumé agent+reviewer+gates) DANS la section Pipeline + 1 page par agent dans le Catalogue (les pages agent existent déjà).
4. Deep-dives premier passage → **3 pages** : Outside-In TDD, Walking Skeleton, Review-before-review (les 2 dernières s'appuient sur des pages/concepts déjà partiellement présents).

**HVE-Core (substrat) — pourquoi c'est dans ce plan :** SKRAFT n'est pas autonome — il s'exécute sur le substrat **HVE-Core** (`microsoft/hve-core`). C'est HVE-Core qui porte l'**articulation des phases en architecture** : chaque phase lit/écrit `state.json`, suit le **protocole 6-étapes par tour**, et dépose ses artefacts dans une **arborescence datée** (`.copilot-tracking/skraft-plans/{slug}/`) ; les verdicts des reviewers (gates) y sont tracés et conditionnent la transition. La demande « montrer comment chaque phase s'articule en architecture » impose donc deux pages dédiées (substrat + traces), placées dans la section **Le pipeline**. Sources : `plugins/instructions/skraft-state.instructions.md`, `plugins/instructions/skraft-artifacts.instructions.md`.

---

## File Structure

**Modifiés (config / layout) :**
- `docs/site/_data/nav.yml` — réduit à 4 portes (marque implicite + 3 liens + toggle).
- `docs/site/_data/book.yml` — `parts` réorganisées en 5 sections (Démarrer / Pipeline / Principes / Catalogue / Aller plus loin).
- `docs/site/_layouts/doc.html` — uniquement si le rendu des labels de sidebar doit changer (titres lisibles au lieu de `p.id | replace`).
- `docs/site/fr/index.md` + `docs/site/en/index.md` — passage `layout: default` → `layout: doc`.

**Créés (contenu manquant, FR + EN) :**
- `docs/site/{fr,en}/reference/agents/index.md` — index des agents.
- `docs/site/{fr,en}/reference/skills/index.md` — index des skills.
- `docs/site/{fr,en}/catalogue/patterns.md` — patterns d'architecture (source : `plugins/skills/architecture-patterns/SKILL.md`).
- `docs/site/{fr,en}/catalogue/gates.md` — gates Gxx par phase (source : `plugins/skills/*-review-criteria/SKILL.md`).
- `docs/site/{fr,en}/catalogue/lens.md` — 4 lentilles (source : `plugins/agents/reviewer-lenses/*.agent.md`).
- `docs/site/{fr,en}/deep-dive/outside-in-tdd.md`
- `docs/site/{fr,en}/deep-dive/walking-skeleton.md`
- `docs/site/{fr,en}/deep-dive/review-before-review.md`
- `docs/site/{fr,en}/hve-core.md` — le substrat HVE-Core (source : `plugins/instructions/skraft-state.instructions.md`).
- `docs/site/{fr,en}/traces.md` — traces & auditabilité (source : `plugins/instructions/skraft-artifacts.instructions.md`).

**Enrichis (citations nommées) :**
- `docs/site/{fr,en}/pipeline/{discover,discuss,design,distill,deliver}.md` — ajout bloc « gates de la phase » + citation.
- `docs/site/{fr,en}/reference/agents/*.md` — ajout section « Pourquoi cette forme » citée si absente.

**Tests / CI :**
- `scripts/check-citations.mjs` — réutilisé tel quel (doit rester vert).
- `tests/site/` — ajout smoke test nav 4 portes + sidebar présente.

---

## Task 1: Réduire le menu haut à 4 portes

**Files:**
- Modify: `docs/site/_data/nav.yml` (remplacement complet de la liste)

- [ ] **Step 1: Réécrire `nav.yml`**

Remplacer tout le contenu après l'en-tête de commentaire par exactement ces 3 entrées (la marque `SKRAFT` et le toggle langue sont rendus en dur par `_layouts/doc.html`/`default.html`, hors `nav.yml`) :

```yaml
# --- Le handbook (entrée dans le livre) ---------------------------------
- path_fr: "/fr/pipeline/"
  path_en: "/en/pipeline/"
  title_fr: "Le handbook"
  title_en: "The handbook"

# --- Porte décideurs ----------------------------------------------------
- path_fr: "/fr/for-executives"
  path_en: "/en/for-executives"
  title_fr: "Pour décideurs"
  title_en: "For executives"

# --- Porte praticien ----------------------------------------------------
- path_fr: "/fr/getting-started"
  path_en: "/en/getting-started"
  title_fr: "Démarrer"
  title_en: "Get started"
```

Conserver l'en-tête de commentaire existant en haut du fichier, mais mettre à jour la phrase d'ordre pour refléter : `vision -> handbook -> décideurs -> démarrer`.

- [ ] **Step 2: Vérifier le rendu Liquid**

Run: `cd docs/site && bundle exec jekyll build 2>&1 | tail -5`
Expected: build sans erreur Liquid ; aucune référence cassée à `site.data.nav`.

- [ ] **Step 3: Commit**

```bash
git add docs/site/_data/nav.yml
git commit -m "feat(site): réduire le menu haut à 3 portes handbook"
```

---

## Task 2: Basculer la home sur le layout handbook

**Files:**
- Modify: `docs/site/fr/index.md:1-6`
- Modify: `docs/site/en/index.md:1-6`

- [ ] **Step 1: Changer le layout FR**

Dans `docs/site/fr/index.md`, frontmatter : remplacer `layout: default` par `layout: doc`.

- [ ] **Step 2: Changer le layout EN**

Dans `docs/site/en/index.md`, frontmatter : remplacer `layout: default` par `layout: doc`.

- [ ] **Step 3: Build + vérifier la sidebar**

Run: `cd docs/site && bundle exec jekyll build 2>&1 | tail -5`
Expected: build OK. Ouvrir `_site/fr/index.html` → la sidebar handbook doit être présente.

- [ ] **Step 4: Commit**

```bash
git add docs/site/fr/index.md docs/site/en/index.md
git commit -m "feat(site): home sur layout handbook (doc)"
```

---

## Task 3: Réorganiser `book.yml` en 5 sections handbook

> Cette tâche restructure la sidebar. Les `parts` actuelles (vision/decideurs/pratique/catalogue/contribuer) deviennent : **Démarrer / Le pipeline / Les principes / Le catalogue / Aller plus loin**. On ne référence QUE des pages existantes ou créées dans ce plan (sinon la sidebar produit des liens morts).

**Files:**
- Modify: `docs/site/_data/book.yml` (section `parts:` uniquement — ne pas toucher `meta:`)

- [ ] **Step 1: Réécrire la section `parts:`**

Remplacer tout le bloc `parts:` par cette structure (chaque `id` doit correspondre à un fichier existant après les tâches 4–7) :

```yaml
parts:
  - id: demarrer
    title_fr: "Démarrer"
    title_en: "Get started"
    pages:
      - { id: home,            fr: "fr/index.md",            en: "en/index.md" }
      - { id: hve-vs-skraft,   fr: "fr/hve-vs-skraft.md",    en: "en/hve-vs-skraft.md" }
      - { id: for-executives,  fr: "fr/for-executives.md",   en: "en/for-executives.md" }
      - { id: getting-started, fr: "fr/getting-started.md",  en: "en/getting-started.md" }

  - id: pipeline
    title_fr: "Le pipeline"
    title_en: "The pipeline"
    pages:
      - { id: pipeline,     fr: "fr/pipeline/index.md",    en: "en/pipeline/index.md" }
      - { id: discover,     fr: "fr/pipeline/discover.md", en: "en/pipeline/discover.md" }
      - { id: discuss,      fr: "fr/pipeline/discuss.md",  en: "en/pipeline/discuss.md" }
      - { id: design,       fr: "fr/pipeline/design.md",   en: "en/pipeline/design.md" }
      - { id: distill,      fr: "fr/pipeline/distill.md",  en: "en/pipeline/distill.md" }
      - { id: deliver,      fr: "fr/pipeline/deliver.md",  en: "en/pipeline/deliver.md" }
      - { id: architecture, fr: "fr/architecture.md",      en: "en/architecture.md" }
      - { id: hve-core,     fr: "fr/hve-core.md",          en: "en/hve-core.md" }
      - { id: traces,       fr: "fr/traces.md",            en: "en/traces.md" }

  - id: principes
    title_fr: "Les principes"
    title_en: "Principles"
    pages:
      - { id: why-review,    fr: "fr/pourquoi-review-avant-review.md", en: "en/why-review-before-review.md" }
      - { id: concepts,      fr: "fr/concepts.md",                     en: "en/concepts.md" }
      - { id: clean-arch,    fr: "fr/clean-architecture.md",           en: "en/clean-architecture.md" }

  - id: catalogue
    title_fr: "Le catalogue"
    title_en: "Catalogue"
    pages:
      - { id: agents,    fr: "fr/reference/agents/index.md", en: "en/reference/agents/index.md" }
      - { id: skills,    fr: "fr/reference/skills/index.md", en: "en/reference/skills/index.md" }
      - { id: gates,     fr: "fr/catalogue/gates.md",        en: "en/catalogue/gates.md" }
      - { id: lens,      fr: "fr/catalogue/lens.md",         en: "en/catalogue/lens.md" }
      - { id: patterns,  fr: "fr/catalogue/patterns.md",     en: "en/catalogue/patterns.md" }
      - { id: citations, fr: "fr/citations.md",              en: "en/citations.md" }
      - { id: glossaire, fr: "fr/glossaire.md",              en: "en/glossary.md" }

  - id: aller-plus-loin
    title_fr: "Aller plus loin"
    title_en: "Going further"
    pages:
      - { id: outside-in-tdd,   fr: "fr/deep-dive/outside-in-tdd.md",      en: "en/deep-dive/outside-in-tdd.md" }
      - { id: walking-skeleton, fr: "fr/deep-dive/walking-skeleton.md",    en: "en/deep-dive/walking-skeleton.md" }
      - { id: review-deep,      fr: "fr/deep-dive/review-before-review.md", en: "en/deep-dive/review-before-review.md" }

  - id: contribuer
    title_fr: "Contribuer"
    title_en: "Contribute"
    pages:
      - { id: contributing,  fr: "fr/contributing.md",  en: "en/contributing.md" }
      - { id: customisation, fr: "fr/customisation.md", en: "en/customisation.md" }
```

- [ ] **Step 2: Vérifier le mapping EN des basenames**

Confirmer que chaque `en:` pointe vers un fichier réel. Points d'attention (basename EN ≠ FR) :
- `fr/pourquoi-review-avant-review.md` ↔ `en/why-review-before-review.md`
- `fr/glossaire.md` ↔ `en/glossary.md`

Run: `ls docs/site/en/why-review-before-review.md docs/site/en/glossary.md`
Expected: les deux fichiers existent. Sinon, créer un stub EN (frontmatter + bandeau « Translation coming »).

- [ ] **Step 3: Build + inspection sidebar**

Run: `cd docs/site && bundle exec jekyll build 2>&1 | tail -5`
Expected: build OK, 5 sections + Contribuer dans la sidebar, aucun lien `href` vide.

- [ ] **Step 4: Commit**

```bash
git add docs/site/_data/book.yml
git commit -m "feat(site): sidebar handbook groupée par phase (book.yml)"
```

---

## Task 4: Labels de sidebar lisibles

> Aujourd'hui `doc.html` calcule le label via `p.id | replace: '-', ' ' | capitalize`, ce qui donne « Hve vs skraft ». On ajoute un champ optionnel `label_fr` / `label_en` par page, avec fallback sur l'ancien calcul.

**Files:**
- Modify: `docs/site/_layouts/doc.html` (bloc `{% for p in part.pages %}`)
- Modify: `docs/site/_data/book.yml` (ajout `label_fr`/`label_en` sur les pages aux ids ambigus)

- [ ] **Step 1: Modifier le calcul du label dans `doc.html`**

Remplacer la ligne `{% assign label = p.id | replace: '-', ' ' | capitalize %}` par :

```liquid
{% if page.lang == 'en' %}
  {% assign label = p.label_en | default: p.id | replace: '-', ' ' | capitalize %}
{% else %}
  {% assign label = p.label_fr | default: p.id | replace: '-', ' ' | capitalize %}
{% endif %}
```

- [ ] **Step 2: Ajouter les labels lisibles dans `book.yml`**

Pour les pages aux ids peu lisibles, ajouter `label_fr`/`label_en`. Exemples minimaux :
- home → `label_fr: "SKRAFT en 15 min"`, `label_en: "SKRAFT in 15 min"`
- hve-vs-skraft → `label_fr: "HVE → SKRAFT"`, `label_en: "HVE → SKRAFT"`
- for-executives → `label_fr: "Pour décideurs"`, `label_en: "For executives"`
- why-review → `label_fr: "Pourquoi review avant review"`, `label_en: "Why review before review"`
- pipeline → `label_fr: "Vue d'ensemble"`, `label_en: "Overview"`
- DISCOVER…DELIVER → labels en majuscules (`DISCOVER`, …)
- hve-core → `label_fr: "Le substrat HVE-Core"`, `label_en: "The HVE-Core substrate"`
- traces → `label_fr: "Traces & auditabilité"`, `label_en: "Traces & auditability"`

- [ ] **Step 3: Build + vérifier les labels**

Run: `cd docs/site && bundle exec jekyll build 2>&1 | tail -5`
Expected: build OK ; sidebar affiche « SKRAFT en 15 min », « DISCOVER », etc.

- [ ] **Step 4: Commit**

```bash
git add docs/site/_layouts/doc.html docs/site/_data/book.yml
git commit -m "feat(site): labels de sidebar lisibles (label_fr/label_en)"
```

---

## Task 5: Index des agents (FR + EN)

**Files:**
- Create: `docs/site/fr/reference/agents/index.md`
- Create: `docs/site/en/reference/agents/index.md`
- Source: `plugins/agents/*.agent.md`

- [ ] **Step 1: Lire les sources agents**

Lire l'en-tête (frontmatter `description`) de chaque `plugins/agents/*.agent.md` pour rédiger une ligne par agent (rôle + phase).

- [ ] **Step 2: Créer l'index FR**

Créer `docs/site/fr/reference/agents/index.md` :

```markdown
---
layout: doc
lang: fr
title: "Référence — Agents"
description: "Tous les agents du pipeline SKRAFT : rôle, phase, reviewer."
---

# Référence — Agents

> Chaque phase a un agent producteur et un reviewer indépendant.

| Phase | Agent producteur | Reviewer |
| --- | --- | --- |
| DISCOVER | [backlog-discoverer](backlog-discoverer.html) | [backlog-discoverer-reviewer](backlog-discoverer-reviewer.html) |
| DISCUSS  | [backlog-planner](backlog-planner.html) | [backlog-planner-reviewer](backlog-planner-reviewer.html) |
| DESIGN   | [solution-architect](solution-architect.html) | [solution-architect-reviewer](solution-architect-reviewer.html) |
| DISTILL  | [acceptance-designer](acceptance-designer.html) | [acceptance-designer-reviewer](acceptance-designer-reviewer.html) |
| DELIVER  | [software-engineer](software-engineer.html) | [software-engineer-reviewer](software-engineer-reviewer.html) |
| (méta)   | [skraft-orchestrator](skraft-orchestrator.html) | — |
```

- [ ] **Step 3: Créer l'index EN**

Créer `docs/site/en/reference/agents/index.md` (même tableau, `lang: en`, titres traduits, liens `.html` identiques).

- [ ] **Step 4: Build + vérifier les liens**

Run: `cd docs/site && bundle exec jekyll build 2>&1 | tail -5`
Expected: build OK ; tous les liens du tableau résolvent vers une page existante.

- [ ] **Step 5: Commit**

```bash
git add docs/site/fr/reference/agents/index.md docs/site/en/reference/agents/index.md
git commit -m "feat(site): index des agents (FR/EN)"
```

---

## Task 6: Index des skills (FR + EN)

**Files:**
- Create: `docs/site/fr/reference/skills/index.md`
- Create: `docs/site/en/reference/skills/index.md`
- Source: `docs/site/{fr,en}/reference/skills/*.md` (pages existantes : clean-architecture-testing, craft-discipline, create-custom-agent, outside-in-tdd, red-synthesize-green)

- [ ] **Step 1: Créer l'index FR**

Créer `docs/site/fr/reference/skills/index.md` avec frontmatter `layout: doc, lang: fr` et une liste à puces pointant vers chaque page skill existante (titre + 1 phrase). Ne lister que les pages qui existent réellement dans le dossier.

- [ ] **Step 2: Créer l'index EN**

Créer `docs/site/en/reference/skills/index.md` (équivalent EN).

- [ ] **Step 3: Build + vérifier**

Run: `cd docs/site && bundle exec jekyll build 2>&1 | tail -5`
Expected: build OK, liens valides.

- [ ] **Step 4: Commit**

```bash
git add docs/site/fr/reference/skills/index.md docs/site/en/reference/skills/index.md
git commit -m "feat(site): index des skills (FR/EN)"
```

---

## Task 7: Page catalogue — Gates (FR + EN)

> Respecte le `catalogue_template` de `book.yml` (frontmatter requis + blocs : title, intro-callout, pourquoi, concepts, why-citation, sources, glossaire). Toute citation DOIT exister dans `docs/site/_data/citations.yml`.

**Files:**
- Create: `docs/site/fr/catalogue/gates.md`
- Create: `docs/site/en/catalogue/gates.md`
- Source: `plugins/skills/discovery-review-criteria/SKILL.md`, `plugins/skills/planning-review-criteria/SKILL.md`, `plugins/skills/architecture-review-criteria/SKILL.md`, `plugins/skills/acceptance-review-criteria/SKILL.md`

- [ ] **Step 1: Extraire les gates par phase**

Lire chaque `*-review-criteria/SKILL.md` et lister les gates (Gxx) avec, pour chacune : ce qu'elle vérifie + pourquoi.

- [ ] **Step 2: Vérifier les clés de citation disponibles**

Run: `grep -E "^- key:" docs/site/_data/citations.yml`
Expected: liste des clés. Choisir pour le bloc `why-citation` une clé existante (ex. `wiegers-peerreviews-2002` si présente, sinon `martin-cleanarch-2017`).

- [ ] **Step 3: Créer la page FR**

Créer `docs/site/fr/catalogue/gates.md` avec frontmatter `layout: doc, lang: fr, title, description` et les blocs requis. Le bloc `## Pourquoi cette pratique` contient une citation nommée au format imposé (≤ 25 mots, anglais, auteur/titre italique/année).

- [ ] **Step 4: Créer la page EN**

Créer `docs/site/en/catalogue/gates.md` (équivalent, `lang: en`).

- [ ] **Step 5: Lint citations + build**

Run: `node scripts/check-citations.mjs && cd docs/site && bundle exec jekyll build 2>&1 | tail -5`
Expected: lint vert (0 citation orpheline), build OK.

- [ ] **Step 6: Commit**

```bash
git add docs/site/fr/catalogue/gates.md docs/site/en/catalogue/gates.md
git commit -m "feat(site): page catalogue gates (FR/EN, citées)"
```

---

## Task 8: Page catalogue — Lentilles de revue (FR + EN)

**Files:**
- Create: `docs/site/fr/catalogue/lens.md`
- Create: `docs/site/en/catalogue/lens.md`
- Source: `plugins/agents/reviewer-lenses/{cold-reader,architecture-boundaries,test-integrity,quality-gates}-lens.agent.md`

- [ ] **Step 1: Extraire les 4 lentilles**

Lire les 4 fichiers `*-lens.agent.md` : pour chaque lentille, son angle d'attaque adverse + ce qu'elle oppose.

- [ ] **Step 2: Créer la page FR**

Créer `docs/site/fr/catalogue/lens.md` (catalogue_template). Bloc concepts : tableau des 4 lentilles. Bloc why-citation : une citation nommée existante (ex. revue par les pairs / Wiegers ou Fagan si présent dans `citations.yml`).

- [ ] **Step 3: Créer la page EN**

Créer `docs/site/en/catalogue/lens.md`.

- [ ] **Step 4: Lint + build**

Run: `node scripts/check-citations.mjs && cd docs/site && bundle exec jekyll build 2>&1 | tail -5`
Expected: lint vert, build OK.

- [ ] **Step 5: Commit**

```bash
git add docs/site/fr/catalogue/lens.md docs/site/en/catalogue/lens.md
git commit -m "feat(site): page catalogue lentilles de revue (FR/EN, citées)"
```

---

## Task 9: Page catalogue — Patterns d'architecture (FR + EN)

**Files:**
- Create: `docs/site/fr/catalogue/patterns.md`
- Create: `docs/site/en/catalogue/patterns.md`
- Source: `plugins/skills/architecture-patterns/SKILL.md`

- [ ] **Step 1: Extraire les patterns**

Lister depuis la skill : Event Modeling, DDD strategic/tactical, Clean Architecture, CQRS, Event Sourcing. Pour chacun : 1 phrase + sa citation canonique (Evans 2003, Fowler 2002, Martin 2017, etc. — clés présentes dans `citations.yml`).

- [ ] **Step 2: Créer la page FR**

Créer `docs/site/fr/catalogue/patterns.md` (catalogue_template). Le bloc concepts liste chaque pattern avec sa référence.

- [ ] **Step 3: Créer la page EN**

Créer `docs/site/en/catalogue/patterns.md`.

- [ ] **Step 4: Lint + build**

Run: `node scripts/check-citations.mjs && cd docs/site && bundle exec jekyll build 2>&1 | tail -5`
Expected: lint vert, build OK.

- [ ] **Step 5: Commit**

```bash
git add docs/site/fr/catalogue/patterns.md docs/site/en/catalogue/patterns.md
git commit -m "feat(site): page catalogue patterns (FR/EN, citées)"
```

---

## Task 10: Enrichir les pages de phase avec gates + citation

> Pour chaque phase, ajouter (si absent) un bloc « Les gates franchies ici » qui pointe vers `catalogue/gates`, et une citation nommée qui défend le découpage par phase. Ne pas dupliquer le contenu de la page agent.

**Files:**
- Modify: `docs/site/fr/pipeline/{discover,discuss,design,distill,deliver}.md`
- Modify: `docs/site/en/pipeline/{discover,discuss,design,distill,deliver}.md`

- [ ] **Step 1: DISCOVER (FR + EN)**

Ajouter en fin de page (avant un éventuel prev/next) :
```markdown
## Les gates franchies ici

Cette phase franchit les gates Gxx (voir [catalogue des gates](../catalogue/gates.html)).
Chaque gate est vérifiée par le reviewer indépendant avant passage à DISCUSS.

> « A good review is built on a foundation of explicit, agreed-upon criteria. »
> — Karl Wiegers, *Peer Reviews in Software*, 2002.
```
(Adapter la phase aval : DISCOVER→DISCUSS, DISCUSS→DESIGN, etc. ; DELIVER → « la PR ».)

Vérifier que la clé citation utilisée existe dans `citations.yml` (sinon en choisir une présente).

- [ ] **Step 2: Répéter pour discuss, design, distill, deliver (FR + EN)**

Même bloc, citation adaptée au principe défendu par la phase (ex. DESIGN → Evans 2003 ; DELIVER → Martin 2017).

- [ ] **Step 3: Lint + build**

Run: `node scripts/check-citations.mjs && cd docs/site && bundle exec jekyll build 2>&1 | tail -5`
Expected: lint vert, build OK.

- [ ] **Step 4: Commit**

```bash
git add docs/site/fr/pipeline docs/site/en/pipeline
git commit -m "feat(site): gates + citation sur chaque page de phase"
```

---

## Task 11: Vérifier « pourquoi cité » sur chaque page agent

> Les pages agent existent déjà. Cette tâche garantit que chacune possède une section justifiant sa forme par ≥ 1 citation nommée. Audit puis complément minimal.

**Files:**
- Modify (si manquant) : `docs/site/{fr,en}/reference/agents/*.md`

- [ ] **Step 1: Audit**

Run: `grep -L "^>" docs/site/fr/reference/agents/*.md`
Expected: liste des pages SANS blockquote (donc probablement sans citation). Pour chacune, vérifier visuellement la présence d'une section « Pourquoi » citée.

- [ ] **Step 2: Compléter les pages manquantes**

Pour chaque page agent sans citation, ajouter une section :
```markdown
## Pourquoi cette forme

[1 paragraphe justifiant le rôle de l'agent.]

> « <citation ≤ 25 mots> »
> — Auteur, *Titre*, année.
```
Choisir une clé présente dans `citations.yml` cohérente avec le rôle (ex. discoverer → Wiegers ; planner → Cohn/Cockburn ; architect → Evans ; acceptance → Adzic ; engineer → Beck/Martin).

- [ ] **Step 3: Lint + build**

Run: `node scripts/check-citations.mjs && cd docs/site && bundle exec jekyll build 2>&1 | tail -5`
Expected: lint vert, build OK.

- [ ] **Step 4: Commit**

```bash
git add docs/site/fr/reference/agents docs/site/en/reference/agents
git commit -m "feat(site): pourquoi cité sur chaque page agent"
```

---

## Task 12: Deep-dive — Outside-In TDD (FR + EN)

**Files:**
- Create: `docs/site/fr/deep-dive/outside-in-tdd.md`
- Create: `docs/site/en/deep-dive/outside-in-tdd.md`
- Source: `plugins/skills/outside-in-tdd/SKILL.md`, `docs/site/{fr,en}/reference/skills/outside-in-tdd.md`

- [ ] **Step 1: Créer la page FR**

Créer `docs/site/fr/deep-dive/outside-in-tdd.md` selon le gabarit deep-dive (§4.4 de la spec) : Problème → Ce que disent les sources (Beck 2003, Freeman & Pryce *GOOS* 2009 si présent) → Application dans SKRAFT (exemple concret : double boucle RED/GREEN, extrait de cycle) → Pièges → Sources. Frontmatter `layout: doc, lang: fr`.

- [ ] **Step 2: Créer la page EN**

Créer `docs/site/en/deep-dive/outside-in-tdd.md`.

- [ ] **Step 3: Lint + build**

Run: `node scripts/check-citations.mjs && cd docs/site && bundle exec jekyll build 2>&1 | tail -5`
Expected: lint vert, build OK.

- [ ] **Step 4: Commit**

```bash
git add docs/site/fr/deep-dive/outside-in-tdd.md docs/site/en/deep-dive/outside-in-tdd.md
git commit -m "feat(site): deep-dive Outside-In TDD (FR/EN)"
```

---

## Task 13: Deep-dive — Walking Skeleton (FR + EN)

**Files:**
- Create: `docs/site/fr/deep-dive/walking-skeleton.md`
- Create: `docs/site/en/deep-dive/walking-skeleton.md`
- Source: `plugins/skills/outside-in-tdd/SKILL.md` (section walking skeleton), Cockburn 2005 / Freeman & Pryce 2009

- [ ] **Step 1: Créer la page FR**

Gabarit deep-dive. Exemple concret : la première slice end-to-end livrée en DELIVER. Citations nommées existantes (`citations.yml`).

- [ ] **Step 2: Créer la page EN**

- [ ] **Step 3: Lint + build**

Run: `node scripts/check-citations.mjs && cd docs/site && bundle exec jekyll build 2>&1 | tail -5`
Expected: lint vert, build OK.

- [ ] **Step 4: Commit**

```bash
git add docs/site/fr/deep-dive/walking-skeleton.md docs/site/en/deep-dive/walking-skeleton.md
git commit -m "feat(site): deep-dive Walking Skeleton (FR/EN)"
```

---

## Task 14: Deep-dive — Review-before-review (FR + EN)

**Files:**
- Create: `docs/site/fr/deep-dive/review-before-review.md`
- Create: `docs/site/en/deep-dive/review-before-review.md`
- Source: `docs/site/{fr,en}/pourquoi-review-avant-review.md` (page existante), `plugins/skills/adversarial-review-lenses/SKILL.md`

- [ ] **Step 1: Créer la page FR**

Gabarit deep-dive. Approfondit la page principe existante : preuve par la revue adverse assistée AVANT la revue humaine. Exemple concret : 4 lentilles + synthèse pondérée. Citations (Wiegers 2002, Fagan si présent).

- [ ] **Step 2: Créer la page EN**

- [ ] **Step 3: Lint + build**

Run: `node scripts/check-citations.mjs && cd docs/site && bundle exec jekyll build 2>&1 | tail -5`
Expected: lint vert, build OK.

- [ ] **Step 4: Commit**

```bash
git add docs/site/fr/deep-dive/review-before-review.md docs/site/en/deep-dive/review-before-review.md
git commit -m "feat(site): deep-dive review-before-review (FR/EN)"
```

---

## Task 15: Smoke test navigation

**Files:**
- Inspect: `playwright.config.mjs`, `tests/site/` (suivre le pattern existant)
- Create/Modify: `tests/site/handbook-nav.spec.mjs`

- [ ] **Step 1: Lire un test existant**

Lire un fichier sous `tests/site/` pour reprendre le pattern (baseURL, sélecteurs, build préalable).

- [ ] **Step 2: Écrire le test (FAIL d'abord)**

Créer `tests/site/handbook-nav.spec.mjs` qui vérifie, sur `/fr/pipeline/` :
- le menu haut contient exactement 3 liens de nav (Le handbook, Pour décideurs, Démarrer) hors marque + toggle ;
- la sidebar `.doc-sidebar` est présente et contient les sections « Le pipeline » et « Le catalogue ».

```js
import { test, expect } from '@playwright/test';

test('menu haut réduit à 3 portes', async ({ page }) => {
  await page.goto('/fr/pipeline/');
  const links = page.locator('.site-nav > a:not(.site-nav__brand)');
  await expect(links).toHaveCount(3);
});

test('sidebar handbook présente', async ({ page }) => {
  await page.goto('/fr/pipeline/');
  await expect(page.locator('.doc-sidebar')).toBeVisible();
  await expect(page.locator('.doc-sidebar__group', { hasText: 'Le pipeline' })).toBeVisible();
});

test('le substrat HVE-Core est dans la sidebar pipeline', async ({ page }) => {
  await page.goto('/fr/pipeline/');
  await expect(page.locator('.doc-sidebar a', { hasText: 'substrat HVE-Core' })).toBeVisible();
});
```

- [ ] **Step 3: Lancer le test**

Run: `npx playwright test tests/site/handbook-nav.spec.mjs`
Expected: PASS (après build du site). Ajuster les sélecteurs si le DOM réel diffère (vérifier la classe exacte du conteneur nav dans `_layouts/doc.html`).

- [ ] **Step 4: Commit**

```bash
git add tests/site/handbook-nav.spec.mjs
git commit -m "test(site): smoke nav handbook (4 portes + sidebar)"
```

---

## Task 16: Page Pipeline — substrat HVE-Core (FR + EN)

> Documente le substrat sur lequel les phases s'articulent : `state.json`, protocole 6-étapes par tour, héritage RPI, planners voisins. Page d'**architecture**, pas de vente (la comparaison reste sur `hve-vs-skraft`).

**Files:**
- Create: `docs/site/fr/hve-core.md`
- Create: `docs/site/en/hve-core.md`
- Source: `plugins/instructions/skraft-state.instructions.md`

- [ ] **Step 1: Extraire les conventions du substrat**

Lire `skraft-state.instructions.md` : schéma `state.json` (champs clés : `currentPhase`, `phaseArtifacts`, `reviewerVerdicts`, `retryCount`, `userPreferences`), le protocole 6-étapes par tour, la séquence de reprise 4-étapes, et `neighborPlanners`.

- [ ] **Step 2: Créer la page FR**

Créer `docs/site/fr/hve-core.md` (frontmatter `layout: doc, lang: fr, title, description`). Sections : `## Pourquoi un substrat` → `## state.json (la mémoire du pipeline)` (extrait JSON réduit aux champs clés) → `## Le protocole 6-étapes par tour` → `## Comment les phases s'articulent` (chaque phase lit l'état, écrit ses artefacts datés, le reviewer écrit son verdict → transition) → `## Planners voisins` → `## Voir aussi` (liens vers `traces`, `hve-vs-skraft`, `architecture`). Inclure un schéma Mermaid : entrée unique `skraft-orchestrator` lisant/écrivant `state.json`, enchaînement des phases avec gate reviewer entre chaque.

- [ ] **Step 3: Créer la page EN**

Créer `docs/site/en/hve-core.md` (équivalent, `lang: en`).

- [ ] **Step 4: Lint + build**

Run: `node scripts/check-citations.mjs && cd docs/site && bundle exec jekyll build 2>&1 | tail -5`
Expected: lint vert, build OK ; les liens « Voir aussi » résolvent.

- [ ] **Step 5: Commit**

```bash
git add docs/site/fr/hve-core.md docs/site/en/hve-core.md
git commit -m "feat(site): page substrat HVE-Core (FR/EN)"
```

---

## Task 17: Page Pipeline — Traces & auditabilité (FR + EN)

> Documente l'arborescence datée des artefacts : ce que chaque phase dépose, où, et pourquoi ça rend le pipeline auditable. Ancré sur une citation nommée (Specification by Example / auditabilité).

**Files:**
- Create: `docs/site/fr/traces.md`
- Create: `docs/site/en/traces.md`
- Source: `plugins/instructions/skraft-artifacts.instructions.md`

- [ ] **Step 1: Extraire le mapping phase → artefact**

Lire `skraft-artifacts.instructions.md` : racine `.copilot-tracking/skraft-plans/{slug}/`, tableau phase → sous-dossier daté (`research/`, `plans/`, `adrs/`, `details/`, `features/`, `changes/`, `reviews/`), contrainte append-only.

- [ ] **Step 2: Vérifier une clé de citation**

Run: `grep -E "^- key:" docs/site/_data/citations.yml`
Expected: choisir une clé existante pour le bloc « pourquoi » (ex. `adzic-specification-2011` → traçabilité par l'exemple, ou `evans-ddd-2003`).

- [ ] **Step 3: Créer la page FR**

Créer `docs/site/fr/traces.md` (frontmatter `layout: doc, lang: fr`). Sections : `## Pourquoi tracer` → `## L'arborescence datée` (reproduire le tableau phase → chemin) → `## Append-only : pourquoi on n'écrase jamais` → `## Auditabilité` (citation nommée) → `## Voir aussi` (`hve-core`, `pipeline`). 

- [ ] **Step 4: Créer la page EN**

Créer `docs/site/en/traces.md` (équivalent, `lang: en`).

- [ ] **Step 5: Lint + build**

Run: `node scripts/check-citations.mjs && cd docs/site && bundle exec jekyll build 2>&1 | tail -5`
Expected: lint vert, build OK.

- [ ] **Step 6: Commit**

```bash
git add docs/site/fr/traces.md docs/site/en/traces.md
git commit -m "feat(site): page traces & auditabilité (FR/EN, citée)"
```

---

## Task 18: Vérification finale (acceptance)

- [ ] **Step 1: Lint citations global**

Run: `node scripts/check-citations.mjs`
Expected: 0 citation orpheline.

- [ ] **Step 2: Build complet**

Run: `cd docs/site && bundle exec jekyll build 2>&1 | tail -10`
Expected: build sans warning de lien cassé.

- [ ] **Step 3: Vérifier les critères d'acceptation de la spec**

Cocher manuellement §6 de `docs/superpowers/specs/2026-06-04-skraft-handbook-nav-alignment-design.md` :
1. menu ≤ 4 (3 liens + toggle) FR/EN ;
2. pages du livre sur `layout: doc` + sidebar ;
3. section Pipeline = 5 phases avec agent+reviewer+gates+articulation ;
4. chaque agent : but + pourquoi cité ;
5. chaque principe/gate cité (lint vert) ;
6. ≥ 3 deep-dives avec ouvrage + exemple ;
7. aucune URL cassée ;
8. l'**articulation architecture** est documentée : page substrat HVE-Core (`state.json` + protocole 6-étapes) et page Traces (arborescence datée) présentes dans la section Pipeline, FR+EN.

- [ ] **Step 4: Smoke Playwright complet**

Run: `npx playwright test tests/site/`
Expected: tous verts.

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "chore(site): vérification acceptance handbook nav alignment"
```

---

## Notes pour l'exécutant

- **DRY** : ne recopie pas le contenu des agents dans les pages de phase — lie-les.
- **YAGNI** : pas de nouveau composant de design ; réutilise `.doc-sidebar`, `.admonition`, etc.
- **Citations** : toute citation publiée DOIT avoir sa clé dans `docs/site/_data/citations.yml`. En cas de doute, `grep -E "^- key:" docs/site/_data/citations.yml` AVANT d'écrire.
- **FR/EN** : chaque page FR a son pendant EN au même basename (sauf les 2 exceptions notées : `pourquoi-review-avant-review`↔`why-review-before-review`, `glossaire`↔`glossary`).
- **Commits fréquents** : un commit par tâche minimum (déjà cadré ci-dessus).
- Le build Jekyll suppose `bundle install` fait dans `docs/site/`. Si absent : `cd docs/site && bundle install`.
