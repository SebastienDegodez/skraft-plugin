# Fixtures — mock-integration-worker

One base workspace plus overlays: the three stimuli differ only in what the override cascade can
see, and duplicating a .NET solution three times to express that would hide the variable being
tested.

| Path | Role |
|---|---|
| `checkout-with-downstream/` | The system under test. A checkout API that calls a downstream Eligibility API through a typed client whose base address comes from configuration (`EligibilityApi:BaseUrl`) — that key is the seam a mock has to repoint. Staged by every stimulus. |
| `overlays/inprocess-instructions/` | `.github/instructions/skraft.instructions.md` declaring `testing.mocking.strategy: inprocess` and deliberately **omitting** `library`, so the roster's preference order is what gets graded. Staged only by the repo-override stimulus. |
| `overlays/contracts/` | The downstream's published OpenAPI contract and its Microcks `.apiexamples`. Staged only by the default-strategy stimulus — the container strategy is the one that seeds itself from a contract. |

The downstream port (`IEligibilityClient`) lives in `Checkout.Application` and its HTTP
implementation in `Checkout.Infrastructure`. That split is what makes "mock the downstream, never
the SUT" gradable: a worker that edits either project has replaced the wrong thing, and the
`diff-not-contains` guard on `src/Checkout.*` catches it.

**Package pins in `Directory.Packages.props` are unverified** — no restore has ever run against
this fixture. Resolve them before the suite leaves `skip-evals.txt`.
