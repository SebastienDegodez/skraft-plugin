# Roadmap — éléments référencés mais non implémentés

Cette page est la **source de vérité unique** pour tout ce qui est
mentionné dans la documentation mais **n'existe pas encore** dans le
repo. Toute fiche qui contient un badge `🚧 À venir` ou `📝 Partiel`
**doit** pointer vers une ancre de cette page.

> Mise à jour : si vous implémentez un élément ci-dessous, retirez-le
> ici **et** mettez à jour le badge sur les fiches qui le référencent.

---

## 1. Vue d'ensemble

| Élément | Type | Référencé dans | Statut |
|---|---|---|---|
| Hooks de gardiennage | infra | [`agent-software-engineer-and-reviewer.md`](./agent-software-engineer-and-reviewer.md) | 🚧 À venir |

---

## 2. Hooks de gardiennage <a id="hooks"></a>

**Type :** infrastructure (chemin à définir).

**Rôle attendu :** rendre les invariants du duo Engineer/Reviewer
**mécaniquement infranchissables**. Décrits dans
[`agent-software-engineer-and-reviewer.md`](./agent-software-engineer-and-reviewer.md).

| Hook | Invariant à garder |
|---|---|
| `SessionStart` | Journal de phase SDLC initialisé, profil de rigueur chargé |
| `SubagentStart(Engineer)` | Prérequis SDLC présents, sinon refus |
| `PreToolUse` (Engineer) | Refuse `edit/editFiles` sur tests d'acceptation, refuse `execute/runInTerminal` destructeur hors COMMIT |
| `PostToolUse` | Recalcule l'état de la phase TDD, met à jour le journal |
| `SubagentStop(Engineer)` | Vérifie cohérence du journal avant handoff au Reviewer |
| `SubagentStart(Reviewer)` | Refuse l'activation des outils de modification pour le Reviewer |
| `PreToolUse` (Reviewer) | Refuse toute écriture |

Aucun hook n'est implémenté à ce jour.

---

## 6. Variantes futures (non engageant)

Ces éléments ne sont pas encore référencés dans la doc mais sont des
extensions plausibles, listées ici pour mémoire :

- `acceptance-designer` — agent producteur de tests d'acceptation
  Given-When-Then (mentionné comme acteur amont dans la doc du duo).
