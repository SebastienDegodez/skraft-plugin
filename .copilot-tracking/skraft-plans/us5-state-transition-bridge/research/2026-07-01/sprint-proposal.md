<!-- markdownlint-disable-file -->
# Sprint Proposal — us5-state-transition-bridge
## 2026-07-01

Discovery mode: search-based (single orchestrator-pinned story #60)
Capacity: 5 team-days (effective: 3.5 = 5 × 0.7)

---

### Objectif sprint

Livrer le pont CLI déterministe S7 pour `state.json` (issue #60) afin d'éliminer TOOLLESS ASSERTION et UNSUPERVISED MUTATION, réduire la consommation de tokens de ~61 000 par pipeline, et établir la seule porte d'écriture sûre vers l'état du pipeline SKRAFT.

---

### Items dans le sprint (ordonnés)

| Priorité | Item | Effort | Dépendance |
|---|---|---|---|
| P1 | #60 — [US] #14 State Transition Bridge (CLI S7 + state-machine + atomic writer) | L (2–3 j) | #47 ✅ CLOSED · #49 ✅ CLOSED · #57 idéalement en parallèle |

Total effort: L (2–3 jours) — dans la capacité effective (3.5 j).

---

### Capacity & contraintes

**Accélérateurs :**
- Genesis handoff packet complet disponible → passage immédiat en DISCUSS sans re-design
- Dépendances critiques (#47, #49) toutes CLOSED — aucune attente externe
- `state-schema.mjs` et `pipeline-policy.mjs` existants réutilisables

**Contraintes :**
- `json-state-reader.mjs` : suppression de `write()` est un breaking change — tests à mettre à jour simultanément
- Stryker `mutate` array : mise à jour additive requise (AGENTS.md)
- `#57` (deny-write guardrail) : non inclus dans ce sprint ; risque résiduel UNSUPERVISED MUTATION documenté

**Bloquants connus :** Aucun.

---

### Ready for DISCUSS

- [x] Issue #60 analysée et triée
- [x] Aucun doublon détecté
- [x] Effort L — dans le périmètre, pas de split requis
- [x] `state.json::difficulty` = `"medium-hard"` (à persister par l'orchestrateur)
