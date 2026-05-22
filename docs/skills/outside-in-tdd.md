# Skill `outside-in-tdd`

**Statut :** ✅ Implémenté
**Source :** [`plugins/skills/outside-in-tdd/SKILL.md`](../../plugins/skills/outside-in-tdd/SKILL.md)

---

## Quand l'utiliser

Écrire des tests **outside-in**, définir le comportement avant le code,
ou toute feature où les tests doivent partir d'un comportement métier
observable et laisser le design interne **émerger**.

Couvre : double-loop TDD, cycle 4 phases, boundary-to-boundary testing,
Iron Rule of Tests, walking skeleton, post-GREEN wiring verification.

---

## Résumé

- **Règle de base** : objets de domaine **réels**, frontières externes
  **mockées**, tests rapides en mémoire.
- **Outer loop** — test d'acceptation (vue client) — reste rouge tant
  que l'inner loop cycle.
- **Inner loop** — tests unitaires (vue dev) — RED → GREEN → REFACTOR
  en quelques minutes.
- **Outer drive le QUOI**, **Inner drive le COMMENT**. Ne jamais créer
  une classe dont aucun scénario actif n'a besoin.
- **Post-GREEN Wiring Verification** obligatoire avant commit
  (`git diff --name-only` doit montrer du code de prod, sinon Fixture
  Theater).

---

## Cycle 4 phases (par tranche de comportement)

| Phase | Possession |
|---|---|
| **1. PREPARE** | Owned par ce skill (identifier input/output boundaries, cibler 1 scénario). |
| **2. RED** | Délégué à [`red-synthesize-green`](./red-synthesize-green.md). |
| **3. SYNTHESIZE-GREEN** | Délégué à [`red-synthesize-green`](./red-synthesize-green.md). |
| **4. COMMIT & VERIFY** | Owned par ce skill (post-GREEN verification, mutation testing, conventional commit). |

---

## Règles non négociables

- **Iron Rule of Tests** — jamais modifier un test rouge pour qu'il
  passe. Après 3 tentatives infructueuses : revert + escalade.
- **Boundary-to-Boundary** à tous les niveaux de test (unit y compris :
  la signature publique d'une fonction *est* le contrat sous test).
- **Pas de mock de domain object.**
- **Pas de design upfront** — le domaine émerge des échecs de tests.
- **Pas de commit sur rouge.**

---

## Ressources associées

### Références

- [`references/test-examples.md`](../../plugins/skills/outside-in-tdd/references/test-examples.md) — exemples de tests d'acceptation et de domaine.
- [`references/testing-strategy.md`](../../plugins/skills/outside-in-tdd/references/testing-strategy.md) — pyramide et stratégie de test.
- [`references/cqrs-patterns.md`](../../plugins/skills/outside-in-tdd/references/cqrs-patterns.md) — références d'architecture CQRS.

### Assets

- [`assets/CommandHandlerTestTemplate.cs`](../../plugins/skills/outside-in-tdd/assets/CommandHandlerTestTemplate.cs)
- [`assets/QueryHandlerTestTemplate.cs`](../../plugins/skills/outside-in-tdd/assets/QueryHandlerTestTemplate.cs)

---

## Skills associés (mentionnés en intégration)

| Skill | Rôle dans l'intégration | Statut |
|---|---|---|
| [`red-synthesize-green`](./red-synthesize-green.md) | Mécanique RED → validation → SYNTHESIZE-GREEN | ✅ |
| `mutation-testing` | À exécuter après GREEN, avant commit | ✅ (source: `plugins/skills/mutation-testing/SKILL.md`) |
| [`clean-architecture-testing`](./clean-architecture-testing.md) | Niveau de test & politique de doubles | ✅ |
| `test-refactoring-catalog` | Refactorings de tests sûrs | ✅ (source: `plugins/skills/test-refactoring-catalog/SKILL.md`) |

---

## Consommé par

- Agent [`software-engineer`](../agents/software-engineer.md) — chargé
  **mandatory au démarrage**.
