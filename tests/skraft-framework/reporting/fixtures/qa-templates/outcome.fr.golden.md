# Rapport de résultat: Keep the basket

basket | 1234567890abcdef1234567890abcdef12345678

## Impact attendu

Customers can retry with their basket.

## Impact constaté

Basket retained locally; deployment not recorded.

## Traçabilité

| Critère | Description | Test | Statut | Preuve |
| --- | --- | --- | --- | --- |
| AC-1 | Retain the basket | tests/basket.test.mjs | UNVERIFIED | qa/tests.stdout |

La traçabilité associe les critères aux tests et références déclarés, sans prouver leur exécution ni leur résultat. Les références locales ne sont pas des preuves accessibles à distance.

## Preuves des contrôles

qa/quality.json

| ID | Gate | Status | Command | References | Reported metrics | Evidence check |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | Basket test | pass | node --test tests/basket.test.mjs | qa/tests.stdout; qa/tests.exit | tests_total: 1; tests_passed: 1; tests_failed: 0 | exit=0 |
| G2 |  | UNVERIFIED |  |  |  | Missing gate evidence |
| G3 |  | UNVERIFIED |  |  |  | Missing gate evidence |
| G4 |  | UNVERIFIED |  |  |  | Missing gate evidence |
| G5 |  | UNVERIFIED |  |  |  | Missing gate evidence |
| G6 |  | UNVERIFIED |  |  |  | Missing gate evidence |
| G7 |  | UNVERIFIED |  |  |  | Missing gate evidence |
| G8 |  | UNVERIFIED |  |  |  | Missing gate evidence |
| G9 |  | UNVERIFIED |  |  |  | Missing gate evidence |
| G10 |  | UNVERIFIED |  |  |  | Missing gate evidence |
| G11 |  | UNVERIFIED |  |  |  | Missing gate evidence |

## Revue persistée

qa/review.md (local source reference; not remotely verified)

# Review

NEEDS_REWORK: remaining gates are not recorded.

## Journal des changements

qa/changes.md (local source reference; not remotely verified)

# Changes

- Retain basket in src/basket.mjs.

Les contrôles agrégés, y compris G1, restent distincts des résultats par critère. Sans preuve individuelle liée au test et au critère, le résultat reste UNVERIFIED.

Le rendu vérifie les preuves locales, pas les objets Git ni le déploiement. La décision globale appartient à la revue.

## Limites

- Provider outage recovery is not covered.

## Médias

- Basket screenshot: qa/basket.png local-only; not remotely accessible
1 média(s) omis.
