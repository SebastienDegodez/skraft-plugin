# Fixtures — contract-testing-worker

One base workspace plus overlays, rather than one full copy per stimulus: the three stimuli
differ only in what the opt-in cascade can see, and duplicating a .NET solution three times to
express that would hide the variable being tested.

| Path | Role |
|---|---|
| `eligibility-provider/` | The provider under contract. A minimal Clean Architecture .NET solution serving `GET /eligibility/{age}` with a `ProblemDetails` error path, and an integration-test project with no test in it yet. Staged by every stimulus. |
| `overlays/microcks-optin/` | `.github/instructions/skraft.instructions.md` declaring `testing.contract.microcks: true`. Staged only by the repo-opt-in stimulus. |
| `overlays/contracts/` | The published OpenAPI contract and its Microcks `.apiexamples`. Staged by the two stimuli that resolve the opt-in to true. |

The `Domain` and `Application` projects carry behaviour on purpose: the worker's boundary says
it does not drive the business TDD cycle, and a `diff-not-contains` guard on those two paths is
only meaningful if there is something there it could have been tempted to change.

**Package pins in `Directory.Packages.props` are unverified** — no restore has ever run against
this fixture. Resolve them before the suite leaves `skip-evals.txt`.
