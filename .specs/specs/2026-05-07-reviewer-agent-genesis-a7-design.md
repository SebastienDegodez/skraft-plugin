# Spec — Agent Reviewer (Genesis A7 Adversarial Review)

## Contexte

Le repository `skraft-plugin` contient l'agent `software-engineer` et ses skills (`outside-in-tdd`, `red-synthesize-green`, `clean-architecture-testing`). L'agent produit du code, des tests et un journal TDD. Aujourd'hui, personne ne revoit ces artefacts — l'engineer s'auto-certifie via sa propre checklist de quality gates.

Cette spec définit l'agent `software-engineer-reviewer` : un pair adversarial qui audite la production de l'engineer de manière indépendante, en utilisant le pattern Genesis A7 ADVERSARIAL REVIEW comme architecture.

## Objectifs

1. Détecter les défauts que l'auto-discipline de l'engineer manque (test theater, violations d'architecture, dérive d'intention).
2. Fournir un verdict structuré, parseable par machine (`approved` / `changes_requested` / `rejected`).
3. Garantir l'isolation entre les concerns de revue — pas de contamination croisée entre les lenses.
4. S'intégrer dans le SDLC skraft élargi (aux côtés des futurs agents : acceptance-designer, solution-architect, etc.).

## Hors périmètre

- Modifier du code ou des tests (le reviewer est read-only).
- Proposer des corrections (le reviewer constate, il ne corrige pas).
- L'implémentation du skill `craft-discipline` (livrable séparé).
- L'agent orchestrateur (le reviewer est dispatché par l'utilisateur ou un orchestrateur existant).
- L'alignement avec les scénarios Gherkin (future lens, pas cette itération).

## Patterns Genesis appliqués

| Pattern | Rôle dans ce design |
|---------|-------------------|
| **A7 ADVERSARIAL REVIEW** | Architecture de haut niveau — revue multi-lenses avec spawn en contexte frais |
| **B1 FAN-OUT + SYNTHESIZER** | Topologie — 4 lenses parallèles, synthèse unique |
| **C2 PERSONA PRELOAD** | Chaque lens charge une persona spécialisée au spawn |
| **C3 THREAD SPAWN** | Chaque lens tourne dans un contexte frais (pas de contamination) |
| **S3 ORCHESTRATOR FACADE** | L'agent reviewer est le point d'entrée unique |
| **S4 VALIDATION DECORATOR** | L'étape de synthèse gate le verdict |
| **B4 PLAN MEMENTO** | Le verdict est persisté comme artefact de revue |
| **S6 RULE BRIDGE** | `craft-discipline` sépare les règles des personas |
| **C1 LAZY ASSET** | Les docs de référence des lenses chargés à la demande |

### Anti-patterns explicitement gardés

| Anti-pattern | Mitigation |
|---|---|
| FAN-OUT-IN-ONE-CONTEXT | Chaque lens est un spawn de subagent séparé |
| WARM-CONTEXT COLD READER | La cold-reader lens ne reçoit NI journal, NI checklist, NI contexte producteur |
| PANEL-WITHOUT-SYNTHESIS | La synthèse est explicite avec arbitrage pondéré par le dissent |
| IMBALANCED PANEL | Règle dissent : les findings minoritaires examinés avant override majoritaire |
| COSMETIC DISSENT | Chaque lens a des gates concrètes (G1-G11) — les findings sont quantitatifs, pas d'opinion |

---

## Architecture

### Topologie

