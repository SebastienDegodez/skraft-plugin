# Artifact Bridging Reference

## Phase → Artifact Convention Table

| Phase | Artifact type | File path | Naming rule |
|---|---|---|---|
| DESIGN | OpenAPI 3.1 contract | `.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/{name}.yaml` | kebab-case, resource-centric |
| DESIGN | AsyncAPI 2.6.0 contract | `.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/{name}-events.yaml` | kebab-case, `-events` suffix |
| DISTILL | Microcks examples | `.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/{name}.apiexamples.yaml` | same stem as DESIGN contract |
| DISTILL | Microcks metadata | `.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/{name}.apimetadata.yaml` | same stem as DESIGN contract |
| DELIVER | Test imports | Copied to `tests/{Project}/contracts/` via `.csproj` content items | mirrors DISTILL structure |

**Stem rule:** the filename stem (without extension) is identical across all three phases.

| DESIGN | DISTILL |
|---|---|
| `eligibility-check-api.yaml` | `eligibility-check-api.apiexamples.yaml` |
| | `eligibility-check-api.apimetadata.yaml` |
| `monassurance-events-api.yaml` | `monassurance-events-api.apiexamples.yaml` |
| | `monassurance-events-api.apimetadata.yaml` |

---

## Full `.skraft` Directory Structure

```
.skraft/
└── sdlc/
    ├── design/
    │   └── contracts/
    │       ├── eligibility-check-api.yaml          ← OpenAPI contract
    │       └── monassurance-events-api.yaml         ← AsyncAPI contract
    └── distill/
        └── contracts/
            ├── eligibility-check-api.apiexamples.yaml
            ├── eligibility-check-api.apimetadata.yaml
            ├── monassurance-events-api.apiexamples.yaml
            └── monassurance-events-api.apimetadata.yaml
```

**Test project layout (DELIVER):**
```
tests/
└── MonAssurance.IntegrationTests/
    ├── contracts/
    │   ├── eligibility-check-api.yaml
    │   ├── eligibility-check-api.apiexamples.yaml
    │   ├── eligibility-check-api.apimetadata.yaml
    │   ├── monassurance-events-api.yaml
    │   ├── monassurance-events-api.apiexamples.yaml
    │   └── monassurance-events-api.apimetadata.yaml
    └── Tests/
        └── EligibilityContractTests.cs
```

---

## Auto-Import Pattern (DELIVER)

Declare contracts as content files in the test `.csproj` to copy them to the output directory:

```xml
<ItemGroup>
  <Content Include="contracts\**\*">
    <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
  </Content>
</ItemGroup>
```

Reference them in `MicrocksBuilder` using relative paths from the output root:

```csharp
new MicrocksBuilder()
    .WithMainArtifact("contracts/eligibility-check-api.yaml")
    .WithMainArtifact("contracts/eligibility-check-api.apiexamples.yaml")
    .WithMainArtifact("contracts/eligibility-check-api.apimetadata.yaml")
    .BuildAsync();
```

**Loading order is mandatory:** schema (`.yaml`) → examples (`.apiexamples.yaml`) → dispatcher (`.apimetadata.yaml`).

---

## Orchestrator Movement Protocol

When the orchestrator transitions from DESIGN → DISTILL, it:

1. Reads all `.yaml` files under `.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/`.
2. For each contract, creates a skeleton `.apiexamples.yaml` in `.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/`.
3. Creates a skeleton `.apimetadata.yaml` in `.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/`.
4. Populates examples from OpenAPI `operationId` entries (one example per response code per operation).
5. Selects default dispatcher (`JSON_BODY` for POST with body, none for GET/DELETE).

When the orchestrator transitions from DISTILL → DELIVER, it:

1. Copies all DISTILL artifacts (`.yaml`, `.apiexamples.yaml`, `.apimetadata.yaml`) into the test project `contracts/` directory.
2. Adds `<Content>` items to the test `.csproj` if not already present.
3. Generates a `MicrocksFixture` class referencing the copied artifacts.

---

## Contract Version Bump Protocol

A version bump is required on any breaking change to a contract. Execute atomically:

### Step 1 — Update the OpenAPI/AsyncAPI contract

```yaml
# In .copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/eligibility-check-api.yaml
info:
  version: 2.0.0   # ← bumped from 1.0.0
```

### Step 2 — Update both DISTILL artifacts

```yaml
# In .copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/eligibility-check-api.apiexamples.yaml
metadata:
  name: "Eligibility Check API - 2.0.0"   # ← must match exactly

# In .copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/eligibility-check-api.apimetadata.yaml
metadata:
  name: "Eligibility Check API - 2.0.0"   # ← must match exactly
```

### Step 3 — Update VerifyAsync calls in tests

```csharp
// In MonAssurance.IntegrationTests
var result = await _microcks.VerifyAsync("Eligibility Check API", "2.0.0");
//                                                                  ↑ bumped
```

### Step 4 — Update GetRestMockUrl calls

```csharp
var mockUrl = _microcks.GetRestMockUrl("Eligibility Check API", "2.0.0");
```

### Step 5 — Commit atomically

All four changes (design contract, examples, metadata, test code) must appear in a single commit. Do not split across commits — a partial version bump breaks Microcks artifact matching.

---

## Naming Rules Summary

| Rule | Example |
|---|---|
| Stem matches across phases | `eligibility-check-api` in DESIGN, DISTILL, and DELIVER |
| `metadata.name` = `{info.title} - {info.version}` | `"Eligibility Check API - 1.0.0"` |
| REST mock URL name = `info.title` (URL-encoded) | `Eligibility+Check+API` in URL |
| Version in `GetRestMockUrl` = `info.version` | `"1.0.0"` (string, not semver object) |
| AsyncAPI stems get `-events` suffix | `monassurance-events-api` |

---

## Breaking vs. Non-Breaking Changes

| Change type | Breaking? | Version action |
|---|---|---|
| Remove a field from response schema | Yes | Major bump |
| Change field type | Yes | Major bump |
| Remove an operation (path + method) | Yes | Major bump |
| Add required request field | Yes | Major bump |
| Add optional response field | No | Minor bump |
| Add a new operation | No | Minor bump |
| Change a description / example value | No | Patch bump |
| Add a new example to `.apiexamples.yaml` | No | Patch bump |
| Change dispatcher logic only | No | No version bump (metadata only) |
