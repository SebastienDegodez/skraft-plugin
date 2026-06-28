---
layout: doc
lang: fr
title: "Changelog"
---

# Changelog

## v1 — Migration des ADRs (2026-06)

- Les ADRs sortent de `docs/adr/` et sont consolidés dans `docs/adr/`.
- Le script `scripts/migrate-adr-layout.mjs` renomme les fichiers en séquence globale (`adr-001-...md`, `adr-002-...md`, etc.) et réécrit les liens de référence.
- Utilisation recommandée:

```bash
node scripts/migrate-adr-layout.mjs \
	--repo /chemin/vers/repo \
	--renumber-global

# appliquer réellement
node scripts/migrate-adr-layout.mjs \
	--repo /chemin/vers/repo \
	--renumber-global \
	--apply
```

- Le mode par défaut est `dry-run`; vérifier le résumé avant d’ajouter `--apply`.
- Après migration, vérifier `docs/adr/supersessions.md` et les références `ADR-*` dans les artefacts DESIGN.

## v0 — Bootstrap (2026-05)

- Création du site de documentation publique SKRAFT.
- Pages : landing, pipeline, architecture, concepts, customisation, référence agents et skills.
- Lint des citations intégré.
