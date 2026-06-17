---
layout: doc
lang: fr
title: "playwright-evidence"
description: ">"
persona: tech-lead
---

# playwright-evidence

> Capture les preuves de tests E2E (screenshots, vidéos, traces) et les stocke sous `.copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/{story}/evidence/` pour que les agents puissent les consommer.

## Quand l'utiliser

- Configurer la capture d'évidence Playwright pour une story en phase DELIVER
- Capturer des screenshots, vidéos et traces sur échec de test E2E
- Générer un `manifest.md` d'évidence que les agents orchestrateurs lisent
- Configurer le pipeline CI pour uploader l'évidence comme artefact

## Contrat d'entrée

- Projet Playwright (TypeScript) configuré avec `playwright.config.ts`
- Variable d'environnement `SKRAFT_STORY_ID` définie (ex. `42-add-eligibility-check`)
- `@playwright/test` installé, Chromium disponible

## Contrat de sortie

- Screenshots dans `evidence/screenshots/{test-title}-{timestamp}.png` (sur échec)
- Vidéos dans `evidence/` (mode `retain-on-failure`)
- Traces dans `evidence/traces/trace.zip` (mode `retain-on-failure`)
- Rapport HTML dans `evidence/reports/index.html`
- `manifest.md` listant tous les fichiers capturés avec type, chemin, et test associé

## Invariants

- **Convention de chemin** — `.copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/{story}/evidence/` — `{story}` vient de `SKRAFT_STORY_ID`, cohérent avec tous les autres artefacts SDLC
- **Scope de ce skill : capturer, nommer, stocker, lister** — la publication est la responsabilité de l'agent orchestrateur
- **Capture uniquement sur échec** — ne pas accumuler d'artefacts sur les tests qui passent (`retain-on-failure`)
- **Rétention CI** — `retention-days: 7` sur `upload-artifact` ; ajouter le répertoire `evidence/` au `.gitignore`

## Pourquoi cette forme

La clé de story (`{story}` = `SKRAFT_STORY_ID`) rend le manifest sans ambiguïté quand plusieurs stories s'exécutent en séquence. L'orchestrateur lit le manifest en résolvant `state.md` pour obtenir la story active — sans connaissance codée en dur des chemins. Le `manifest.md` structure : timestamp d'exécution, statut global, durée, et table des fichiers (type | chemin | test).

> « Evidence is the record of what the system did. The manifest is how agents consume it. »

## Customisation autorisée

- Reporters supplémentaires (JUnit, list, etc.) (L1)
- Taille de la fenêtre vidéo (défaut : 1280×720) (L1)
- Durée de rétention CI (défaut : 7 jours) (L2)
- Options de traçage (`screenshots`, `snapshots`, `sources`) (L2)

## Voir aussi

- [outside-in-tdd]({{ "/fr/reference/skills/outside-in-tdd" | relative_url }}) — Cycle TDD dont les tests E2E produisent cette évidence
- [quality-gates-evidence-contract]({{ "/fr/reference/skills/quality-gates-evidence-contract" | relative_url }}) — Contrat d'évidence que ce skill alimente
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent DELIVER qui configure et exécute ce skill
