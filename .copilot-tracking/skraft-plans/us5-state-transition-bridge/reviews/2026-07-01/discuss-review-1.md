<!-- markdownlint-disable-file -->
# DISCUSS Review — us5-state-transition-bridge
## 2026-07-01 · Attempt 1

**Verdict:** NEEDS_REWORK
**Depth tier:** comprehensive · **Lenses:** 4 · **Weighted score:** 0.628

### Gates

| Gate | Résultat | Sévérité |
|---|---|---|
| G3 AC completeness | FAIL | HIGH — AC6 S2 When non observable |
| G4 AC unambiguity | FAIL | BLOCKER — 3 violations (types internes exposés) |
| G7 DoR 8-item | PASS | — |
| G8 Antipatterns | FAIL | HIGH — Giant Stories flag + DoR I4 overclaim |

### Findings à corriger (attempt 2)

1. **[BLOCKER]** AC4 S1 Then : `"rename() atomique"` → `"si interruption, state.json reste identique à son état pré-opération"`
2. **[BLOCKER]** AC4 S2 Then : `"Result<Err> avec code CORRUPTED_STATE"` → `"exit code 2, stderr contient CORRUPTED_STATE"`
3. **[BLOCKER]** AC6 S2 Then : `"machine d'état retourne Err"` → `"exit code 1, stderr contient APPEND_ONLY_VIOLATION"`
4. **[HIGH]** AC6 S2 When : `"un événement tente de..."` → commande CLI concrète ou note "test unitaire domaine"
5. **[HIGH]** Ajouter AC9 — I3 RETRY_EXHAUSTED (`incr-retry` au-delà du plafond)
6. **[HIGH]** Ajouter AC10 — I8 TERMINAL_STATE (mutation sur phase DONE)
7. **[HIGH]** Ajouter scénarios I4 (phasesCompleted append-only) et I6 (reviewArtifacts append-only)
8. **[HIGH]** DoR I4 : remplacer `"couvrant tous invariants I1–I9"` par liste réelle
9. **[MEDIUM]** Ajouter scénario coercion pre-existing state.json sans retryCount/phasesCompleted
10. **[MEDIUM]** AC4 S2 When : préciser la commande CLI

### Synthèse pondérée

| Lens | Poids | Score | Contribution |
|---|---|---|---|
| INVEST | 0.20 | 0.85 | 0.170 |
| DoR | 0.25 | 0.65 | 0.163 |
| Complétude technique | 0.30 | 0.40 | 0.120 |
| Risques | 0.25 | 0.70 | 0.175 |
| **Total** | | | **0.628** |

### Verdict final : `NEEDS_REWORK`
