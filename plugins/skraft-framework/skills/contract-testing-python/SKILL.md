---
name: contract-testing-python
description: Use when the contract-testing-roster resolved a Python stack for a provider-side contract test. Always provides the baseline FastAPI TestClient integration test through the app factory; when the Microcks opt-in is enabled, additionally boots the service on a real port with uvicorn and has a MicrocksContainer (unofficial microcks-testcontainers binding, pinned) replay the published contract against it (OPEN_API_SCHEMA runner). Emits test wiring only; the business TDD cycle stays with the software-engineer lead.
---

# Contract Testing — Python adapter (baseline + optional Microcks)

Python recipe for a provider-side contract test of THIS service's API. Loaded ONLY when
`contract-testing-roster` resolved a Python stack; the roster passes the `microcks` opt-in.

**Boundary:** test wiring only. No business RED->GREEN, no Object Calisthenics, no
consumer-side mocking.

## Layer 1 — Baseline (ALWAYS emitted)

`TestClient` over the real app built by its factory (`clean-architecture-python`), with
in-memory infrastructure.

```python
# tests/integration/contract/test_{api}_contract.py
from fastapi.testclient import TestClient

from {context}.api.app import create_app
from {context}.api.composition import build_in_memory


def test_an_unknown_resource_answers_404_problem_details() -> None:
    client = TestClient(create_app(build_in_memory()))

    response = client.get("/resource/does-not-exist")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["status"] == 404
```

## Layer 2 — Microcks contract verification (ONLY when opt-in == true)

Microcks replays every example of the published contract against the RUNNING service and
validates each response. A `TestClient` serves the app in-process and exposes no port, so
boot the same app factory with uvicorn on a real port the container can reach. Load the
artifacts authored per the generic `contract-testing` skill.

Dev dependencies: `microcks-testcontainers @ git+https://github.com/Caesarsage/microcks-testcontainers-python@b61580e9b8dd18be6ea98d3a24ad6248971656dd` (unofficial binding, not on PyPI: pin the commit),
`testcontainers>=4.14`, `uvicorn`.

```python
# tests/integration/contract/test_{api}_contract_verification.py
import socket
import threading
import time

import uvicorn
from microcks_testcontainers import MicrocksContainer, TestRequest, TestRunnerType

from {context}.api.app import create_app
from {context}.api.composition import build_in_memory

MICROCKS_IMAGE = "quay.io/microcks/microcks-uber:1.14.0-native"


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("0.0.0.0", 0))
        return probe.getsockname()[1]


def test_the_service_satisfies_the_published_contract() -> None:
    # 1. Boot the SUT on a real port, all interfaces, so the container can reach it.
    port = free_port()
    server = uvicorn.Server(uvicorn.Config(create_app(build_in_memory()), host="0.0.0.0", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    while not server.started:
        time.sleep(0.05)

    # 2. Start Microcks seeded from the contract artifacts, with a route back to the host.
    microcks = (
        MicrocksContainer(MICROCKS_IMAGE)
        .with_main_artifacts(["contracts/{api}.yaml"])
        .with_secondary_artifacts(["contracts/{api}.apiexamples.yaml", "contracts/{api}.apimetadata.yaml"])
        .with_kwargs(extra_hosts={"host.docker.internal": "host-gateway"})
    )
    try:
        with microcks:
            # 3. Microcks replays every example against the running service.
            result = microcks.test_endpoint(TestRequest(
                service_id="{API Title}:1.0.0",          # info.title:info.version
                runner_type=TestRunnerType.OPEN_API_SCHEMA,
                test_endpoint=f"http://host.docker.internal:{port}",
                timeout=5000,                            # milliseconds
            ))

            assert result.success, result
    finally:
        server.should_exit = True
        thread.join(timeout=5)
```

The `OPEN_API_SCHEMA` runner checks every response code, header and body against the
contract. Never suppress a failing result (`success == false`).

`microcks.verify(name, version)` is a DIFFERENT method: it returns a `bool` checking how many
times a MOCK was invoked — a consumer-side concern. It is NOT provider conformance. Use
`test_endpoint` here.

## Structured result back to the lead

Return, do not commit:

```yaml
status: ok
capability: contract-testing
stack: python
microcks: false | true
files:
  - tests/integration/contract/test_{api}_contract.py                # baseline (always)
  - tests/integration/contract/test_{api}_contract_verification.py   # only when microcks == true
testCommand: <resolved via resolving-stack-commands>
notes: baseline TestClient always ; Microcks OPEN_API_SCHEMA replay against uvicorn added iff opt-in
```

## Rules

- ALWAYS emit Layer 1, regardless of the opt-in. Add Layer 2 ONLY when `microcks: true`.
- Layer 2 needs a real port: run the app factory under uvicorn on `0.0.0.0`, reach it from the
  container through `host.docker.internal` mapped to `host-gateway`.
- Load the contract with `with_main_artifacts`, the examples and metadata with `with_secondary_artifacts`.
- Layer 2 is `test_endpoint(TestRequest(runner_type=OPEN_API_SCHEMA))`, never `verify`.
- Use `resolving-stack-commands` for the test command — never hardcode `pytest`.
