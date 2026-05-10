# Agent `software-engineer`

**Statut :** ✅ Implémenté
**Source :** [`plugins/agents/software-engineer.agent.md`](../../plugins/agents/software-engineer.agent.md)

> Cette fiche est la **référence canonique** pour l'agent
> `software-engineer` et l'état de ses skills.
>
> Le document transverse
> [`agent-software-engineer-and-reviewer.md`](../agent-software-engineer-and-reviewer.md)
> reste un résumé de contexte (duo Engineer/Reviewer), sans dupliquer
> les détails de cette fiche.

---

## Mission

Livrer du code **fonctionnel, testé et propre**, en suivant
strictement Outside-In TDD, Clean Architecture et Object Calisthenics.
Minimum de tests pour un maximum de confiance.

---

## Quand est-il déclenché ?

- Commande explicite de l'utilisateur sur une story prête à
  implémenter.
- Délégation par un orchestrateur après validation des phases SDLC
  amont (architecture, plateforme, spécification exécutable).
- Re-exécution après rejet du Reviewer (voir [software-engineer-reviewer](./software-engineer-reviewer.md)).

L'agent tourne en **mode sub-agent** : aucune question à l'utilisateur ;
en cas de blocage, il rend un JSON structuré (`status: blocked`).

---

## Skills chargés

### Mandatory au démarrage

| Skill | Statut | Fiche |
|---|---|---|
| `outside-in-tdd` | ✅ | [voir](../skills/outside-in-tdd.md) |
| `red-synthesize-green` | ✅ | [voir](../skills/red-synthesize-green.md) |
| `craft-discipline` | ✅ | [voir](../skills/craft-discipline.md) |

### Trigger-based

| Skill | Déclencheur | Statut |
|---|---|---|
| `clean-architecture-testing` | Choix de niveau de test, boundaries, doubles | ✅ [voir](../skills/clean-architecture-testing.md) |
| `test-refactoring-catalog` | Refacto de test (helpers, renommage) | 🚧 [À venir](../roadmap.md#test-refactoring-catalog) |
| `mutation-testing` | Entrée en phase COMMIT & VERIFY | 🚧 [À venir](../roadmap.md#mutation-testing) |

> En l'état actuel : un skill manquant fait simplement l'objet d'un log
> `[SKILL MISSING] <name>`, l'agent continue sans bloquer.

---

## Cycle d'exécution (4 phases)

```
PREPARE → RED → SYNTHESIZE-GREEN → COMMIT & VERIFY
```

| Phase | Objectif | Règle non négociable |
|---|---|---|
| **PREPARE** | Identifier boundaries d'entrée et effets attendus. Cibler **une** scène. | Pas de double dans Domain/Application. |
| **RED** | Un test qui échoue sur **assertion métier**. | Stub juste pour compiler ; jamais traiter une erreur de compil comme RED. |
| **SYNTHESIZE-GREEN** | Code minimal pour passer au vert. | Object Calisthenics ; **pas de refactor**. |
| **COMMIT & VERIFY** | Statique + mutation testing + commit conventional. | Test ne tuant aucun mutant ⇒ supprimé ; **pas de commit sur rouge**. |

---

## Garde-fous (principes non négociables)

1. **Clean Architecture stricte** — Domain → rien, Application → Domain, API/Infra → Application.
2. **Double-Loop TDD** — 1 acceptance externe → N unit tests internes.
3. **Iron Rule of Tests** — jamais modifier un test rouge pour le faire passer ; après 3 échecs, revert + escalade.
4. **No Test Theater** — chaque test doit tomber si le comportement change ; **zéro mock** dans Domain/Application.
5. **Token Economy** — pas de docs ni fichiers non sollicités.

### Mandats de design de tests

- Observable Behavioral Outcomes
- Boundary-to-Boundary
- Adapter Verification (intégration réelle, pas de mock d'adapter)
- Parametrize Variations (`[Theory]` + `[InlineData]`)

### Anti-patterns rejetés

Tautologie · mock-dominated · vérification circulaire ·
implementation-mirroring · fixture theater.

---

## Quality gates en sortie

Checklist imprimée par l'agent en fin de phase :

- [ ] Tests d'acceptation et unitaires actifs au vert
- [ ] Build + analyse statique OK
- [ ] 100 % mutation score sur la logique métier prouvé
- [ ] Aucun mock utilisé dans Domain/Application
- [ ] Code committé en conventional commits

> Le **Reviewer** est implémenté : voir
> [software-engineer-reviewer](./software-engineer-reviewer.md).
> 🚧 Le **gardiennage** par les hooks n'est pas encore implémenté.
> Voir [roadmap §5](../roadmap.md#hooks).

---

## Limites — ce que l'agent ne fait jamais

- Modifier des tests d'acceptation (propriété de l'`acceptance-designer`).
- Prendre une décision d'architecture hors scope feature.
- Ajouter une dépendance externe sans ADR.
- Désactiver, skipper, rendre laxiste un test pour passer.
- Commit sur rouge.
- Toucher à CI/CD ou IaC sans instruction explicite.

---

## Exigence modèle

**Sonnet-class ou supérieur.** Les modèles low-tier (Haiku, Flash, mini)
ne sont **pas supportés** : le raisonnement multi-contraintes (Clean
Architecture + Object Calisthenics + Iron Rule + Mutation score) dépasse
leurs capacités.

---

## Voir aussi

- Document transverse : [`agent-software-engineer-and-reviewer.md`](../agent-software-engineer-and-reviewer.md)
- Source : [`plugins/agents/software-engineer.agent.md`](../../plugins/agents/software-engineer.agent.md)
- Skill principal : [`outside-in-tdd`](../skills/outside-in-tdd.md)
- Skill cycle TDD AI-optimisé : [`red-synthesize-green`](../skills/red-synthesize-green.md)
- Roadmap : [Reviewer & skills à venir](../roadmap.md)
