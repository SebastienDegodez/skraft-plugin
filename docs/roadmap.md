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
| `software-engineer-reviewer` | agent | [`agent-software-engineer-and-reviewer.md`](./agent-software-engineer-and-reviewer.md) | 🚧 À venir |
| `quality-framework` | skill | [`agents/software-engineer.md`](./agents/software-engineer.md) — chargement mandatory | 🚧 À venir |
| `clean-architecture-testing` | skill | `software-engineer.agent.md` — chargement trigger-based | 🚧 À venir |
| `test-refactoring-catalog` | skill | `software-engineer.agent.md` — trigger-based | 🚧 À venir |
| `mutation-testing` | skill | `software-engineer.agent.md` — trigger-based (phase COMMIT) | 🚧 À venir |
| Hooks de gardiennage | infra | [`agent-software-engineer-and-reviewer.md`](./agent-software-engineer-and-reviewer.md) §6 | 🚧 À venir |

---

## 2. Agent `software-engineer-reviewer` <a id="reviewer"></a>

**Type :** agent (`plugins/agents/software-engineer-reviewer.agent.md` — à créer).

**Rôle attendu :** pair adversarial du `software-engineer`. Audite le
livrable (code + tests + journal) sans pouvoir modifier le code, rend un
verdict JSON structuré (`approved` / `changes_requested` / `rejected`).

**Spécification de référence :**
[`agent-software-engineer-and-reviewer.md` §5](./agent-software-engineer-and-reviewer.md#5-lagent-software-engineer-reviewer-à-implémenter).

**Dépendances bloquantes pour son implémentation :**

- skill `quality-framework` (cf. §3 ci-dessous) ;
- skill `clean-architecture-testing` (cf. §4) ;
- skill spécifique `test-theater-detection` (à créer, voir §7).

---

## 3. Skill `quality-framework` <a id="quality-framework"></a>

**Type :** skill (`plugins/skills/quality-framework/SKILL.md` — à créer).

**Rôle attendu :** définir les critères qualité globaux partagés entre
l'Engineer et le Reviewer (quality gates, format de checklist, seuils
par couche).

**Référencé comme `mandatory at startup`** dans
`plugins/agents/software-engineer.agent.md`. Aujourd'hui, l'Engineer
log `[SKILL MISSING] quality-framework` et continue.

---

## 4. Skill `clean-architecture-testing` <a id="clean-architecture-testing"></a>

**Type :** skill (`plugins/skills/clean-architecture-testing/SKILL.md`
— à créer).

**Rôle attendu :** guider la décision du **niveau de test**, du
**placement des boundaries**, et de la **politique de doubles** (zéro
mock dans Domain/Application, intégration réelle pour les adapters).

**Déclencheurs prévus** : entrée dans une décision de boundary, choix
acceptance vs unit, doute sur l'usage d'un test double.

---

## 5. Skill `test-refactoring-catalog` <a id="test-refactoring-catalog"></a>

**Type :** skill (`plugins/skills/test-refactoring-catalog/SKILL.md`
— à créer).

**Rôle attendu :** catalogue de refactorings de tests (extraction de
helpers, renommage, dédoublonnage, paramétrisation `[Theory]`/
`[InlineData]`).

**Déclencheur prévu** : refacto d'un test pendant la phase
COMMIT & VERIFY (jamais pendant SYNTHESIZE-GREEN).

---

## 6. Skill `mutation-testing` <a id="mutation-testing"></a>

**Type :** skill (`plugins/skills/mutation-testing/SKILL.md` — à créer).

**Rôle attendu :** procédure d'exécution et d'interprétation du
mutation testing en phase COMMIT & VERIFY. Définit la règle « tout test
qui ne tue aucun mutant doit être supprimé » et les seuils par couche
(0 % de survivants pour Domain/Application, ≤ 10 % pour API/Infra).

---

## 7. Skills supplémentaires pour le Reviewer <a id="reviewer-skills"></a>

Pressentis dans
[`agent-software-engineer-and-reviewer.md` §5.9](./agent-software-engineer-and-reviewer.md#59-skills-pressentis-à-créer-lors-de-limplémentation) :

- `test-theater-detection` — catalogue d'anti-patterns avec exemples
  (tautologies, mock-dominated, fixture theater, etc.) ;
- `architecture-dependency-audit` — analyse statique du sens des
  dépendances Clean Architecture ;
- `mutation-evidence-review` — lecture critique des rapports de
  mutation testing produits par l'Engineer.

---

## 8. Hooks de gardiennage <a id="hooks"></a>

**Type :** infrastructure (chemin à définir).

**Rôle attendu :** rendre les invariants du duo Engineer/Reviewer
**mécaniquement infranchissables**. Décrits dans
[`agent-software-engineer-and-reviewer.md` §6](./agent-software-engineer-and-reviewer.md#6-rôle-des-hooks-autour-du-duo).

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

## 9. Variantes futures (non engageant)

Ces éléments ne sont pas encore référencés dans la doc mais sont des
extensions plausibles, listées ici pour mémoire :

- `functional-software-engineer` — variante fonctionnelle (Hickey /
  Wlaschin) du `software-engineer`.
- `acceptance-designer` — agent producteur de tests d'acceptation
  Given-When-Then (mentionné comme acteur amont dans la doc du duo).
- Profil de rigueur `thorough` — double passe de revue, mentionné dans
  la doc du duo mais non encore opérationnel.
