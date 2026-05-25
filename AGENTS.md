## Agentic Workflows

After modifying any `.md` workflow file under `.github/workflows/`, always recompile:

```bash
gh aw compile
apm compile
```

Commit the regenerated `.lock.yml` and integration files together with your changes.
