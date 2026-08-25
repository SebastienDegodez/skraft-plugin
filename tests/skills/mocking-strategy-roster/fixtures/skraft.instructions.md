<!-- markdownlint-disable-file -->
---
applyTo: '**'
---

# SKRAFT instructions (checkout service)

Per-repository testing overrides for this service.

```yaml
testing:
  mocking:
    strategy: inprocess
    library: fakeiteasy

  contract:
    microcks: false
```
