# Skill `red-synthesize-green`

**Statut :** ✅ Implémenté
**Source :** [`plugins/skills/red-synthesize-green/SKILL.md`](../../plugins/skills/red-synthesize-green/SKILL.md)

---

## Quand l'utiliser

Pour **toute feature ou fix** implémentés en TDD, **avant** d'écrire la
moindre ligne de production.

---

## Résumé — cycle 2 étapes (AI-optimisé)

Remplace le cycle traditionnel à 3 étapes. Optimisé pour la synthèse
par IA.

| Cycle traditionnel | Cycle AI-optimisé |
|---|---|
| RED → green (sale) → Refactor | **RED (échec comportemental)** → **SYNTHESIZE GREEN (synthèse propre)** |

**Hard rule :** aucun code de production avant que **RED** soit un
**échec comportemental propre**.

---

## Étapes

### 1. RED — Behavior Failure Only

- Erreur de **compilation** = phase « wishful thinking » → stub jusqu'à
  compilation, on relance.
- Erreur d'**assertion** = **RED** ✓ → on passe à l'étape 2.
- **Jamais** traiter une erreur de compilation comme un RED.

### Entre les étapes — Architectural Guidance (MANDATORY)

Étape **non skippable**. Le développeur doit **valider explicitement**
le test avant qu'on passe à SYNTHESIZE GREEN.

Orientation du design avant la synthèse :
- Quel pattern (specification, factory, builder…) ?
- Quelle couche porte la logique ?
- Immutabilité ? Retour vs mutation ?

### 2. SYNTHESIZE GREEN — Clean Synthesis

Implémentation **complète, propre, prod-ready en un seul jet**.

- Respect des règles d'architecture et de coding standards.
- **Pas** de dirty-then-refactor.
- Si le test était mal compris → on **revoit le test**, on repart au
  RED. Pas d'itération sur le code après SYNTHESIZE GREEN.

---

## Règles non négociables

- Pas d'implémentation avant un RED comportemental.
- L'erreur de compilation n'est **pas** un RED.
- Pas de skip de l'Architectural Guidance.
- Pas de skip de la validation développeur du test.
- Pas d'itération sur le code après SYNTHESIZE GREEN.

---

## Quality Gate possédé par ce skill

Pour les couches Application + Domain :

1. **100 % code coverage** atteint avant complétion.
2. Mutation testing : **0 mutant survivant non-équivalent**.
3. Tout mutant équivalent doit être **explicitement justifié**.

Si une condition n'est pas remplie, le travail n'est pas terminé.

---

## Orchestration de sous-agents

Si un agent orchestrateur dispatche des sous-agents :

> **Ne JAMAIS mettre RED et SYNTHESIZE GREEN dans le même prompt.**

Splitter en deux dispatches :

1. **Dispatch 1 — RED only** : le subagent écrit le test, stub pour
   compiler, lance, rapporte la sortie d'échec.
2. **Pause orchestrateur** : montrer le test au développeur, attendre
   confirmation explicite.
3. **Dispatch 2 — SYNTHESIZE GREEN** : seulement après approbation.

---

## Skills associés

| Skill | Rôle | Statut |
|---|---|---|
| [`outside-in-tdd`](./outside-in-tdd.md) | Définit les deux flux de tests (Application + Domain) que ce cycle anime. | ✅ |

---

## Consommé par

- Agent [`software-engineer`](../agents/software-engineer.md) — chargé
  **mandatory au démarrage**.
