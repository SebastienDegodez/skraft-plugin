<!-- markdownlint-disable-file -->
# Replacing the legacy orders module with orders-v2

Facade: the API gateway route table (`gateway/routes.yaml`) sends each orders endpoint to
`legacy-orders` or `orders-v2`.

| Slice | Contract surface | Status | Cutover verdict | Notes |
|---|---|---|---|---|
| S0 | facade | done | PASS (transparent) | all endpoints still on legacy-orders, characterization suite green through the gateway |
| S1 | POST /orders | done (orders-v2 live) | PASS (equivalent) | — |
| S2 | GET /orders/:id | in-progress | — | orders-v2 returns `items` as `{ "page": 1, "size": 20, "data": [...] }`; legacy-orders returns the full `items` array. Every other assertion of the S2 characterization tests passes against orders-v2, and the full suite is green with S2 still on legacy-orders. |
| S3 | DELETE /orders/:id | not-started | — | — |
