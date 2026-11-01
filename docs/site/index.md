---
title: "The skraft handbook has moved"
---

# The skraft handbook has moved

The V2 handbook is built with Docusaurus from
[`docs/website/`](https://github.com/SebastienDegodez/skraft-plugin/tree/integration/v2-next/docs/website)
on the `integration/v2-next` branch. Its pages are Markdown files under
[`docs/website/docs/`](https://github.com/SebastienDegodez/skraft-plugin/tree/integration/v2-next/docs/website/docs)
(English) and
[`docs/website/i18n/fr/docusaurus-plugin-content-docs/current/`](https://github.com/SebastienDegodez/skraft-plugin/tree/integration/v2-next/docs/website/i18n/fr/docusaurus-plugin-content-docs/current)
(French).

Until 2.0.0 is published, read it locally from a clone of that branch:

```sh
npm ci --prefix docs/website
npm run docs:build
npm run docs:serve
```

Every pull request and every push to `integration/v2-next` also builds it in CI: download the
`docs-website-build` artifact of the *Docs website* workflow, unzip it, then serve it with
`npx docusaurus serve --dir <unzipped folder>` from `docs/website`.

The documentation of released versions stays online at
[the version list](https://sebastiendegodez.github.io/skraft-plugin/).
