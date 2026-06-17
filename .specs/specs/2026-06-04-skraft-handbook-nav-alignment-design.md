# Spec — Alignement navigation SKRAFT sur le handbook learning-path

> Statut : **DRAFT v1** — relecture utilisateur en cours.
> Date : 2026-06-04
> Auteur : `skraft-plugin`
> Branche cible : `feat/hve-compatibility`
> Périmètre : restructuration éditoriale + navigation du site `docs/site/**`.
> Prérequis : la spec d'infrastructure [`2026-05-26-skraft-docs-site.md`](2026-05-26-skraft-docs-site.md) (stack Jekyll, bilinguisme, politique de citations) reste le socle. Cette spec la **raffine**, elle ne la remplace pas.

---

## 1. Intention

Aligner le site SKRAFT sur le modèle de navigation du site `learning-path-copilot` : **un handbook**, pas un site vitrine éclaté. Concrètement :

1. **Réduire le menu du haut** à l'essentiel — ne garder que les portes d'entrée, pas le catalogue.
2. **Faire du corps du site un livre** : chaque phase du pipeline est documentée dans une **sidebar gauche** persistante (modèle learning-path : blocs `h3` + liens à bordure active).
3. **Montrer les agents** : pour chacun, son **but** et le **pourquoi** de sa forme.
4. **Ancrer chaque principe et chaque gate** des agents dans une **citation nommée** (Martin Fowler, Kent Beck, Eric Evans, Robert C. Martin…) — prouver, pas affirmer.
5. **Approfondir** : quand une approche mérite un vrai chapitre, lui dédier une page de **deep-dive** appuyée sur des livres et des exemples concrets.

> « Programs must be written for people to read, and only incidentally for machines to execute. »
> — Harold Abelson & Gerald Jay Sussman, *Structure and Interpretation of Computer Programs*, 1985.

Le code SKRAFT existe déjà. Le site doit le rendre **lisible comme un livre** : on entre par une porte étroite, on lit phase par phase, et chaque règle est opposable à une source.

### Non-objectifs

- Pas de refonte du design (les tokens « liquid-glass » et le layout `doc.html` existent déjà — on les **réutilise**).
- Pas de changement de stack (Jekyll natif, FR/EN par arborescence, inchangé).
- Pas de réécriture des agents/skills du plugin (`plugins/**`) — on **documente** ce qui existe.
- Pas de nouvelle infrastructure de build/déploiement.

---

## 2. État actuel (constat)

| Élément | Aujourd'hui | Problème |
| --- | --- | --- |
| **Menu haut** (`_data/nav.yml`) | 11 liens : Accueil, Pour décideurs, Pipeline, Référence Agents, Référence Skills, Citations, Contribuer, Customisation, Architecture, Concepts, Premiers pas | Trop large : le catalogue et les pages historiques saturent la barre. |
| **Sidebar handbook** (`_layouts/doc.html` + `_data/book.yml`) | Existe, groupée par `parts`, liens à bordure active | Sous-utilisée : peu de pages portent `layout: doc`. |
| **Pages de contenu** | La plupart sur `layout: default` (nav plate du haut) | Pas de lecture « livre » continue ; pas de prev/next. |
| **Contrat `book.yml`** | Définit Vision → Décideurs → Pratique → Catalogue → Contribuer, avec phases, agents, gates, lens, patterns, citations | Plusieurs pages déclarées n'existent pas (`catalogue/gates`, `catalogue/lens`, `catalogue/patterns`, `traces`…). |
| **Citations** (`_data/citations.yml`) | Bibliographie riche (Abelson, Beck, Cockburn, Evans, Fowler, Martin…) | Peu mobilisée dans les pages agents/gates. |

Le `book.yml` encode **déjà** la cible structurelle. L'essentiel du travail est donc : **slimmer le menu, basculer les pages sur le layout handbook, combler les pages manquantes, et brancher les citations**.

---

## 3. Architecture cible

### 3.1 Menu du haut — réduit à 4 portes

Modèle learning-path : marque + poignée de liens. On ne garde que les **portes d'entrée**, jamais le catalogue (qui vit dans la sidebar).

| Lien | FR | EN | Rôle |
| --- | --- | --- | --- |
| Marque | `SKRAFT` → `/fr/` | `SKRAFT` → `/en/` | Retour accueil. |
| 1 | **Le handbook** → `/fr/pipeline/` | **The handbook** → `/en/pipeline/` | Entrée dans le livre (ouvre la sidebar). |
| 2 | **Pour décideurs** → `/fr/for-executives` | **For executives** → `/en/for-executives` | Porte business. |
| 3 | **Démarrer** → `/fr/getting-started` | **Get started** → `/en/getting-started` | Porte praticien. |
| 4 | Toggle **FR / EN** | — | Langue. |

