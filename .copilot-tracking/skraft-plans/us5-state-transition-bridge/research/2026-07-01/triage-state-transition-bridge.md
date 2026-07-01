<!-- markdownlint-disable-file -->
# Triage — [US] #14 State Transition Bridge (S7)
## Issue #60 · us5-state-transition-bridge · 2026-07-01

Discovery Mode: search-based (single orchestrator-pinned issue: #60 — dependency closure read from #47/#49/#55/#57)
_Mode 1 (user-assigned) skipped: single orchestrator-pinned issue, no @me issues in scope._
_Mode 2 (artifact-driven) skipped: impacted modules (#47 json-state-reader, #49 state-schema/pipeline-policy) already CLOSED — no open domain issues surfaced by git-log artifact scan._
depthTier: comprehensive | difficulty: medium-hard

---

### Résumé

**Problème.** L'orchestrateur lit `state.json` via `tool-read` (conforme) mais **écrit** en émettant le JSON complet par le LLM : double pénalité — output tax (3–5× taux input) et anti-pattern TOOLLESS ASSERTION (drift silencieux sur `phasesCompleted`, `retryCount`, etc.). Le `json-state-reader.mjs` expose une méthode `write()` qui laisse la porte ouverte à UNSUPERVISED MUTATION.

**Valeur.** Économie de ~61 000 tokens sur 50 turns touchant le state (−750 tokens/tour lecture, −470 tokens/tour écriture, −200 tokens/init). Élimine TOOLLESS ASSERTION et UNSUPERVISED MUTATION. Devient le seul accès d'écriture sûr à `state.json`.

**Périmètre.** 5 nouveaux modules (domain + port + adapter + application + cli), 1 modification breaking (suppression `write()` du reader), 1 mise à jour instructions orchestrateur, tests complets + Stryker additive.

---

### Dépendances détectées

| # | Titre | Rôle vis-à-vis de #60 | Statut |
|---|---|---|---|
| #47 | Fondation Clean Architecture (US1) | Fournit `json-state-reader.mjs`, ports, adapters, `result.mjs` — réutilisés par #60 | **CLOSED/DELIVERED** |
| #49 | G1 Garde d'ordre de dispatch (US3) | Fournit `state-schema.mjs` et `pipeline-policy.mjs` réutilisés par `state-machine.mjs` | **CLOSED/DELIVERED** |
| #55 | [US] #9 S7 execution-log + CLI bridge | Périmètre distinct (`execution-log-schema.mjs`, non `state.json`) — parallélisable, non bloquant | **OPEN** — non bloquant |
| #57 | [US] #11 G7/G8 protection d'état + session guard | **Dépend explicitement de #60** (`Dépend de : #49, #60`) — ne peut être livré qu'après #60 ; prioriser sprint+1 | **OPEN** — dépendant de #60 |

> **Note #57** : Le genesis handoff cite explicitement `#57` comme mécanisme bloquant les mutations sans CLI. Issues #60 et #57 sont complémentaires : #60 fournit le CLI sûr, #57 ferme la porte directe.

---

### Risques identifiés

| Risque | Sévérité | Mitigation |
|---|---|---|
| **Breaking change `json-state-reader.mjs`** : suppression de `write()` | HIGH | Mettre à jour les tests simultanément ; aucune régression fonctionnelle si le writer est câblé correctement |
| **Atomicité FS** : `rename()` atomique POSIX (macOS/Linux) — non garanti Windows | LOW | Pattern `{path}.tmp.{ts}` + rename conforme POSIX ; documenter la limite |
| **Rotation backup** : garder ≤ 3 `.bak` | MEDIUM | Implémenté dans `json-state-writer.mjs` via readdir + sort + unlink |
| **Stryker config** : `mutate` array doit rester additif (AGENTS.md) | MEDIUM | Append uniquement — ne jamais remplacer le glob |
| **#57 non livré** : UNSUPERVISED MUTATION reste possible entre #60 et #57 | MEDIUM | Risque résiduel documenté ; #57 dépend de #60 — à prioriser sprint+1 après livraison #60 |
| **Extraction `nextPhaseAfter()`** de `pipeline-policy.mjs` | MEDIUM | Ajouter tests de régression sur les consommateurs de `pipeline-policy.mjs` avant extraction ; extraire vers `domain/phase-order.mjs` partagé |
| **Rollback instructions orchestrateur** | LOW | La mise à jour des instructions (`read_file` → `cli state get`) doit être atomique avec le déploiement CLI ; documenter la variante de rollback dans les instructions |
| **Migration `state.json` pre-existing** : `applyEvent` auto-init-on-ENOENT ne migre pas les fichiers existants | MEDIUM | `state-service.applyEvent` doit inclure une étape de coercion des champs manquants (`retryCount`, `phasesCompleted`) avant d'invoquer la machine d'état ; documenter explicitement |

---

### Estimation effort

**L (2–3 jours)**

Justification : 5 nouveaux modules traversant toutes les couches Clean Architecture, machine d'état pure avec 9 invariants formels, atomic I/O avec backup rotation, breaking change adapter, 6 sous-commandes CLI, 4 exit codes, tests unit + acceptance + Stryker additive, mise à jour orchestrateur.

---

### Proposition de priorité

**P1 — Haute valeur, sprint courant**

Justification : Économie de tokens critique (−61 000/pipeline). Élimine deux anti-patterns majeurs. Genesis handoff complet disponible. Toutes dépendances critiques (#47, #49) CLOSED.

---

### Duplicates Detected

Aucun doublon détecté. Périmètre restreint à l'issue #60 (orchestrateur-pinned). Aucune paire de titres avec similarité > 40 % dans le sous-ensemble triagé. Issues #55 et #57 ont des périmètres distincts ou complémentaires (non doublons).

---

### Difficulty Tier Assessment (sortie DISCOVER)

| Axe | Valeur |
|---|---|
| Entry Point | `skipPhases: []` — DISCOVER run normalement |
| Depth Tier | `comprehensive` |
| **Difficulty Tier** | **`medium-hard`** |

**DELIVER execution model** pour `medium-hard` : dispatch sub-agent par scénario Gherkin, plan intermédiaire, plusieurs passes de review (4 lenses).
