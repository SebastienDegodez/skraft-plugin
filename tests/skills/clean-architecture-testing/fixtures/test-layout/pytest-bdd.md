# Orders service

Single bounded context, repository root is component root. Python service
installed from pyproject.toml, with src/orders/domain, application,
infrastructure and api packages. Existing suites: tests/unit and
tests/integration. Unit tests exercise use cases; integration tests exercise the
composed API, persistence and import contracts.

The team has chosen pytest-bdd for place_order and cancel_order. The test
command is python -m pytest tests. No scenario modules, step modules or BDD
folders exist yet; pytest uses its default test-module naming. There is no
bdd_features_base_dir override and no registered step plugin.

The integration suite remains ordinary pytest tests. We want one folder per
business feature and paths relative to this repository. Neither independent
feature currently has shared step fixtures.
