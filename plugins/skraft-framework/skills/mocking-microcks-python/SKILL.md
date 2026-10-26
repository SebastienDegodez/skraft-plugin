---
name: mocking-microcks-python
description: 'Use when a Python component''s brief line says `mocking: microcks` (the default) and an integration test must mock a downstream dependency. Provides the MicrocksContainer wiring (unofficial microcks-testcontainers binding, pinned) seeded from the downstream contract and the pytest fixture that points the system-under-test''s HTTP client at the mock URL through the app factory.'
---

# Mocking — Microcks x Python (default)

Mocks a downstream dependency the SUT calls with a Microcks container seeded from that
dependency's OpenAPI/examples contract, wired into a pytest integration test. Applies to a
Python component whose brief line says `mocking: microcks`. Write mock wiring and the
integration-test scaffold only; provider contract verification belongs to `contract-testing-python`.

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

Files: `tests/integration/conftest.py`. The tests need Docker.

## Rules

- Mock the DOWNSTREAM dependency, never the SUT itself.
- Seed with `MicrocksContainer(...).with_main_artifacts([...])`; reach the mock with `get_rest_mock_endpoint(name, version)`.
- `verify` / `get_service_invocations_count` only ASSERT the mock was used; they are not provider contract verification.
- Inject the mock URL through the app factory's wiring, never with `monkeypatch` on a module.
