# Roadmap — skraft V2

La V2 se suit dans l'epic [#211](https://github.com/SebastienDegodez/skraft-plugin/issues/211)
et ses issues de lot #212 à #223 : périmètre, scénarios et critère de fin de chaque lot. Le plan
détaillé est dans [`v2/prd.md`](v2/prd.md). La roadmap v1 (US1 à US13, garde-fous G1 à G9 par
hooks) reste sur `main`.

Chaque lot arrive sur `integration/v2-next` par sa propre PR ; les issues restent ouvertes
jusqu'à la PR finale `integration/v2-next` → `main`, qui livre la 2.0.0 et les ferme.

## État des lots

| Lot | Issue | Contenu | État sur `integration/v2-next` |
|---|---|---|---|
| 0 | [#212](https://github.com/SebastienDegodez/skraft-plugin/issues/212) | Cadrage et socle : moteur v1 retiré, squelette du moteur, ADR-001, harnais de régression | Fusionné |
| 1 | [#213](https://github.com/SebastienDegodez/skraft-plugin/issues/213) | RESEARCH de bout en bout par le mod Claude Code et le workflow Copilot ; journal chaîné | Fusionné |
| 2 | [#214](https://github.com/SebastienDegodez/skraft-plugin/issues/214) | `skraft-config.json` à composants, `skraft init`, `skraft doctor`, bases, gates | Fusionné (#231) |
| 3 | [#215](https://github.com/SebastienDegodez/skraft-plugin/issues/215) | DESIGN, DISTILL, DELIVER sur un workflow DOT ; droits d'écriture par diff git ; TDD rouge/vert | Fusionné (#233) |
| 4 | [#216](https://github.com/SebastienDegodez/skraft-plugin/issues/216) | Revue en code : lentilles en parallèle, réfutation, verdict calculé, re-revue incrémentale | Fusionné (#236) |
| 5 | [#217](https://github.com/SebastienDegodez/skraft-plugin/issues/217) | Décisions humaines : étape `ask`, `skraft decide`, ratification d'ADR, escalade d'environnement | Fusionné (#241) |
| 6 | [#218](https://github.com/SebastienDegodez/skraft-plugin/issues/218) | Agents et skills : migration et élagage | Fusionné (#254) |
| 7 | [#219](https://github.com/SebastienDegodez/skraft-plugin/issues/219) | Boucle de clôture mutation, barre 100 % cœur / 80 % frontière | Fusionné (#257) |
| 8 | [#220](https://github.com/SebastienDegodez/skraft-plugin/issues/220) | PR de fin de run, captures Playwright, commentaire d'issue, panneau, `qa-report.md` | Fusionné (#273, #274, #276, #284) ; le Canvas Copilot reste à faire |
| 9 | [#221](https://github.com/SebastienDegodez/skraft-plugin/issues/221) | Plugin `skraft-brownfield` | Fusionné (#268) |
| 10 | [#222](https://github.com/SebastienDegodez/skraft-plugin/issues/222) | VS Code : SDK Copilot, boucle `skraft next` / `skraft record` | Fusionné (#272) |
| 11 | [#223](https://github.com/SebastienDegodez/skraft-plugin/issues/223) | Bascule et 2.0.0 : `skraft migrate`, documentation V2, comparaison finale v1/V2, run de référence | En cours |

Également fusionnés hors lot : le contrat du pilote Copilot
([ADR-002](adr/adr-002-copilot-host-driver-contract.md), #253, #271), le bail de session et le
journal signé (#280), la revue DELIVER dans `review.skraft.dot` (#281).

## Reste à faire pour la 2.0.0

- `skraft migrate` : conversion d'un `state.json` v1 en cours en journal (lot 11).
- `skraft review --pr` : la revue DELIVER sur une pull request quelconque (#240).
- Un Canvas Copilot qui dessine la vue Observe.
- La comparaison v1/V2 sur toutes les fixtures et le run de référence chiffré sur Mac et
  Windows (#263).
