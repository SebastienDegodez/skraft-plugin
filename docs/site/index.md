---
title: "The skraft handbook has moved"
---

# The skraft handbook has moved

The V2 handbook is built with Docusaurus from `docs/website/` on the `integration/v2-next`
branch. Until 2.0.0 is published, read it locally:

```sh
npm ci --prefix docs/website
npm run docs:build
npm run docs:serve
```

Every pull request and every push to `integration/v2-next` also builds it in CI: download the
`docs-website-build` artifact of the *Docs website* workflow.

The documentation of released versions stays online at
[the version list](https://sebastiendegodez.github.io/skraft-plugin/).
