---
layout: doc
lang: en
title: "Contributing"
---

# Contributing

## Proposing a documentation change

1. Fork the repository and create a branch from `main`.
2. Edit or add pages in `docs/site/fr/` and `docs/site/en/`.
3. Run the citation lint before submitting:

```bash
node scripts/check-citations.mjs --citations docs/site/_data/citations.yml --pages "docs/site/**/*.md"
```

4. Open a Pull Request with a clear description of the change.

## Citation rules (§4.2)

- Every citation must be **in English**, **≤ 25 words**.
- Every citation must exist in `_data/citations.yml`.
- The include format is `{% raw %}{% include citation.html key="key" %}{% endraw %}`.

## Adding a new citation

Open a PR that adds the entry to `_data/citations.yml` with:

- `key` — unique identifier (author-year)
- `authors`, `year`, `title`, `type`
- A justification in the PR description explaining the practice the citation defends.

## Other contributions

For contributions to agent or skill code, see the repository's [CONTRIBUTING.md](https://github.com/SebastienDegodez/skraft-plugin/blob/main/CONTRIBUTING.md).