```
Appelant (orchestrateur ou utilisateur)
        │
        │  dispatch revue
        ▼
┌─ software-engineer-reviewer.agent.md ─────────────────┐
│  S3 ORCHESTRATOR FACADE                                │
│  Reçoit : code diff + tests + journal TDD + checklist  │
│                                                        │
│  Phase 1 : RECEIVE                                     │
│  Phase 2 : FAN-OUT (B1) — spawn 4 lenses               │
│                                                        │
│  ┌────────────────┐ ┌─────────────────┐                │
│  │ quality-gates  │ │ architecture-   │                │
│  │ lens           │ │ boundaries-lens │                │
│  │ Input : code + │ │ Input : code    │                │
│  │ tests + journal│ │ UNIQUEMENT      │                │
│  │ + checklist    │ │                 │                │
│  └───────┬────────┘ └────────┬────────┘                │
│          │                   │                          │
│  ┌───────┴──────┐ ┌─────────┴────────┐                │
│  │ test-        │ │ cold-reader-lens │                │
│  │ integrity-   │ │ Input : code +   │                │
│  │ lens         │ │ tests UNIQUEMENT │                │
│  │ Input : tests│ │ PAS de journal   │                │
│  │ + code       │ │ PAS de checklist │                │
│  └───────┬──────┘ └─────────┬────────┘                │
│          │                  │                          │
│  Phase 3 : COLLECT ◄────────┘                          │
│  Phase 4 : SYNTHESIZE + VERDICT                        │
│  → Règle dissent appliquée                             │
│  → Verdict émis                                        │
└────────────────────────────────────────────────────────┘
        │
        ▼
  Verdict JSON
```

### Filtrage des inputs par lens (contrat A7)

| Lens | Code | Tests | Journal TDD | Checklist |
|------|------|-------|-------------|-----------|
| quality-gates | ✅ | ✅ | ✅ | ✅ |
| architecture-boundaries | ✅ | ❌ | ❌ | ❌ |
| test-integrity | ✅ | ✅ | ❌ | ❌ |
| cold-reader | ✅ | ✅ | ❌ | ❌ |

Le cold-reader ne reçoit AUCUN contexte producteur. C'est le contrat critique de A7.

---

## Contrats des lenses

### Enveloppe de sortie partagée

Toutes les lenses retournent :

```json
{
  "lens": "<nom-lens>",
  "verdict": "pass | fail",
  "defects": [
    {
      "id": "D<N>",
      "gate": "G<N>",
      "severity": "blocker | high | medium | low",
      "location": "fichier:ligne",
      "description": "ce qui ne va pas",
      "suggestion": "comment corriger"
    }
  ]
}
```

### Lens 1 : quality-gates-lens

