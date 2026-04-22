# Skill `clean-architecture-testing`

**Statut :** ✅ Implémenté
**Source :** [`plugins/skills/clean-architecture-testing/SKILL.md`](../../plugins/skills/clean-architecture-testing/SKILL.md)

---

## Quand l'utiliser

Quand il faut décider **quoi tester** selon les couches Clean
Architecture (Domain, Application, Infrastructure, API,
Architecture), ou choisir les bons doubles selon la frontière testée.

Ce skill ne remplace pas la mécanique TDD : il oriente le **niveau de
test** et la **politique de doubles**(mock, fake, stub, test double maison, etc.). 

---

## Résumé

- Principe central : un test entre par **une boundary** et observe à la
  boundary suivante.
- Politique de doubles : choix guidé par la couche, jamais par
  convenance.
- Règle de base : tests d'acceptation Application par défaut ; tests
  Domain unitaires seulement pour des règles métier extraites et
  complexes.
- Organisation : deux ensembles de tests par contexte (`UnitTest` et
  `IntegrationTest`).

---

## Règles non négociables

- Pas de mock de Domain object.
- Pas de conteneur réel dans les tests Application/Unit.
- Les adapters Infrastructure sont validés en intégration réelle
  (conteneurs, app host, contract mocks selon le cas).
- Les règles d'architecture doivent être gardées par des tests de
  structure (CI gate).

---

## Ressources associées

### Références

- [`references/examples-dotnet.md`](../../plugins/skills/clean-architecture-testing/references/examples-dotnet.md)
- [`references/architecture-rules.md`](../../plugins/skills/clean-architecture-testing/references/architecture-rules.md)
- [`references/doubles-decision-tree.md`](../../plugins/skills/clean-architecture-testing/references/doubles-decision-tree.md)

---

## Skills associés

| Skill | Rôle | Statut |
|---|---|---|
| [`outside-in-tdd`](./outside-in-tdd.md) | Possède le cycle PREPARE → RED → SYNTHESIZE-GREEN → COMMIT & VERIFY. | ✅ |
| [`red-synthesize-green`](./red-synthesize-green.md) | Exécute la mécanique RED / SYNTHESIZE-GREEN. | ✅ |
| `quality-framework` | Fournit les quality gates globaux partagés. | 🚧 [À venir](../roadmap.md#quality-framework) |

---

## Consommé par

- Agent [`software-engineer`](../agents/software-engineer.md) — chargé
  **trigger-based**.
