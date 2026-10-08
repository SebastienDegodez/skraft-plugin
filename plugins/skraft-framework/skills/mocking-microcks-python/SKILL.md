---
name: mocking-microcks-python
description: Use when the mocking-strategy-roster resolved (microcks, Python) — the default mocking strategy for a Python integration test. Provides the testcontainers wiring of a Microcks container seeded from the downstream dependency's contract and the pytest fixture that points the system-under-test's HTTP client at the mock URL through the app factory. Emits mock wiring only; the business TDD cycle stays with the software-engineer lead.
---

# Mocking — Microcks x Python adapter (default)

Mocks a downstream dependency the SUT calls with a Microcks container seeded from that
dependency's OpenAPI/examples contract, and wires it into a pytest integration test.

Loaded ONLY when `mocking-strategy-roster` resolved `(microcks, Python)`.

**Boundary:** mock wiring + an integration-test scaffold. No RED->GREEN, no Object
Calisthenics, no provider contract verification (that is `contract-testing-python`). The
`software-engineer` lead integrates this into its own TDD loop.

## Dev dependencies

```
testcontainers>=4.14
httpx
```

The recipe drives Microcks through its REST API (`/api/artifact/upload`, `/rest/{service}/{version}`),
so it needs no Microcks-specific Python package.

## Recipe — mock the downstream + wire the app

```python
# tests/integration/conftest.py
from pathlib import Path

import httpx
import pytest
from testcontainers.core.container import DockerContainer
from testcontainers.core.wait_strategies import LogMessageWaitStrategy

MICROCKS_IMAGE = "quay.io/microcks/microcks-uber:1.14.0-native"


@pytest.fixture(scope="session")
def microcks():
    container = (
        DockerContainer(MICROCKS_IMAGE)
        .with_exposed_ports(8080)
        .waiting_for(LogMessageWaitStrategy("Started MicrocksApplication"))
    )
    with container:
        url = f"http://{container.get_container_host_ip()}:{container.get_exposed_port(8080)}"
        # Seed mocks from the DOWNSTREAM dependency's contract (not our API).
        contract = Path("resources/third-parties/{downstream-api}-openapi.yaml")
        response = httpx.post(f"{url}/api/artifact/upload", files={"file": (contract.name, contract.read_bytes())})
        assert response.status_code == 201, response.text
        yield url


@pytest.fixture
def client(microcks):
    from fastapi.testclient import TestClient
    from {context}.api.app import create_app
    from {context}.api.composition import build

    # Point the SUT's downstream client at the Microcks mock endpoint.
    downstream = f"{microcks}/rest/{Downstream API Name}/1.0.0"
    return TestClient(create_app(build(downstream_base_url=downstream)))
```

The service name in the mock URL is the contract's `info.title`, URL-encoded (`API%20Pastries`).
The app factory takes its wiring as an argument (`clean-architecture-python`); never patch a
module to swap the URL. To assert the mock was hit, read
`GET {microcks}/api/metrics/invocations/{service}/{version}`.

## Structured result back to the lead

Return, do not commit:

```yaml
strategy: microcks
stack: python
files:
  - tests/integration/conftest.py
testCommand: <resolved via resolving-stack-commands>   # e.g. {python} -m pytest
notes: Microcks container seeded from {downstream-api} contract ; SUT base URL -> /rest/{service}/{version}
```

## Rules

- Mock the DOWNSTREAM dependency, never the SUT itself.
- Seed with `POST /api/artifact/upload` (201 expected); reach the mock at `/rest/{service}/{version}`.
- Inject the mock URL through the app factory's wiring, never with `monkeypatch` on a module.
- Use `resolving-stack-commands` for the test command — never hardcode `pytest`.
