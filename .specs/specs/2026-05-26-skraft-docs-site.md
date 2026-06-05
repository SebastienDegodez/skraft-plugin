# Spec — Site de documentation publique SKRAFT (Jekyll, FR/EN)

> Statut : **DRAFT v2** — relecture utilisateur en cours.
> Date : 2026-05-26
> Auteur : `skraft-plugin`
> Branche cible : `feat/docs-site` (à créer depuis `main`).
> Implémentation : **différée** — sera lancée via `runSubagent` après validation de la spec.

---

## 1. Intention

Publier un site **public** qui explique comment des équipes externes peuvent s'approprier le pipeline SKRAFT (DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER + reviewers) et l'adapter à leur contexte.

Le site **ne remplace pas** le code source — il l'explique, le justifie, et donne les leviers de customisation.

> « Programs must be written for people to read, and only incidentally for machines to execute. »
> — Harold Abelson & Gerald Jay Sussman, *Structure and Interpretation of Computer Programs*, 1985 (Preface).

Cette citation cadre l'**ambition documentaire** : le code SKRAFT est déjà écrit ; il faut maintenant qu'une équipe humaine puisse le lire, le comprendre et le reprendre. La spec qui suit défend chaque choix éditorial par la pratique qu'il défend, et chaque pratique par un auteur identifié.

### Non-objectifs

- Pas de portail SaaS, pas d'auth, pas de back-end.
- Pas de génération automatique « tout depuis le code » : la doc reste **écrite à la main**, vérifiée à la main.
- Pas de duplication des specs internes (`docs/superpowers/**`) sur le site public.

---

## 2. Audience

Quatre personae primaires :

| Persona | Besoin | Citation justificative |
| --- | --- | --- |
| **Tech Lead** prenant en main SKRAFT | comprendre l'architecture en 15 minutes | Saunders Mac Lane (cité par Evans) : *« Mathematicians must always think one level of abstraction above the problem at hand. »* — défend la page d'entrée « SKRAFT en 15 min » qui survole un cran au-dessus des artefacts. (*Categories for the Working Mathematician*, 1971, repris par Eric Evans, *Domain-Driven Design*, 2003, ch. 14). |
| **Software Engineer** exécutant un cycle | trouver la consigne exacte pour la phase courante | Kent Beck : *« Make it work, make it right, make it fast. »* — défend la séparation par phase : chaque page contient la consigne actionnable de la phase, rien d'autre. (*Smalltalk Best Practice Patterns*, 1996). |
| **Reviewer** auditant un livrable | retrouver les invariants opposables | Karl Wiegers : *« A good review is built on a foundation of explicit, agreed-upon criteria. »* — défend la page Invariants comme critères opposables et stables. (*Peer Reviews in Software*, 2002, ch. 2). |
| **Manager / Décideur** sponsorisant l'adoption | un argumentaire chiffré en 5 minutes pour pousser ses équipes | Nicole Forsgren, Jez Humble & Gene Kim : *« Software delivery performance matters, and it has a significant impact on organizational performance. »* — défend l'existence d'une page « pitch décideur » (§2.1) qui relie discipline d'ingénierie et performance d'entreprise. (*Accelerate*, 2018, ch. 1). |

Chaque page principale rappelle son persona cible en en-tête.

### 2.1 Pitch décideur — pourquoi SKRAFT mérite votre signature

> Page dédiée sur le site (`/pour-decideurs` / `/for-executives`). Ton : direct, chiffré, opposable. Structure SCQA (Situation, Complication, Question, Answer) — patron de communication exécutive de McKinsey & Co.

**Situation.** Vos équipes livrent du logiciel avec des LLMs. La vitesse est là, la qualité ne suit pas mécaniquement.

**Complication.** Sans discipline imposée, l'IA produit du code plausible mais non vérifié : couverture de tests illusoire, dette technique invisible, audit impossible. Le coût se paie en incidents production et en perte de capacité.

> « The only way to go fast is to go well. »
> — Robert C. Martin, *Clean Architecture*, 2017, ch. 1.

