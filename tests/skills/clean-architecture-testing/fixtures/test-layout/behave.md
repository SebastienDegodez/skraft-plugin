# Orders service

Single bounded context, repository root is component root. Python service
installed from pyproject.toml, with src/orders/domain, application,
infrastructure and api packages. Existing suites: tests/unit and
tests/integration. Unit tests exercise use cases; integration tests exercise
the composed API, persistence and import contracts.

The team has chosen behave for place_order and cancel_order. Each feature has
its own independent step implementations; there is no shared step library or
custom behave runner. The current test command only runs python -m pytest tests.
No BDD folders have been created yet.

The integration suite remains ordinary pytest tests. We want one folder per
business feature, paths relative to this repository and one reliable test
command for the component. Tests must remain outside src.