| Champ | Valeur |
|-------|--------|
| **Input** | Code + tests + journal TDD + checklist |
| **Gates** | G1 (test d'acceptation passe), G2 (tests unitaires passent), G3 (build passe), G6 (mutation score 100%), G8 (conventional commit) |
| **Méthode** | S7 DETERMINISTIC TOOL BRIDGE — lecture du journal pour assertions factuelles. Preuve manquante = finding `missing_evidence`, pas un pass. |
| **Skills chargés** | Aucun — les gates sont autonomes |

### Lens 2 : architecture-boundaries-lens

| Champ | Valeur |
|-------|--------|
| **Input** | Code UNIQUEMENT |
| **Gates** | G4 (pas de mock dans Domain/Application), G5 (dépendances Clean Architecture inward), G10 (Object Calisthenics sur Domain) |
| **Méthode** | Analyse arborescente du code : direction des `using`/imports, détection de mocks, règles de calisthenics |
| **Skills chargés** | `clean-architecture-testing` (C1 LAZY ASSET) |

### Lens 3 : test-integrity-lens

| Champ | Valeur |
|-------|--------|
| **Input** | Tests + code de production |
| **Gates** | G7 (pas de test theater pattern), G9 (pas de test modifié pour passer — Iron Rule) |
| **Patterns détectés** | Tautologie, mock-dominated, vérification circulaire, implementation-mirroring, fixture theater |
| **Méthode** | Analyse structurelle : ratio assertions/mocks, formules dupliquées prod→test, `NotNull` isolé, `Verify` sans assertion d'état |

### Lens 4 : cold-reader-lens

| Champ | Valeur |
|-------|--------|
| **Input** | Code + tests UNIQUEMENT — pas de journal, pas de checklist, pas de contexte producteur |
| **Gates** | G11 (business language dans les tests) |
| **Vérifie** | Clarté du nommage, visibilité de l'intention, abstractions non motivées, noms abrégés |
| **Persona** | N'a AUCUNE connaissance des cycles TDD, des quality gates, ni du fait que le code a été produit par un agent. Lecture « naïve ». |

---

## Quality Gates

| Gate | Vérifie | Lens | Sévérité si échoué |
|------|---------|------|--------------------|
| G1 | Test d'acceptation actif passe | quality-gates | blocker |
| G2 | Tous les tests unitaires passent | quality-gates | blocker |
| G3 | Build passe | quality-gates | blocker |
| G4 | Pas de mock dans Domain/Application | architecture-boundaries | blocker |
| G5 | Dépendances Clean Architecture inward | architecture-boundaries | blocker |
| G6 | Mutation score 100% sur logique métier | quality-gates | high |
| G7 | Pas de test theater pattern | test-integrity | blocker |
| G8 | Conventional commit respecté | quality-gates | low |
| G9 | Pas de test modifié pour passer (Iron Rule) | test-integrity | blocker |
| G10 | Object Calisthenics sur Domain | architecture-boundaries | medium |
| G11 | Business language dans les tests | cold-reader | medium |

---

## Règles de verdict

### Matrice sévérité → statut

- ≥1 `blocker` dans n'importe quelle lens → `rejected`
- ≥1 `high`, 0 `blocker` → `changes_requested`
- `medium` uniquement, accumulé entre les lenses → `changes_requested`
- `low` uniquement ou tout passe → `approved`

### Règle dissent

Si 3 lenses disent `pass` et 1 dit `fail`, le synthétiseur DOIT examiner le dissent explicitement avant d'overrider. Le dissent est le signal de plus haute information (per Genesis A7). L'analyse du dissent est capturée dans le verdict.

### Format du verdict final

```json
{
  "status": "approved | changes_requested | rejected",
  "lens_results": [
    {
      "lens": "quality-gates",
      "verdict": "pass | fail",
      "defects": []
    },
    {
      "lens": "architecture-boundaries",
      "verdict": "pass | fail",
      "defects": []
    },
    {
      "lens": "test-integrity",
      "verdict": "pass | fail",
      "defects": []
    },
    {
      "lens": "cold-reader",
      "verdict": "pass | fail",
      "defects": []
    }
  ],
  "dissent_analysis": "string — explicit examination of minority findings if any",
  "summary": "string — one paragraph overall assessment"
}
```

---

## Exemples de verdicts

### Exemple 1 : Implémentation propre
4 lenses passent, 0 defects. `approved`.

### Exemple 2 : Test theater détecté
La lens test-integrity détecte un test tautologique (`Assert.NotNull(result)` sans assertion métier). G7 fail, sévérité `blocker`. `rejected`, D1 avec file:line.

### Exemple 3 : Iron Rule violée
La lens test-integrity détecte une assertion affaiblie entre RED et GREEN — `Assert.Equal(90, result.Premium)` est devenu `Assert.NotNull(result)`. G9 fail, sévérité `blocker`. `rejected` immédiat.

### Exemple 4 : Dissent du cold reader
3 lenses passent. cold-reader flag un nommage opaque `ProcessData()` sans intention métier visible. Sévérité `medium`. Dissent examiné : le nommage est effectivement pauvre mais pas bloquant. `changes_requested`.

### Exemple 5 : Violation d'architecture
architecture-boundaries détecte `using MonAssurance.Infrastructure.Persistence` dans la couche Domain. G5 `blocker`. `rejected`.

### Exemple 6 : Fixture theater
La lens test-integrity : `git diff --name-only` montre que seuls des fichiers de test ont changé après le flip RED→GREEN. Les fichiers de production sont intacts. Les tests passent parce que les étapes Given créent l'état final attendu dans les fixtures. G7 `blocker`. `rejected`.

---

## Contraintes de l'agent reviewer

### Ce que le reviewer ne fait JAMAIS

- Modifier du code ou des tests
- Proposer un fix (il constate, il ne corrige pas)
- Assouplir un seuil
- Approuver sans examiner un dissent
- Dégrader un finding `blocker` pour passer `approved`

### Outils (read-only)

`readFile`, `search/codebase`, `runSubagent` (pour spawner les lenses). Aucun outil d'écriture.

### Exigence modèle

Sonnet-class ou supérieur (arbitrage multi-findings + pondération dissent).

---

## Skill : craft-discipline

### Rôle

Checkpoints d'exécution pour le `software-engineer` — pas un contrat de revue. Le reviewer ne lit pas ce skill ; il vérifie les artefacts indépendamment.

### Gates

1. Test d'acceptation actif passe (pas skipped)
2. Tous les tests unitaires passent
3. Build passe (tous les projets)
4. Analyse statique passe
5. Pas de test skippé en exécution
6. Pas de mock dans Domain/Application
7. Business language vérifié dans les tests
8. Mutation score 100% sur logique métier
9. Conventional commit respecté
10. Object Calisthenics vérifié sur Domain

### Structure

```
plugins/skraft-framework/skills/craft-discipline/
├── SKILL.md
└── references/
    ├── test-theater-patterns.md
    └── object-calisthenics.md
```

---

## Position dans le SDLC

```
SDLC skraft (agents)
───────────────────────────────
│
├── acceptance-designer (QA)        ← Scénarios Gherkin (futur)
│
├── software-engineer               ← Code + tests + journal
│   └── craft-discipline      ← checkpoints d'auto-discipline
│
├── software-engineer-reviewer      ← Revue adversariale A7
│   ├── quality-gates-lens
│   ├── architecture-boundaries-lens
│   ├── test-integrity-lens
│   └── cold-reader-lens
│
├── (futur : solution-architect, platform-engineer, ...)
│
└── orchestrateur                   ← dispatch entre agents
```

Le reviewer reçoit les artefacts de l'engineer mais n'a AUCUN accès à la trace de raisonnement de l'engineer (chat/trace interne). Seuls les artefacts traversent la frontière — c'est le contrat cold-context de A7.

### Intégration avec l'orchestrateur

```
Orchestrateur
    │
    ├── dispatch ──→ software-engineer ──→ code + tests + journal
    │                                          │
    │                                          ▼
    ├── dispatch ──→ software-engineer-reviewer
    │                     │
    │                     ▼
    │               verdict JSON
    │                     │
    ├── si "approved"          ──→ terminé
    ├── si "changes_requested" ──→ re-dispatch engineer avec findings
    └── si "rejected"          ──→ escalade ou re-dispatch avec findings
```

---

## Structure de fichiers

### Nouveaux fichiers

```
plugins/
├── agents/
│   ├── software-engineer-reviewer.agent.md
│   └── reviewer-lenses/
│       ├── quality-gates-lens.agent.md
│       ├── architecture-boundaries-lens.agent.md
│       ├── test-integrity-lens.agent.md
│       └── cold-reader-lens.agent.md
└── skills/
    └── craft-discipline/
        ├── SKILL.md
        └── references/
            ├── test-theater-patterns.md
            └── object-calisthenics.md
```

### Fichiers existants à modifier

| Fichier | Modification |
|---------|-------------|
| `plugins/skraft-framework/agents/software-engineer.agent.md` | Remplacer `quality-framework` → `craft-discipline` dans la liste des skills |
| `docs/roadmap.md` | Retirer reviewer + quality-framework des « à venir », ajouter liens vers les nouvelles fiches |
| `docs/agents/software-engineer-and-reviewer.md` | Mettre à jour le statut reviewer : ✅ Implémenté |
| `docs/agents/software-engineer.md` | Remplacer `quality-framework` → `craft-discipline` |

### Nouvelle documentation

```
docs/
├── agents/
│   └── software-engineer-reviewer.md
└── skills/
    └── craft-discipline.md
```
