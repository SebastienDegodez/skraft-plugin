---
applyTo: '**'
---

# SKRAFT instructions (consumer repo)

Per-repository overrides read by SKRAFT agents at runtime. Resolution precedence:
prompt instruction > this file > built-in default.

```yaml
testing:
  # --- Consumer-side mocking of downstream dependencies the SUT calls ---
  mocking:
    # microcks  -> mock from the OpenAPI/examples contract (default)
    # inprocess -> in-process test double injected into the test host DI
    strategy: inprocess
    # `library` is deliberately omitted: with no library named the roster's
    # preference order applies (fakeiteasy > nsubstitute > moq).
```
