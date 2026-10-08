---
name: mocking-microcks-python
description: Use when the mocking-strategy-roster resolved (microcks, Python) — the default mocking strategy for a Python integration test. Provides the MicrocksContainer wiring (unofficial microcks-testcontainers binding, pinned) of a Microcks container seeded from the downstream dependency's contract and the pytest fixture that points the system-under-test's HTTP client at the mock URL through the app factory. Emits mock wiring only; the business TDD cycle stays with the software-engineer lead.
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
microcks-testcontainers @ git+https://github.com/Caesarsage/microcks-testcontainers-python@b61580e9b8dd18be6ea98d3a24ad6248971656dd
testcontainers>=4.14
```

`microcks-testcontainers` is an unofficial binding, not on PyPI: pin it to this commit, never
to a branch. It mirrors the official Java/.NET API (`with_main_artifacts`,
`get_rest_mock_endpoint`, `verify`).

## Recipe — mock the downstream + wire the app

```python
# tests/integration/conftest.py
import pytest
from fastapi.testclient import TestClient
from microcks_testcontainers import MicrocksContainer

from {context}.api.app import create_app
from {context}.api.composition import build

MICROCKS_IMAGE = "quay.io/microcks/microcks-uber:1.14.0-native"


@pytest.fixture(scope="session")
def microcks():
    # Seed mocks from the DOWNSTREAM dependency's contract (not our API).
    with MicrocksContainer(MICROCKS_IMAGE).with_main_artifacts(["resources/third-parties/{downstream-api}-openapi.yaml"]) as container:
        yield container


@pytest.fixture
def client(microcks):
    # Point the SUT's downstream client at the Microcks mock endpoint.
    downstream = microcks.get_rest_mock_endpoint("{Downstream+API+Name}", "1.0.0")
    return TestClient(create_app(build(downstream_base_url=downstream)))
```

The service name is the contract's `info.title` with spaces encoded (`API+Pastries`); the
binding does not encode it. The app factory takes its wiring as an argument
(`clean-architecture-python`); never patch a module to swap the URL. To assert the mock was
hit, use `microcks.verify("{Downstream API Name}", "1.0.0")` or
`get_service_invocations_count(...)`.

## Structured result back to the lead

Return, do not commit:

```yaml
strategy: microcks
stack: python
files:
  - tests/integration/conftest.py
testCommand: <resolved via resolving-stack-commands>   # e.g. {python} -m pytest
notes: MicrocksContainer seeded from {downstream-api} contract ; SUT base URL -> get_rest_mock_endpoint
```

## Rules

- Mock the DOWNSTREAM dependency, never the SUT itself.
- Seed with `MicrocksContainer(...).with_main_artifacts([...])`; reach the mock with `get_rest_mock_endpoint(name, version)`.
- `verify` / `get_service_invocations_count` only ASSERT the mock was used; they are not provider contract verification.
- Inject the mock URL through the app factory's wiring, never with `monkeypatch` on a module.
- Use `resolving-stack-commands` for the test command — never hardcode `pytest`.
