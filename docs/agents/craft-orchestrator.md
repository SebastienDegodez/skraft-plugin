# Agent `craft-orchestrator`

**Statut :** ✅ Implémenté
**Source :** [`plugins/agents/craft-orchestrator.agent.md`](../../plugins/agents/craft-orchestrator.agent.md)

---

## Mission

Orchestrer la livraison d'une feature step-by-step depuis un plan markdown
structuré. Dispatche `software-engineer` puis `software-engineer-reviewer`
pour chaque step. Gère la boucle de retry et l'escalade.

**Point d'entrée unique** — les agents Engineer et Reviewer ne sont JAMAIS
invoqués directement par l'utilisateur.

---

## Quand est-il déclenché ?

- L'utilisateur le dispatche avec un plan markdown structuré.
- Après les phases amont (design, BDD scenarios) quand le plan est prêt.

---

## Genesis Patterns

| Pattern | Rôle dans l'orchestrateur |
|---------|---------------------------|
| A3 ORCHESTRATOR-SAGA | Topology : séquentiel step-by-step avec retry borné |
| A4 STAFFED PLAN | Le plan `.md` est l'artifact vivant, mis à jour in-place |
| B4 PLAN MEMENTO | Re-lecture du plan avant chaque dispatch |
| B2 CONDITIONAL DISPATCH | Routing selon verdict (approved/retry/escalade) |
| S4 VALIDATION DECORATOR | Le reviewer est le gate obligatoire |
| B8 ATTENTION ANCHOR | Checklist anti-drift avant chaque action |

---

## Format du plan attendu

```markdown
# Feature: <nom>

## Step 01: <titre business>

**Acceptance criteria:**
- Given ... When ... Then ...

**Files to modify:**
- src/...

**Status:** pending
```

Parseable avec `mq` (`mqlang.org`) : `mq '.h2' plan.md`

---

## Comportement de retry

| Verdict | Tentatives < 3 | Tentatives ≥ 3 |
|---------|----------------|----------------|
| `approved` | Avance au step suivant | — |
| `changes_requested` | Re-dispatche Engineer avec findings | Escalade + STOP |
| `rejected` | Re-dispatche Engineer avec findings | Escalade + STOP |

---

## Invariants

1. Ne jamais implémenter de code.
2. Ne jamais skip le reviewer.
3. Exécution séquentielle (pas de parallélisme).
4. Stop immédiat sur escalade.

---

## Voir aussi

- Document transverse : [`agent-software-engineer-and-reviewer.md`](../agent-software-engineer-and-reviewer.md)
- Engineer : [`docs/agents/software-engineer.md`](./software-engineer.md)
- Reviewer : [`docs/agents/software-engineer-reviewer.md`](./software-engineer-reviewer.md)