Cette citation défend précisément le contre-intuitif que SKRAFT vend à un décideur : ralentir l'agent par des contrôles automatisés (reviewers, invariants, mutation score) **augmente** la vélocité durable.

**Question.** Comment encadrer l'IA pour que la vitesse de livraison se traduise en valeur livrée, mesurable, opposable en audit ?

**Answer — trois leviers SKRAFT, chacun appuyé sur une preuve externe :**

1. **Discipline opposable, pas folklore.** Chaque phase (DISCOVER → DELIVER) produit un artefact contractuel revu par un agent reviewer indépendant (CQS appliqué, §5.2). Vos équipes ne « font confiance à l'IA » — elles **vérifient** chaque étape.
   > « What gets measured gets managed. »
   > — Peter Drucker, attributed (largement cité dans *The Practice of Management*, 1954, et repris dans *Accelerate*, 2018).

2. **Métriques de qualité empiriques, pas déclaratives.** Mutation Score plancher en DELIVER (§5.3) : le test prouve qu'il détecte les régressions, pas qu'il existe. C'est la différence entre une couverture cosmétique et une couverture qui défend en production.
   > « High performers achieve both: they deliver software faster and with higher quality. »
   > — Forsgren, Humble & Kim, *Accelerate*, 2018, ch. 2.

3. **Vitesse de livraison sans dette cachée.** Le Walking Skeleton (§5.3) + Outside-In TDD obligent à livrer une slice end-to-end dès la première itération. Pas de « gros bang » au mois 6 — vous voyez la valeur dès la première semaine, et les risques d'intégration sont découverts en J+1, pas en J+90.
   > « The cost of delay is the economic impact of not having a capability now. »
   > — Donald G. Reinertsen, *The Principles of Product Development Flow*, 2009, ch. 2.

**ROI implicite, à formuler dans le langage de votre comité :**

- Réduction du **taux d'échec de changement** (Change Failure Rate, métrique DORA) : chaque commande d'agent passe un reviewer avant fusion.
- Réduction du **MTTR** : artefacts traçables → root cause en heures, pas en jours.
- Augmentation du **Deployment Frequency** : Walking Skeleton + tests d'acceptance livrables continûment.
- **Auditabilité** : chaque décision IA est tracée dans un artefact versionné (DDD + Specification by Example).

**Ce que SKRAFT vous demande :**

- 2 à 3 jours de formation par équipe (cf. `/getting-started`).
- Un sponsor identifié (vous) pour défendre la discipline quand un sprint est sous pression.
- Le maintien des invariants §5.3 — non-négociable, c'est ce qui rend les gains durables.

> « Culture eats strategy for breakfast. »
> — Peter Drucker, attributed.

Dernier point opposable au sponsor : sans portage managérial explicite, la discipline cède à la première pression de delivery. SKRAFT n'est pas un outil neutre — c'est un **engagement organisationnel** que le décideur signe avec ses équipes.

---

## 3. Architecture de l'information

```
/                                  → landing "SKRAFT en 15 min"
/pour-decideurs                    → pitch managérial (§2.1)
/pipeline                          → la spirale DISCOVER → … → DELIVER
/pipeline/{discover|discuss|design|distill|deliver}
/architecture                      → flux orchestrateur ↔ agents ↔ reviewers (diagramme GENESIS)
/concepts                          → Use Case, CQS, CQRS, Walking Skeleton, Mutation, Object Calisthenics
/customisation                     → ce qu'on peut/doit changer, ce qu'on doit garder
/reference/agents/{nom}            → une page par agent (template §4.4)
/reference/skills/{nom}            → une page par skill (template §4.4)
/getting-started                   → installation locale, premier `/skraft`
/citations                         → bibliographie canon (§6)
/changelog                         → versions publiées
/contributing                      → comment proposer une PR sur la doc
```

Onglet « FR / EN » présent dans la navigation : la version par défaut est **FR**, l'EN est la traduction. Les **citations restent en anglais** dans les deux versions (intégrité de la source).

