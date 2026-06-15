---
layout: doc
lang: en
title: "Test dashboard"
description: "Gate health and skill value from real harness runs, with the real cost (AIC, output tokens) per model."
---

# Test dashboard

> This dashboard is generated from **real harness runs**. It shows two views — the
> **gates** (PASS/FAIL per phase) and the **skill value** (baseline vs with-skill
> winner) — together with the real cost of each run: **AIC** (premium requests) and
> **output tokens**, broken down by model.

## What it shows

| View | Source command | Reads |
| --- | --- | --- |
| **Gates** | `run-gate` | the absolute PASS/FAIL of each phase gate |
| **Skill value** | `evaluate` | the baseline vs with-skill winner per scenario |

Each row carries the model that answered and the run's cost. **Input tokens are shown
as `n/a`**: the Copilot CLI does not emit them, and the handbook never displays an
estimated figure as if it were measured.

## How it is fed

The harness `dashboard` command folds every report under a directory into a single
`dashboard-data.json`, which this page loads. That data is **generated at test time
and never committed** — it is the output of agent runs.

```bash
skraft-test-harness dashboard \
  --reports-dir ./eval-reports \
  --out docs/site/dashboard/dashboard-data.json
```

<iframe
  src="{{ site.baseurl }}/dashboard/index.html"
  title="SKRAFT test dashboard"
  style="width:100%;height:900px;border:1px solid var(--border, #30363d);border-radius:8px;background:#0d1117;">
</iframe>

> If the frame says "No dashboard data found", run the `dashboard` command above first.
