<!-- markdownlint-disable-file -->

# Basket price implementation plan

The basket price slice is implemented and its unit and integration tests are green.
This repository is a monolithic BFF rather than the usual layered project layout: there
is no Domain, Application, API or Infrastructure project. Business policy source is under
`src/Storefront/BusinessRules/`; delivery adapter source is under
`src/Storefront/DeliveryAdapters/`.