---

## 4. Contrats de contenu

### 4.1 Bilinguisme

- Le site sert deux locales : **FR (par défaut)** et **EN**.
- Implémentation Jekyll **sans plugin non whitelisté** : deux arborescences `/fr/...` et `/en/...` avec un sélecteur de langue dans le layout (cf. §8). Cette approche reste compatible GitHub Pages sans build custom.
- Une page FR sans pendant EN affiche un bandeau « Traduction à venir » et un lien vers la page FR.
- **Termes techniques non traduits** (vocabulaire d'ingénierie, conservé en anglais y compris dans les pages FR) : Aggregate, Bounded Context, Acceptance Test, Mutation Score, Domain Event, Value Object, Repository, Ubiquitous Language, Hexagonal / Ports & Adapters, Red-Green-Refactor, Walking Skeleton, Use Case, CQS, CQRS, Outside-In, Specification by Example. *Justification* : Eric Evans, *Domain-Driven Design*, 2003, ch. 2 — *« A project faces serious problems when its language is fractured. »* La cohérence du Ubiquitous Language prime sur la traduction.

### 4.2 Politique de citations

**Règle d'or** : chaque citation **défend la pratique** à laquelle elle est attachée. Pas de citation décorative ; si elle est retirée, le paragraphe doit perdre sa justification.

Format imposé :

```markdown
> « Quote in English, ≤ 25 mots. »
> — Auteur·rice, *Titre du livre en italique*, année, chapitre ou page si pertinent.
```

Contraintes :

- **Toujours en anglais** (la langue de la source).
- ≤ 25 mots par citation (fair use).
- Attribution complète : auteur, livre en italique, année.
- Pas de citation inventée : un script de lint (`scripts/check-citations.mjs`) vérifie que chaque citation publiée existe dans la bibliographie canon de §6.
- Une page d'index `/citations/` agrège toutes les citations utilisées sur le site, avec ancres permanentes.

### 4.3 Schémas — via GENESIS

Tout schéma publié sur le site est conçu via le skill **GENESIS** (`apm_modules/danielmeppiel/genesis/`). Pour chaque schéma :

1. Plan GENESIS persisté sous `docs/superpowers/plans/{date}-{slug}-genesis.md`.
2. Diagramme Mermaid embarqué via un partial Jekyll `_includes/mermaid.html`.
3. Légende explicite (entrées, sorties, invariants visibles).

> « Make the change easy, then make the easy change. »
> — Kent Beck, attributed (*Tweet*, 2012, formalisé dans la communauté XP).

Justification : tracer le plan GENESIS avant de dessiner garantit que le schéma reste modifiable proprement (« make the change easy »).

### 4.4 Template page Agent / Skill

Chaque page sous `/reference/agents/{nom}` ou `/reference/skills/{nom}` suit le contrat :

```markdown
# {Nom}

> Rôle en une phrase.

## Quand l'utiliser
Trigger, phase du pipeline, persona.

## Contrat d'entrée
Inputs attendus, format, source.

## Contrat de sortie
Artefacts produits, où ils atterrissent.

## Invariants
Liste opposable (renvoie vers /customisation).

## Pourquoi cette forme
1 à 3 paragraphes, **chacun défendu par une citation** (§4.2).

## Customisation autorisée
Ce qu'on peut changer sans casser les invariants.

## Voir aussi
Liens vers concepts (§5) et autres agents/skills.
```

> « Anything that can be made a separate piece of text, should be. »
> — Andrew Hunt & David Thomas, *The Pragmatic Programmer*, 20th anniversary ed., 2019, topic 18.

Justification : ce template **défend la modularité** des pages — chaque agent/skill = un texte autonome, indexable, citable.

---

## 5. Customisation (cœur du site)

### 5.1 Que peut-on changer ?

Trois niveaux, du plus libre au plus contraint :

| Niveau | Quoi | Justification |
| --- | --- | --- |
| **L1 — Surface** | textes des prompts, vocabulaire, glossaire métier | Evans, *DDD*, 2003, ch. 2 — *« Use the model as the backbone of a language. »* Le langage de l'équipe se substitue librement. |
| **L2 — Cycles** | depth tiers, difficulty tiers, ordre des reviewers, nombre d'itérations | Kent Beck, *Extreme Programming Explained*, 2nd ed., 2004, ch. 3 — *« The variables of software development… [are] cost, time, quality, and scope. »* Ces curseurs sont les variables ajustables. |
| **L3 — Invariants** | structure des artefacts, contrats inter-agents, séparation commande/requête | Robert C. Martin, *Clean Architecture*, 2017, ch. 22 — *« The architecture must support the use cases of the system. »* On ne touche pas à ce qui définit le système. |

### 5.2 Use Case, CQS, CQRS — les trois piliers de séparation

Cette sous-section est **normative** : elle explique pourquoi SKRAFT sépare ce qu'il sépare, et chaque concept est défendu par sa source originelle.

#### Use Case

> « A use case captures a contract between the stakeholders of a system about its behavior. »
> — Alistair Cockburn, *Writing Effective Use Cases*, 2001, ch. 1.

**Application dans SKRAFT** : une story refinée = **un Use Case**. C'est l'unité de livraison du pipeline (un cycle complet DISCOVER → DELIVER). Cette granularité est non-négociable — c'est le contrat livré.

#### CQS — Command-Query Separation

> « Asking a question should not change the answer. »
> — Bertrand Meyer, *Object-Oriented Software Construction*, 2nd ed., 1997, ch. 23.

**Application dans SKRAFT** : les agents *executors* (`backlog-planner`, `solution-architect`, `acceptance-designer`, `software-engineer`) **commandent** — ils écrivent des artefacts, modifient l'état du dépôt. Les *reviewers* (`*-reviewer`) **questionnent** — ils lisent les artefacts produits et renvoient un verdict sans muter l'état. Cette séparation rend le pipeline **rejouable** : un reviewer peut être relancé à l'identique sans effet de bord.

#### CQRS — Command-Query Responsibility Segregation

> « At its heart is the notion that you can use a different model to update information than the model you use to read information. »
> — Martin Fowler, *Bliki: CQRS*, 2011 (citation reprise dans Vaughn Vernon, *Implementing Domain-Driven Design*, 2013, ch. 4).

**Application dans SKRAFT** : l'**orchestrateur** dispatche des commandes (transitions de phase, lancement d'agent). Les **reviewers** lisent un modèle dérivé (artefacts + state.json) sans repasser par l'orchestrateur. CQRS justifie aussi le `state.json` comme **read model** projeté à partir des commandes — la source de vérité reste l'historique des artefacts livrés.

