# Rapport prévisionnel: Keep the basket

basket | 1234567890abcdef1234567890abcdef12345678

## Impact attendu

Customers can retry with their basket.

## Traçabilité

| Critère | Description | Test | Statut | Preuve |
| --- | --- | --- | --- | --- |
| AC-1 | Retain the basket | tests/basket.test.mjs | PLANNED | qa/plan.md |

La traçabilité associe les critères aux tests et références déclarés, sans prouver leur exécution ni leur résultat. Les références locales ne sont pas des preuves accessibles à distance.

## Plan de tests prévisionnel

qa/plan.md (local source reference; not remotely verified)

# Approved plan

- Retry payment with the saved basket.

## Limites

- Provider outage recovery is not covered.

## Médias

- Basket screenshot: qa/basket.png local-only; not remotely accessible
1 média(s) omis.
