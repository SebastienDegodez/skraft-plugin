---
layout: doc
lang: fr
title: "Tableau de bord des tests"
description: "Santé des gates et valeur des skills à partir d'exécutions réelles du harness, avec le coût réel (AIC, tokens de sortie) par modèle."
---

# Tableau de bord des tests

> Ce tableau de bord est généré à partir d'**exécutions réelles du harness**. Il
> présente deux vues — les **gates** (PASS/FAIL par phase) et la **valeur des skills**
> (vainqueur baseline vs with-skill) — avec le coût réel de chaque run : **AIC**
> (premium requests) et **tokens de sortie**, ventilés par modèle.

## Ce qu'il montre

| Vue | Commande source | Lit |
| --- | --- | --- |
| **Gates** | `run-gate` | le PASS/FAIL absolu de chaque gate de phase |
| **Valeur des skills** | `evaluate` | le vainqueur baseline vs with-skill par scénario |

Chaque ligne porte le modèle qui a répondu et le coût du run. **Les tokens d'entrée
sont affichés `n/a`** : le Copilot CLI ne les émet pas, et le handbook n'affiche
jamais un chiffre estimé comme s'il était mesuré.

## Comment il est alimenté

La commande `dashboard` du harness agrège tous les rapports d'un répertoire en un seul
`dashboard-data.json`, que cette page charge. Cette donnée est **générée au moment des
tests et jamais archivée** — c'est la sortie des exécutions d'agents.

```bash
skraft-test-harness dashboard \
  --reports-dir ./eval-reports \
  --out docs/site/dashboard/dashboard-data.json
```

<iframe
  src="{{ site.baseurl }}/dashboard/index.html"
  title="Tableau de bord des tests SKRAFT"
  style="width:100%;height:900px;border:1px solid var(--border, #30363d);border-radius:8px;background:#0d1117;">
</iframe>

> Si le cadre indique « No dashboard data found », lance d'abord la commande `dashboard`
> ci-dessus.