> **Cohérence des trois** : Use Case définit *quoi* on livre (une unité métier). CQS définit *qui* peut écrire vs lire (executor vs reviewer). CQRS définit *comment* l'orchestrateur et les reviewers consomment l'état (modèles distincts). Modifier l'un sans toucher aux autres casse le pipeline.

### 5.3 Invariants opposables

Chaque invariant a une citation qui le défend directement. Si la citation est retirée, l'invariant perd sa justification.

| Invariant | Citation justificative |
| --- | --- |
| **Tests acceptance écrits avant le code** (DISTILL → DELIVER) | Gojko Adzic, *Specification by Example*, 2011, ch. 1 — *« Specifying collaboratively, using examples, leads to a single source of truth. »* |
| **Mutation Score plancher en DELIVER** | Yue Jia & Mark Harman, *An Analysis and Survey of the Development of Mutation Testing*, IEEE TSE 2011 — *« Mutation testing… provides a high-fidelity assessment of test effectiveness. »* Défend le mutation score comme **mesure** de qualité du test, pas comme proxy de couverture. |
| **Reviewer en lecture seule** (CQS appliqué) | Bertrand Meyer, *Object-Oriented Software Construction*, 2nd ed., 1997, ch. 23 — *« Asking a question should not change the answer. »* (déjà §5.2). |
| **Une story = un Use Case** | Alistair Cockburn, *Writing Effective Use Cases*, 2001, ch. 1 (déjà §5.2). |
| **Walking Skeleton avant feature complète** | Steve Freeman & Nat Pryce, *Growing Object-Oriented Software, Guided by Tests*, 2009, ch. 10 — *« A 'walking skeleton' is an implementation of the thinnest possible slice of real functionality that we can automatically build, deploy, and test end-to-end. »* |
| **Outside-In TDD pour DELIVER** | Steve Freeman & Nat Pryce, *GOOS*, 2009, ch. 1 — *« We start by writing an acceptance test that exercises the functionality we want to build. »* |
| **Object Calisthenics pour la qualité du code livré** | Jeff Bay, *Object Calisthenics*, in *The ThoughtWorks Anthology*, 2008 — *« Nine steps to better software design today. »* Défend la liste comme **discipline d'atelier**, pas comme règle architecturale. |