Tout le reste (Référence Agents, Référence Skills, Citations, Customisation, Architecture, Concepts, Contribuer) **quitte le menu haut** et devient accessible **uniquement via la sidebar gauche** du handbook. Les pages historiques orphelines (`architecture`, `concepts`, `getting-started` au sens ancien) sont soit repliées dans la sidebar, soit conservées hors-menu (atteignables par lien direct) pour ne pas casser les URLs.

### 3.2 Corps du site — un handbook à sidebar gauche

Toutes les pages du livre passent sur `layout: doc`. La sidebar est pilotée par `book.yml`, **réorganisée autour des 5 phases** afin que la navigation raconte l'articulation du pipeline.

```
SIDEBAR (handbook)
├── DÉMARRER
│   ├── SKRAFT en 15 min          (accueil / vision)
│   ├── HVE → SKRAFT              (continuité)
│   └── Pour décideurs            (ROI / TTM)
│
├── LE PIPELINE  ── vue d'ensemble : la spirale des 5 phases
│   ├── DISCOVER   → agent + reviewer + gates de la phase
│   ├── DISCUSS    → agent + reviewer + gates de la phase
│   ├── DESIGN     → agent + reviewer + gates de la phase
│   ├── DISTILL    → agent + reviewer + gates de la phase
│   └── DELIVER    → agent + reviewer + gates de la phase
│
├── LES PRINCIPES  ── le « pourquoi », chaque règle citée
│   ├── Pourquoi review avant review
│   ├── Use Case · CQS · CQRS
│   ├── Outside-In TDD · Red-Green-Refactor
│   ├── Walking Skeleton
│   ├── Mutation testing
│   └── Object Calisthenics · Clean Architecture
│
├── LE CATALOGUE  ── la référence opposable
│   ├── Agents (index + 1 page/agent)
│   ├── Skills  (index + pages)
│   ├── Gates   (Gxx par phase)
│   ├── Lentilles de revue (4 lens)
│   ├── Patterns d'architecture
│   └── Citations (bibliographie)
│
└── ALLER PLUS LOIN  ── deep-dives (chapitres dédiés)
    └── 1 page par approche qui « mérite un vrai chapitre »
```

L'ordre **Phase → Principe → Catalogue → Deep-dive** suit l'intention : on découvre le flux, on comprend pourquoi, on retrouve la référence, on creuse.

### 3.3 Articulation entre phases (architecture)

Une page **« Le pipeline »** (`/pipeline/index.md`) ouvre la section avec un schéma Mermaid de la spirale : entrée unique (`skraft-orchestrator`), enchaînement DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER, et pour chaque phase l'**agent producteur** + son **reviewer indépendant** + les **gates** franchies avant de passer à la phase suivante. Conforme à la préférence utilisateur : un schéma de séquence montrant l'entrée unique et la chaîne interne de sous-agents.

---

## 4. Contrats de contenu

### 4.1 Page de phase

Chaque page `/pipeline/{phase}` suit ce gabarit :

```markdown
# {PHASE}

> Ce que la phase produit, en une phrase.

## But de la phase
Le problème qu'elle résout dans le cycle.

## L'agent et son reviewer
- Agent producteur : rôle, entrée, sortie.
- Reviewer indépendant : ce qu'il oppose.

## Les gates franchies ici
Liste des Gxx de la phase → lien vers /catalogue/gates#Gxx.
Chaque gate : ce qu'elle vérifie + POURQUOI (citation).

## Comment elle s'articule
Ce qui entre (phase amont), ce qui sort (phase aval).

## Pour aller plus loin
Liens vers principes (§ Principes) et deep-dives.
```

### 4.2 Page d'agent

Conforme au template §4.4 de la spec socle, mais avec emphase sur **but + pourquoi** :

```markdown
# {Agent}

> Rôle en une phrase.

## But — ce qu'il accomplit
## Pourquoi cette forme   ← 1 à 3 paragraphes, CHACUN défendu par une citation nommée
## Entrée / Sortie
## Invariants opposables
## Voir aussi
```

### 4.3 Principe / Gate — règle citée

**Règle d'or (héritée de la spec socle §4.2)** : chaque principe et chaque gate **défend** une pratique via une citation nommée. Si on retire la citation, le paragraphe perd sa justification.

Exemples d'ancrage (déjà présents dans `citations.yml`) :

