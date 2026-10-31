---
title: "Catalogue agentique et qualité"
description: "Chaque agent, worker, lentille de revue et skill livré par skraft, avec son profil de contexte et ses preuves d'évaluation."
persona: software-engineer
---

# Catalogue agentique et qualité

Le catalogue liste tout ce que livre le plugin skraft : agents, workers, lentilles de revue et
skills, les chaînes d'orchestration qui les relient et, pour chacun, son profil de contexte et
les preuves de ses évaluations contrôlées. Il est construit depuis les sources du plugin à
chaque publication du manuel : il ne liste jamais un composant que le plugin ne livre plus.

**[Ouvrir le catalogue](pathname:///dashboard/)**

![Le catalogue : le nombre de skills, d'agents, workers et lentilles de revue, de skills avec une spec d'évaluation et de sujets avec des preuves publiées, puis les onglets Catalogue, Qualité, Efficacité et Modèles et leurs filtres](/img/screenshots/fr/dashboard-catalogue-light.png#gh-light-mode-only)
![Le catalogue : le nombre de skills, d'agents, workers et lentilles de revue, de skills avec une spec d'évaluation et de sujets avec des preuves publiées, puis les onglets Catalogue, Qualité, Efficacité et Modèles et leurs filtres](/img/screenshots/fr/dashboard-catalogue-dark.png#gh-dark-mode-only)

## Ce que montre chaque vue

| Vue | Ce qu'elle montre |
|---|---|
| Catalogue | Chaque agent, worker, lentille et skill, son fichier source, son profil de contexte et son dernier verdict. L'ordre d'usage : les workflows produit optionnels, puis le pipeline d'ingénierie, puis les racines indépendantes. |
| Qualité | Par skill et par modèle agent : le score baseline, le score avec skill, le gain, le taux d'activation et le verdict sur des essais appariés. |
| Efficacité | Par skill et par modèle agent : durée, tokens, tours et appels d'outils médians, avec et sans le skill. |
| Modèles | Les modèles agents évalués par le même juge sur le même skill, une ligne chacun. |

La recherche et le filtre par modèle agent s'appliquent à toutes les vues. Un composant sans
essai publié le dit : pas de données ne vaut pas succès.
