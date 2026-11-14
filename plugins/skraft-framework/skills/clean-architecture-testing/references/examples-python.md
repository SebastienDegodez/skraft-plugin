# Clean Architecture Testing — Python (pytest)

Runnable examples per layer. Roles and doubles follow the tables in `SKILL.md`; only the
libraries differ: pytest, hand-written fakes, testcontainers, pytest-httpserver, FastAPI
`TestClient`, import-linter.

```text
src/orders/{domain,application,infrastructure,api}/
tests/unit/<feature>/          <- Domain (rare) + Application acceptance tests, no I/O
tests/integration/<feature>/   <- API + Infrastructure + Application + Domain; architecture guard
```

Both test directories are packages (`__init__.py`). The production code is installed in the
virtual environment (`pip install -e ".[dev]"`), never imported through `sys.path` edits.

## Test layout and executable scenarios

Paths below are relative to the component root (the repository root for a single component).
For multiple contexts, give each context its own unit/integration pair under its test path.
No tests live in `src/`, and `tests/integration/` uses ordinary pytest tests, not Gherkin.

| Runner | Feature files | Bindings |
|---|---|---|
| pytest-bdd | `tests/unit/<feature>/features/` | `tests/unit/<feature>/test_<feature>.py`; reusable steps in that feature's `conftest.py` |
| behave | `tests/unit/<feature>/features/` | `tests/unit/<feature>/features/steps/*.py` |
| Specifications not executed | `docs/features/<context>/<feature>/` | none |

### pytest-bdd

A collected `test_*.py` module binds scenarios explicitly with `@scenario` or `scenarios`.
For example, in `tests/unit/place_order/test_place_order.py`:

```python
from pytest_bdd import scenarios

scenarios("features/place_order.feature")
```

Define its decorated steps in that collected module, or in
`tests/unit/place_order/conftest.py` so pytest exposes them as fixtures. A separate
`steps/*.py` folder is not loaded automatically; retaining one requires explicit fixture/plugin
registration (for example `pytest_plugins` in the root `conftest.py`). Feature paths above are
relative to the test module without a `bdd_features_base_dir` override; honor an existing
override rather than silently changing path resolution.

```json
{ "runner": "pytest-bdd", "features": "tests/unit/place_order/features",
  "steps": "tests/unit/place_order" }
```

Run `python -m pytest tests/unit/place_order` and check scenario test counts and step resolution.
Another independently bound feature folder has its own pair; one runner binding several
feature folders through shared fixtures may declare their common roots instead.

### behave

Behave loads Python files directly from the selected feature root's `steps/` directory.
For `place_order`, run `python -m behave tests/unit/place_order/features`; its steps call
the use case, not HTTP or a database. Optional `environment.py` sits in that same feature
root, not the production packages.

```json
{ "runner": "behave", "features": "tests/unit/place_order/features",
  "steps": "tests/unit/place_order/features/steps" }
```

Run each independent feature root with its own binding scope and declare a pair for each.
Do not assume `behave tests/unit` loads every nested `features/steps/` directory. If one
component command must run several roots and ordinary pytest tests, use a checked-in runner
script that invokes each required suite and fails on any failed invocation; no shell chain
in `commands.test`. A plain pytest command never runs behave scenarios.

Keep existing confirmed folders and discovery settings when extending a repository. Use
only `features` in `bdd` for specification-only files, and `bdd: false` when the team writes
no Gherkin.

## Application — acceptance test (default layer)

No mocking library in `tests/unit/`: a fake is a class holding a dict, structurally
matching the `Protocol` the use case calls.

```python
# tests/unit/place_order/test_place_order.py
from orders.application.place_order import PlaceOrder
from orders.domain.order import OrderId


class InMemoryOrders:
    def __init__(self) -> None:
        self.saved = {}

    def add(self, order) -> None:
        self.saved[order.id] = order

    def get(self, order_id):
        return self.saved.get(order_id)


def test_a_placed_order_waits_for_payment() -> None:
    orders = InMemoryOrders()

    PlaceOrder(orders).execute(OrderId("ORD-1"), customer_id="alice")

    assert orders.saved[OrderId("ORD-1")].is_pending()
```

## Infrastructure — integration test with a real database

```python
# tests/integration/orders/test_sqlalchemy_orders.py
import pytest
from sqlalchemy import create_engine
from testcontainers.postgres import PostgresContainer

from orders.domain.order import Order, OrderId
from orders.infrastructure.sqlalchemy_orders import SqlAlchemyOrders, metadata


@pytest.fixture(scope="module")
def engine():
    with PostgresContainer("postgres:17-alpine", driver="psycopg") as pg:
        engine = create_engine(pg.get_connection_url())
        metadata.create_all(engine)
        yield engine


def test_a_saved_order_is_read_back(engine) -> None:
    orders = SqlAlchemyOrders(engine)

    orders.add(Order.place(OrderId("ORD-7"), customer_id="bob"))

    assert orders.get(OrderId("ORD-7")).customer_id == "bob"
```

## Infrastructure — external HTTP API through a mock server

```python
# tests/integration/rates/test_http_rates.py
import httpx

from orders.infrastructure.http_rates import HttpRates


def test_the_rate_is_read_from_the_provider(httpserver) -> None:
    httpserver.expect_request("/rates/USD").respond_with_json({"rate": 1.08})

    rates = HttpRates(httpx.Client(base_url=httpserver.url_for("/")))

    assert rates.to_eur("USD") == 1.08
```

## API — end-to-end through the app factory

The app factory takes its wiring as an argument, so the test boots the real routes over
in-memory infrastructure without patching modules.

```python
# tests/integration/api/test_orders_api.py
from fastapi.testclient import TestClient

from orders.api.app import create_app
from orders.api.composition import build_in_memory


def test_a_customer_cannot_see_another_customers_order() -> None:
    client = TestClient(create_app(build_in_memory()))
    client.post("/orders", json={"id": "ORD-1"}, headers={"X-Customer-Id": "alice"})

    response = client.get("/orders/ORD-1", headers={"X-Customer-Id": "bob"})

    assert response.status_code == 404
```

## Architecture guard

The contracts live in `pyproject.toml` (see `clean-architecture-python`); one test runs them
so the suite fails on an import that points outward.

```python
# tests/integration/test_architecture.py
from importlinter.cli import lint_imports


def test_every_import_contract_holds() -> None:
    assert lint_imports() == 0
```
