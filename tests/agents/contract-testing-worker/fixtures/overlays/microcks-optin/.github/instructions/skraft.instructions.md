---
applyTo: '**'
---

# SKRAFT instructions (consumer repo)

Per-repository overrides read by SKRAFT agents at runtime. Resolution precedence:
prompt instruction > this file > built-in default.

```yaml
testing:
  # --- Provider-side contract testing of THIS service's API ---
  contract:
    # The baseline WebApplicationFactory + HttpClient integration test is ALWAYS
    # produced. This flag only ADDS the Microcks verification layer on top.
    microcks: true
```
