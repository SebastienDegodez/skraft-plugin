---
layout: doc
lang: fr
title: "Contribuer"
---

# Contribuer

## Proposer une modification de documentation

1. Forkez le dépôt et créez une branche depuis `main`.
2. Modifiez ou ajoutez vos pages dans `docs/site/fr/` et `docs/site/en/`.
3. Exécutez le lint des citations avant de soumettre :

```bash
node scripts/check-citations.mjs --citations docs/site/_data/citations.yml --pages "docs/site/**/*.md"
```

4. Ouvrez une Pull Request avec une description claire du changement.

## Règles de citation (§4.2)

- Chaque citation doit être **en anglais**, **≤ 25 mots**.
- Chaque citation doit exister dans `_data/citations.yml`.
- Le format d'appel est `{% raw %}{% include citation.html key="cle" %}{% endraw %}`.

## Ajouter une nouvelle citation

Ouvrez une PR qui ajoute l'entrée dans `_data/citations.yml` avec :

- `key` — identifiant unique (auteur-année)
- `authors`, `year`, `title`, `type`
- Une justification dans la description de PR expliquant la pratique que la citation défend.

## Autres contributions

Pour les contributions au code des agents ou des skills, consultez le [CONTRIBUTING.md](https://github.com/SebastienDegodez/skraft-plugin/blob/main/CONTRIBUTING.md) du dépôt.
