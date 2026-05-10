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
| `test-refactoring-catalog` | skill | `software-engineer.agent.md` — trigger-based | 🚧 À venir |
| `mutation-testing` | skill | `software-engineer.agent.md` — trigger-based (phase COMMIT) | 🚧 À venir |
| Hooks de gardiennage | infra | [`agent-software-engineer-and-reviewer.md`](./agent-software-engineer-and-reviewer.md) | 🚧 À venir |

---

## 2. Skill `test-refactoring-catalog` <a id="test-refactoring-catalog"></a>

**Type :** skill (`plugins/skills/test-refactoring-catalog/SKILL.md`
— à créer).

**Rôle attendu :** catalogue de refactorings de tests (extraction de
helpers, renommage, dédoublonnage, paramétrisation `[Theory]`/
`[InlineData]`).

**Déclencheur prévu** : refacto d'un test pendant la phase
COMMIT & VERIFY (jamais pendant SYNTHESIZE-GREEN).

---

## 3. Skill `mutation-testing` <a id="mutation-testing"></a>

**Type :** skill (`plugins/skills/mutation-testing/SKILL.md` — à créer).

**Rôle attendu :** procédure d'exécution et d'interprétation du
mutation testing en phase COMMIT & VERIFY. Définit la règle « tout test
qui ne tue aucun mutant doit être supprimé » et les seuils par couche
(0 % de survivants pour Domain/Application, ≤ 10 % pour API/Infra).

---

## 4. Skills supplémentaires pour le Reviewer <a id="reviewer-skills"></a>

Les capacités initialement pressenties comme skills séparés sont
désormais intégrées dans les lenses du Reviewer :

- `test-theater-detection` → couvert par `test-integrity-lens`
- `architecture-dependency-audit` → couvert par `architecture-boundaries-lens`
- `mutation-evidence-review` → couvert par `quality-gates-lens`

Voir [`docs/agents/software-engineer-reviewer.md`](./agents/software-engineer-reviewer.md)
pour le détail des lenses.

---

## 5. Hooks de gardiennage <a id="hooks"></a>

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
