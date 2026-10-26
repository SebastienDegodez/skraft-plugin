# Mutation-gates agent fixtures

Suite-local .NET 10 workspaces at DELIVER, pass 2: the engine's mutation gate failed and
sent the software-engineer back. Production behavior and ordinary tests are green; the
engine, never the agent, runs the mutation gate and keeps its evidence.

- `canonical-ready`: four canonical Clean Architecture production projects plus
  `UnitTests` and `IntegrationTests`, with no Stryker config yet. `QuoteOrder` holds one
  unobserved arithmetic value, the equivalent mutant of the last stimulus.
- `bff-ready`: one monolithic BFF project with explicit business-policy and adapter
  source folders; canonical project discovery must not be guessed.
- `canonical-configured`: the two root Stryker configs `configure-mutation.mjs` writes
  for `canonical-ready`, staged by the survivor stimuli.
- `gate-feedback`: the gate evidence logs the brief's feedback points to, and the native
  core reports (`qg-mutation-report.json`) listing a real and an equivalent survivor.
- `toolchain`: deterministic local `dotnet`/Stryker double plus independent verifier.
  It records init/run calls, so a mutation run the agent launches is visible, and never
  requires network or package restore.

The eval stages every file explicitly. Setup initializes Git and tags the immutable
fixture baseline as `eval-baseline`; sentinel grading rejects edits to the fixture
toolchain and the solution file.
