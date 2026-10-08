---
name: contract-testing-python
description: Use when the contract-testing-roster resolved a Python stack for a provider-side contract test. Always provides the baseline FastAPI TestClient integration test through the app factory; when the Microcks opt-in is enabled, additionally boots the service on a real port with uvicorn and has a Microcks container replay the published contract against it (OPEN_API_SCHEMA runner). Emits test wiring only; the business TDD cycle stays with the software-engineer lead.
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

Dev dependencies: `testcontainers>=4.14`, `uvicorn`, `httpx`.

```python
# tests/integration/contract/test_{api}_contract_verification.py
import socket
import threading
import time
from pathlib import Path

import httpx
import uvicorn
from testcontainers.core.container import DockerContainer
from testcontainers.core.wait_strategies import LogMessageWaitStrategy

from {context}.api.app import create_app
from {context}.api.composition import build_in_memory

MICROCKS_IMAGE = "quay.io/microcks/microcks-uber:1.14.0-native"
ARTIFACTS = ["contracts/{api}.yaml", "contracts/{api}.apiexamples.yaml", "contracts/{api}.apimetadata.yaml"]


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

    # 2. Start Microcks with a route back to the host.
    container = (
        DockerContainer(MICROCKS_IMAGE)
        .with_exposed_ports(8080)
        .with_kwargs(extra_hosts={"host.docker.internal": "host-gateway"})
        .waiting_for(LogMessageWaitStrategy("Started MicrocksApplication"))
    )
    try:
        with container:
            microcks = f"http://{container.get_container_host_ip()}:{container.get_exposed_port(8080)}"
            for index, artifact in enumerate(ARTIFACTS):
                path = Path(artifact)
                query = "" if index == 0 else "?mainArtifact=false"
                upload = httpx.post(f"{microcks}/api/artifact/upload{query}", files={"file": (path.name, path.read_bytes())})
                assert upload.status_code == 201, upload.text

            # 3. Microcks replays every example against the running service.
            launched = httpx.post(f"{microcks}/api/tests", json={
                "serviceId": "{API Title}:1.0.0",          # info.title:info.version
                "testEndpoint": f"http://host.docker.internal:{port}",
                "runnerType": "OPEN_API_SCHEMA",
                "timeout": 5000,
            })
            assert launched.status_code == 201, launched.text
            result = launched.json()
            deadline = time.time() + 30
            while result.get("inProgress", True) and time.time() < deadline:
                time.sleep(0.5)
                result = httpx.get(f"{microcks}/api/tests/{result['id']}").json()

            assert result["success"], result
    finally:
        server.should_exit = True
        thread.join(timeout=5)
```

The `OPEN_API_SCHEMA` runner checks every response code, header and body against the
contract. Never suppress a failing result (`success == false`).

`GET /api/metrics/invocations/...` counts how often a MOCK was called — a consumer-side
concern, not provider conformance.

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
- Upload the main artifact first, the examples and metadata with `?mainArtifact=false`.
- Use `resolving-stack-commands` for the test command — never hardcode `pytest`.
