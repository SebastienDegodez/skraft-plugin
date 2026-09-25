<!-- markdownlint-disable-file -->

# Basket price delivery handoff

Implementation and ordinary tests are complete and green. This repository is a
monolithic BFF rather than the usual layered project layout. Finish DELIVER verification
without inventing projects: business policy source is under
`src/Storefront/BusinessRules/`; delivery adapter source is under
`src/Storefront/DeliveryAdapters/`. Execute mandatory core then boundary mutation gates,
deposit dated evidence, and stop on any non-zero gate result.