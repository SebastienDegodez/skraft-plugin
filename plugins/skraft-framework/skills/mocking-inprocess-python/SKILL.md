---
name: mocking-inprocess-python
description: Use when the mocking-strategy-roster resolved (inprocess, Python) — the override mocking strategy that replaces a downstream dependency with an in-process double (respx for httpx, responses for requests, or a hand-written fake passed to the app factory) instead of a Microcks container. Emits mock wiring only; the business TDD cycle stays with the software-engineer lead.
---

# Mocking — In-process x Python adapter (override)

Replaces a downstream dependency the SUT calls with an in-process double in a pytest
integration test. Selected when the operator overrides the Microcks default.

Loaded ONLY when `mocking-strategy-roster` resolved `(inprocess, Python)`. When no library is
named, the table below is ordered by priority: take the first row that matches the SUT's HTTP
client and whose package is already a dev dependency; otherwise the first row that matches
the client.

**Boundary:** mock wiring + integration-test scaffold only. No business TDD, no Object
Calisthenics enforcement, no provider contract verification.

## Libraries (table order = priority, top = highest)

| Priority | Library | Fits | Double |
|---|---|---|---|
| 1 | respx | the SUT calls through `httpx` | `respx.mock(base_url=...)` routes answering at the HTTP layer |
| 2 | responses | the SUT calls through `requests` | `responses.RequestsMock()` registered URLs |
| 3 | fake | any client behind an application `Protocol` | a hand-written class passed to the app factory |

## Recipe — respx (httpx)

```python
# tests/integration/test_{feature}_api.py
import httpx
import respx
from fastapi.testclient import TestClient

from {context}.api.app import create_app
from {context}.api.composition import build

DOWNSTREAM = "https://rates.example.invalid"


def test_a_claim_above_the_limit_waits_for_approval() -> None:
    with respx.mock(base_url=DOWNSTREAM, assert_all_called=True) as downstream:
        downstream.get("/rates/USD").mock(return_value=httpx.Response(200, json={"rate": 1.08}))
        client = TestClient(create_app(build(downstream_base_url=DOWNSTREAM)))

        response = client.post("/claims", json={"employee_id": "e1", "amount": "1200", "currency": "USD"})

    assert response.json()["status"] == "awaiting_approval"
```

`responses` follows the same shape with `responses.RequestsMock()` and `rsps.add(...)`.
A `fake` replaces the client object itself: `build(rates=FixedRates(1.08))`.

## Structured result back to the lead

Return, do not commit:

```yaml
strategy: inprocess
stack: python
library: respx | responses | fake
files:
  - tests/integration/test_{feature}_api.py
testCommand: <resolved via resolving-stack-commands>
notes: in-process double for the {downstream} client, injected through the app factory
```

## Rules

- Double the DOWNSTREAM client, never the SUT's own domain or use cases.
- This is an INTEGRATION-test double at the HTTP boundary; `unittest.mock` and `pytest-mock`
  stay out of the core and `tests/unit` (G7).
- Inject through the app factory's wiring; never `monkeypatch` a module attribute.
- Use `resolving-stack-commands` for the test command — never hardcode `pytest`.