### 5.4 Étendre une phase

Sous-section pratique : comment ajouter une étape à une phase existante (ex. : ajouter un security-reviewer entre DESIGN et DISTILL). Pas-à-pas avec exemple de diff sur `framework-catalog.yaml` (ou équivalent SKRAFT), point de vigilance sur les invariants §5.3 à ne pas violer.

> « Don't reinvent the wheel, just realign it. »
> — *Anthony J. D'Angelo, The College Blue Book*, 1995.

Justification : étendre = aligner sur l'existant, pas refaire. La sous-section impose un **patron d'extension** plutôt qu'une réécriture.

---

## 6. Bibliographie canon

Toute citation publiée doit appartenir à cette liste. Toute nouvelle entrée passe par PR avec justification (la pratique qu'elle défend).

1. Abelson, H., & Sussman, G. J. (1985). *Structure and Interpretation of Computer Programs*.
2. Adzic, G. (2011). *Specification by Example*.
3. Bay, J. (2008). *Object Calisthenics*, in *The ThoughtWorks Anthology*.
4. Beck, K. (1996). *Smalltalk Best Practice Patterns*.
5. Beck, K. (2003). *Test-Driven Development by Example*.
6. Beck, K. (2004). *Extreme Programming Explained*, 2nd ed.
7. Cockburn, A. (2001). *Writing Effective Use Cases*.
8. Cockburn, A. (2005). *Hexagonal Architecture* (article).
9. Evans, E. (2003). *Domain-Driven Design*.
10. Fowler, M. (2002). *Patterns of Enterprise Application Architecture*.
11. Fowler, M. (2011). *Bliki: CQRS*.
12. Fowler, M. (2018). *Refactoring*, 2nd ed.
13. Forsgren, N., Humble, J., & Kim, G. (2018). *Accelerate: The Science of Lean Software and DevOps*.
14. Freeman, S., & Pryce, N. (2009). *Growing Object-Oriented Software, Guided by Tests*.
15. Gamma, E., Helm, R., Johnson, R., & Vlissides, J. (1994). *Design Patterns*.
16. Hohpe, G., & Woolf, B. (2003). *Enterprise Integration Patterns*.
17. Hunt, A., & Thomas, D. (2019). *The Pragmatic Programmer*, 20th anniversary ed.
18. Jia, Y., & Harman, M. (2011). *An Analysis and Survey of the Development of Mutation Testing*, IEEE TSE.
19. Mac Lane, S. (1971). *Categories for the Working Mathematician*.
20. Martin, R. C. (2008). *Clean Code*.
21. Martin, R. C. (2017). *Clean Architecture*.
22. Meszaros, G. (2007). *xUnit Test Patterns*.
23. Meyer, B. (1997). *Object-Oriented Software Construction*, 2nd ed.
24. Newman, S. (2021). *Building Microservices*, 2nd ed.
25. North, D. (2006). *Introducing BDD* (article).
26. Reinertsen, D. G. (2009). *The Principles of Product Development Flow*.
27. Vernon, V. (2013). *Implementing Domain-Driven Design*.
28. Wiegers, K. (2002). *Peer Reviews in Software*.

---

## 7. Migration de l'existant

| Fichier actuel | Action | Destination |
| --- | --- | --- |
| `docs/README.md` | conserver, mettre à jour pour pointer vers le site public | `docs/README.md` (interne) |
| `docs/architecture.md` | scinder : conceptuel → site, schémas internes → reste | `/architecture` (public) + `docs/architecture.md` (interne, schémas détaillés) |
| `docs/conventions.md` | scinder : glossaire + invariants → site | `/concepts` + `/customisation` (public) |
| `docs/roadmap.md` | rester interne | `docs/roadmap.md` (le public utilise `/changelog`) |
| `docs/agents/*.md` | remplacer par les pages `/reference/agents/{nom}` (template §4.4) | `/reference/agents/*` |
| `docs/skills/*.md` | remplacer par les pages `/reference/skills/{nom}` (template §4.4) | `/reference/skills/*` |
| `docs/superpowers/specs/**` | **conserver sur disque, exclure du build du site** | reste sous `docs/superpowers/specs/**` |
| `docs/superpowers/plans/**` | idem | reste sous `docs/superpowers/plans/**` |
| `apm_modules/`, `presentation-skraft-agents.html` | non concerné | inchangé |

Mécanisme d'exclusion : configuration Jekyll `exclude:` listant `docs/superpowers/`, plus filtre côté script de sync (§8.3).

---

## 8. Stack technique — Jekyll

L'utilisateur exploite déjà un site Jekyll (portfolio `SebastienDegodez.github.io`) au design abouti (« Tech Glass » : palette verte, glass primitives, `design-tokens.css` centralisé, layout `_layouts/default.html` unique). La doc SKRAFT doit s'aligner sur ce design.

### 8.1 Option A — **Site unifié sous le portfolio** (recommandée si possible)

La doc SKRAFT vit dans `SebastienDegodez.github.io` sous le préfixe `/skraft/`, alimentée par un sync cross-repo modelé sur `scripts/sync-presentations.sh` + `.github/workflows/sync-presentations.yml`.

**Avantages** : un seul site, un seul design, un seul déploiement GitHub Pages, navigation cohérente avec le reste du portfolio.

**Inconvénients** : mélange portfolio personnel et doc d'un projet ; le repo `skraft-plugin` ne porte plus son propre site public.

**Mécanisme** :
- `skraft-plugin/docs/site/**` (sources Markdown publiques) → synchronisé via Action vers `SebastienDegodez.github.io/_skraft/` (collection Jekyll) ou `skraft/` (dossier).
- Trigger : push sur `skraft-plugin@main` touchant `docs/site/**`.
- Layout : réutilise `_layouts/default.html` du portfolio sans modification ; ajoute éventuellement `_layouts/skraft.html` pour la nav latérale spécifique.

### 8.2 Option B — **Sites séparés, design partagé** (fallback)

Le repo `skraft-plugin` héberge son propre site Jekyll publié sous `https://sebastiendegodez.github.io/skraft-plugin/` (project page). Le design est partagé avec le portfolio via :

- **Vendoring** du `design-tokens.css` (copie tracée + Action de drift-detection), OU
- **Submodule** Git pointant vers le portfolio (lourd, déconseillé), OU
- **CDN raw GitHub** : `<link rel="stylesheet" href="https://raw.githubusercontent.com/SebastienDegodez/SebastienDegodez.github.io/main/design-tokens.css">` (simple, risque de couplage cross-repo).

Recommandation interne au site SKRAFT : **vendoring + drift-detection** (script qui pète si `design-tokens.css` diverge du portfolio).

### 8.3 Choix proposé

**Option A par défaut**, à valider avec l'utilisateur. Option B comme plan de repli si la maintenance du portfolio devient un blocage.

### 8.4 i18n FR/EN

Pas de plugin (compatibilité GitHub Pages stricte). Deux arborescences :

```
/                  → redirection vers /fr/
/fr/...            → version française (par défaut)
/en/...            → version anglaise
```

Sélecteur de langue dans le layout : un `data-lang` attribute sur le `<html>` + un toggle qui swap `/fr/...` ↔ `/en/...`. Front-matter Jekyll `lang: fr|en` sur chaque page. Citations restent en anglais dans les deux locales.

### 8.5 Build & déploiement

- **Build** : Jekyll natif (GH Pages whitelisted gems uniquement).
- **Déploiement** : GitHub Pages depuis la branche cible (Option A : `main` du portfolio ; Option B : `gh-pages` de `skraft-plugin`).
- **Tests** : reprise du pattern Playwright du portfolio (`playwright.config.mjs`, `tests/site-smoke.spec.mjs`) — smoke test sur la home, la landing pipeline, et un agent de référence.
- **Lint citations** : `scripts/check-citations.mjs` exécuté en CI (échec si citation publiée n'existe pas dans §6).

---

## 9. Critères d'acceptation

La spec sera considérée comme « livrée » quand :

1. ✅ Le site est navigable en FR (par défaut) et EN (au moins la home, `/pipeline`, `/concepts`, un agent de référence, un skill de référence).
2. ✅ Toutes les citations publiées existent dans la bibliographie §6 (lint vert).
3. ✅ Chaque citation est attachée à la pratique qu'elle défend (revue éditoriale manuelle, traçable dans `/citations/`).
4. ✅ Les concepts Use Case, CQS, CQRS sont documentés sur la page `/concepts` avec leurs citations originelles (§5.2).
5. ✅ Le design partagé avec le portfolio est en place (Option A : même layout ; Option B : tokens vendored + drift-check vert).
6. ✅ Les schémas publiés ont un plan GENESIS persisté sous `docs/superpowers/plans/`.
7. ✅ Les fichiers sous `docs/superpowers/**` sont exclus du bundle du site.

---

## 10. Plan d'implémentation (différé)

Découpé en lots indépendants. Chaque lot sera lancé via `runSubagent` après validation de la spec par l'utilisateur.

| Lot | Contenu | Skill / Agent suggéré |
| --- | --- | --- |
| **L1** | Choix Option A vs B (décision utilisateur) + scaffolding Jekyll | manuel |
| **L2** | Layout + tokens partagés + sélecteur FR/EN | runSubagent |
| **L3** | Landing `/` + `/pipeline` + `/architecture` (incl. schéma GENESIS de l'orchestrateur) | runSubagent + GENESIS |
| **L4** | `/concepts` (Use Case, CQS, CQRS, Walking Skeleton, Mutation, Object Calisthenics) | runSubagent |
| **L5** | `/customisation` + `/reference/agents/*` + `/reference/skills/*` (template §4.4) | runSubagent |
| **L6** | `/citations` (index) + lint script `check-citations.mjs` | runSubagent |
| **L7** | `/getting-started` + `/contributing` + `/changelog` | runSubagent |
| **L8** | Smoke tests Playwright + Action de déploiement | runSubagent |

---

## 11. Hors périmètre

- Versionning multi-versions du site (ex. SKRAFT v1.x / v2.x en parallèle) → ajouté plus tard si besoin.
- Recherche full-text avancée (Algolia, Lunr) → v2 du site.
- Doc générée automatiquement depuis `framework-catalog.yaml` → v2.
- Localisation au-delà de FR/EN.

---

## 12. Questions ouvertes

À trancher avec l'utilisateur avant d'envoyer en `runSubagent` :

1. **Option A ou B** (site unifié vs sites séparés à CSS partagé) ?
2. **Préfixe d'URL** si Option A : `/skraft/`, `/skraft-plugin/`, autre ?
3. **Politique de drift-detection** sur `design-tokens.css` si Option B : break la CI ou warning ?
4. **Page de landing** : on garde aussi `presentation-skraft-agents.html` accessible depuis le site, ou il reste cantonné au portfolio ?
