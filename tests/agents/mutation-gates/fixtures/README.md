# Mutation-gates agent fixtures

Suite-local .NET 10 workspaces at DELIVER verification stage. Production behavior and
ordinary tests are already green; agent must configure and execute mutation gates.

- `canonical-ready`: four canonical Clean Architecture production projects plus
  `UnitTests` and `IntegrationTests`.
- `bff-ready`: one monolithic BFF project with explicit business-policy and adapter
  source folders; canonical project discovery must not be guessed.
- `toolchain`: deterministic local `dotnet`/Stryker double plus independent verifier.
  It records init/run calls, writes native JSON reports with configured scores, and
  never requires network or package restore.

The eval stages every file explicitly. Setup initializes Git and tags the immutable
fixture baseline as `eval-baseline`; sentinel grading rejects edits to fixture toolchain,
source, tests, scripts, or solution structure.
