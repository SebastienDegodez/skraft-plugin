<!-- markdownlint-disable-file -->
# {{phase}} Review — {{projectSlug}}
## {{date}} · Attempt {{attempt}}

**Verdict:** {{verdict}}
**Depth tier:** {{depthTier}} | **Lenses:** {{lensCount}} | **Weighted score:** {{score}}
{{#lenses}}

### Lens {{index}} — {{name}} : {{lensScore}}
{{#findings}}
- {{.}}
{{/findings}}
{{/lenses}}

### Weighted synthesis

| Lens | Weight | Score | Contribution |
|---|---|---|---|
{{#synthesis}}
| {{lens}} | {{weight}} | {{lensScore}} | {{contribution}} |
{{/synthesis}}
| **Total** | | | **{{score}}** |

### Final verdict: `{{verdict}}`

{{conclusion}}
