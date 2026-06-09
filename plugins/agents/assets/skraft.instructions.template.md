<!-- markdownlint-disable-file -->
---
# Copy this file into the CONSUMER repository at:
#   .github/instructions/skraft.instructions.md
# It overrides SKRAFT testing defaults. All fields are OPTIONAL — omit a field
# to take its default. Unknown values are rejected (the resolving skill emits a
# structured blocker rather than guessing).
applyTo: '**'
---

# SKRAFT instructions (consumer repo)

This file declares per-repository overrides that SKRAFT agents read at runtime.
Each capability owns a disjoint namespace under `testing:`. An agent reads only
its own namespace; it never reads another capability's keys.

Resolution precedence for every field (first writer wins):
1. an explicit instruction in the run prompt;
2. the value declared here;
3. the built-in default.

```yaml
testing:
  # --- Consumer-side mocking of downstream dependencies the SUT calls ---
  mocking:
    # microcks  -> mock from the OpenAPI/examples contract (DEFAULT, overridable)
    # inprocess -> in-process test double injected into the test host DI
    strategy: microcks
    # Only read when strategy == inprocess. One of: fakeiteasy | nsubstitute | moq
    # When omitted, preference order is: fakeiteasy > nsubstitute > moq.
    library: fakeiteasy

  # --- Provider-side contract testing of THIS service's API ---
  contract:
    # The baseline WebApplicationFactory + HttpClient integration test is ALWAYS
    # produced. This flag only ADDS the Microcks VerifyAsync layer on top.
    # true  -> add MicrocksBuilder + VerifyAsync (codes / headers / ProblemDetails)
    # false -> baseline only (DEFAULT)
    microcks: false
```

## Field reference

| Field | Values | Default | Read by |
|---|---|---|---|
| `testing.mocking.strategy` | `microcks` \| `inprocess` | `microcks` | `mocking-strategy-roster` |
| `testing.mocking.library` | `fakeiteasy` \| `nsubstitute` \| `moq` | `fakeiteasy` (then `nsubstitute`, then `moq`) | `mocking-strategy-roster` (only when `strategy: inprocess`) |
| `testing.contract.microcks` | `true` \| `false` | `false` | `contract-testing-roster` |

Any value outside the allowed set for a field is a hard error: the resolving
skill returns a `blocked` payload and the worker stops rather than guessing.