| Principe / Gate | Citation nommée |
| --- | --- |
| Command-Query Separation | Bertrand Meyer, *Object-Oriented Software Construction*, 1997 |
| Use Case = unité de livraison | Alistair Cockburn, *Writing Effective Use Cases*, 2001 |
| Outside-In TDD | Kent Beck, *Test-Driven Development by Example*, 2003 |
| « Go fast by going well » | Robert C. Martin, *Clean Architecture*, 2017 |
| Ubiquitous Language | Eric Evans, *Domain-Driven Design*, 2003 |
| Refactoring discipliné | Martin Fowler, *Refactoring*, 1999 / *PEAA*, 2002 |
| Specification by Example | Gojko Adzic, *Specification by Example*, 2011 |
| Mutation testing | (couverture qui prouve la détection) |

Le lint `scripts/check-citations.mjs` reste la garde : toute citation publiée doit exister dans `citations.yml`.

### 4.4 Deep-dive (« aller plus loin »)

Une approche obtient un chapitre dédié **seulement si** : (a) elle dépasse une page de référence, (b) elle s'appuie sur ≥ 1 ouvrage, (c) elle illustre par un **exemple concret** (extrait de code, artefact, ou cas pipeline). Sinon elle reste une section dans la page de principe. Gabarit :

```markdown
# {Approche} — pourquoi et comment

> Accroche.

## Le problème (contexte concret)
## Ce que disent les sources   ← livres + citations nommées
## Application dans SKRAFT       ← exemple concret (code/artefact)
## Pièges & anti-patterns
## Sources
```

---

## 5. Travaux (lots)

| Lot | Contenu | Nature |
| --- | --- | --- |
| **L1 — Menu** | Réécrire `_data/nav.yml` → 4 portes (§3.1). Basculer les liens retirés vers la sidebar. | Config |
| **L2 — Layout** | Basculer toutes les pages du livre sur `layout: doc`. Vérifier prev/next et lien actif. | Frontmatter |
| **L3 — Sidebar par phase** | Réorganiser `book.yml` (`parts`) selon §3.2 (Démarrer / Pipeline / Principes / Catalogue / Aller plus loin). Adapter `doc.html` si le groupement par phase l'exige. | Config + layout |
| **L4 — Pages de phase** | `/pipeline/index` (schéma spirale) + 5 pages phase (§4.1), FR + EN. | Contenu |
| **L5 — Agents** | Index agents + 1 page/agent avec but + pourquoi cité (§4.2), FR + EN. | Contenu |
| **L6 — Principes & gates** | Pages principes (§4.3) + `/catalogue/gates`, `/catalogue/lens`, `/catalogue/patterns` avec citations nommées. | Contenu |
| **L7 — Deep-dives** | Pages « aller plus loin » pour les approches qui le méritent (§4.4). | Contenu |
| **L8 — Lint & smoke** | `check-citations.mjs` vert ; smoke test nav (4 portes) + sidebar présente. | CI |

Lots indépendants → exécutables en parallèle après L1–L3 (qui posent la structure).

---

## 6. Critères d'acceptation

1. ✅ Le menu haut ne contient que les **portes** (§3.1) — ≤ 4 liens + toggle langue, FR et EN.
2. ✅ Toute page du livre porte `layout: doc` et affiche la **sidebar gauche** groupée par section (§3.2).
3. ✅ La section **Pipeline** présente les 5 phases ; chaque phase montre **agent + reviewer + gates** et **comment elle s'articule** avec l'amont/aval.
4. ✅ Chaque **agent** a une page « but + pourquoi », le pourquoi étant défendu par ≥ 1 **citation nommée**.
5. ✅ Chaque **principe** et chaque **gate** publié cite une source nommée existant dans `citations.yml` (lint vert).
6. ✅ Au moins les approches éligibles (§4.4) ont une page **deep-dive** avec ≥ 1 ouvrage + 1 exemple concret.
7. ✅ Aucune URL existante cassée (pages retirées du menu restent atteignables).

---

## 7. Hors périmètre

- Refonte visuelle / nouveaux tokens de design.
- Migration de stack ou de plateforme de déploiement.
- Réécriture des agents/skills du plugin.
- Recherche full-text, versionning multi-versions (renvoyés à v2, cf. spec socle §11).

---

## 8. Questions ouvertes

À trancher avant `runSubagent` :

1. **Libellé de la porte handbook** : « Le handbook », « Le pipeline », ou « Le livre » ?
2. **Pages historiques** (`architecture`, `concepts`) : repliées dans la sidebar « Principes », ou fusionnées dans les pages de principe correspondantes ?
3. **Granularité agents** : une page par agent (12 pages) ou une page par phase regroupant agent + reviewer (5 pages) ? (§3.2 propose les deux niveaux — à confirmer.)
4. **Liste des deep-dives** retenus pour ce premier passage (parmi : Outside-In TDD, Walking Skeleton, Mutation testing, Clean Architecture, Review-before-review).
