---
name: mocking-microcks-python
description: 'Use when a Python component''s brief line says `mocking: microcks` (the default) and a test must mock a downstream dependency (an external gateway). Provides the MicrocksContainer wiring (unofficial microcks-testcontainers binding, pinned), one uber native container per test session in a pytest session fixture, the fixture that points the system-under-test''s HTTP client at the mock URL through the app factory, and the Docker or Podman setup.'
---

# Mocking — Microcks x Python (default)

Mocks a downstream dependency the SUT calls with a Microcks container seeded from that
dependency's OpenAPI/examples contract. Applies to a Python component whose brief line says
`mocking: microcks`, in every test the infrastructure policy runs the external gateway on Microcks
(targeted scenarios and walking skeleton). Write mock wiring and the test scaffold only;
provider contract verification belongs to `contract-testing-python`.

## Dev dependencies

```
microcks-testcontainers @ git+https://github.com/Caesarsage/microcks-testcontainers-python@b61580e9b8dd18be6ea98d3a24ad6248971656dd
testcontainers>=4.14
```

`microcks-testcontainers` is an unofficial binding, not on PyPI: pin it to this commit, never
to a branch. It mirrors the official Java/.NET API (`with_main_artifacts`,
`get_rest_mock_endpoint`, `verify`).

## Recipe — one container per test session

```python
# tests/conftest.py — the root conftest, so unit and integration tests share one container
import pytest
from microcks_testcontainers import MicrocksContainer

MICROCKS_IMAGE = "quay.io/microcks/microcks-uber:1.14.0-native"


@pytest.fixture(scope="session")
def microcks():
    # Seed mocks from the DOWNSTREAM dependency's contract (not our API).
    with MicrocksContainer(MICROCKS_IMAGE).with_main_artifacts(["resources/third-parties/{downstream-api}-openapi.yaml"]) as container:
        yield container


@pytest.fixture(scope="session")
def downstream_url(microcks):
    return microcks.get_rest_mock_endpoint("{Downstream+API+Name}", "1.0.0")
```

- **Targeted scenario** (`tests/unit/`): hand the use case the real HTTP gateway built on
  `downstream_url`.
- **Walking skeleton / API test** (`tests/integration/`): build the app with it.

```python
# tests/integration/conftest.py
import pytest
from fastapi.testclient import TestClient

from {context}.api.app import create_app
from {context}.api.composition import build


@pytest.fixture
def client(downstream_url):
    return TestClient(create_app(build(downstream_base_url=downstream_url)))
```

The service name is the contract's `info.title` with spaces encoded (`API+Pastries`); the
binding does not encode it. The app factory takes its wiring as an argument
(`clean-architecture-python`); never patch a module to swap the URL. To assert the mock was
hit, use `microcks.verify("{Downstream API Name}", "1.0.0")` or
`get_service_invocations_count(...)`.

## Docker or Podman

Testcontainers finds Docker by itself. Podman is reached once the developer sets, outside the
tests:

| OS | Podman |
|---|---|
| macOS | `podman machine start`; `DOCKER_HOST` = `unix://` + the path `podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}'` prints; `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock` |
| Linux | `systemctl --user enable --now podman.socket`; `DOCKER_HOST` = `unix://` + the path `podman info --format '{{.Host.RemoteSocket.Path}}'` prints |
| Windows | `podman machine start`; `DOCKER_HOST=npipe:////./pipe/podman-machine-default` |

Rootless Podman: `TESTCONTAINERS_RYUK_DISABLED=true`; rootful: `TESTCONTAINERS_RYUK_PRIVILEGED=true`.

## Rules

- Mock the DOWNSTREAM dependency, never the SUT itself.
- One Microcks container per test session: the `session` fixture of the root `conftest.py`.
- `verify` / `get_service_invocations_count` only ASSERT the mock was used; they are not provider contract verification.
- Inject the mock URL through the app factory's wiring, never with `monkeypatch` on a module.
- No Docker or Podman answers: never `pytest.skip`, never put a fake in its place; let the
  container start fail and stop, blocked, naming the component (the scenario is INDETERMINATE).
