# Conventions de documentation

Cette page définit les **conventions visuelles et structurelles** à
appliquer dans toute la documentation de `skraft-plugin`. Elle est la
source unique pour les badges, les gabarits de fiche et le signalement
des éléments non encore implémentés.

---

## 1. Badges de statut

Chaque fiche (agent, skill, composant) commence par une ligne de badge :

| Badge | Sens | Quand l'utiliser |
|---|---|---|
| `Statut : ✅ Implémenté` | Le composant existe dans le repo et est utilisable en l'état. | Le fichier source existe sous `plugins/` (agent, skill, code du moteur ou d'un pilote). |
| `Statut : 🚧 À venir` | Le composant est référencé/spécifié mais n'a pas encore de fichier source. | Agent, skill, commande `skraft` ou pilote mentionné mais absent de `plugins/`. |
| `Statut : 📝 Partiel` | Le composant existe mais des fonctionnalités/comportements documentés ne sont pas encore opérationnels. | Skill avec sections incomplètes, agent avec capacités planifiées. |

> Règle : tout élément **🚧** ou **📝** doit aussi apparaître dans
> [`../docs/roadmap.md`](./roadmap.md). Si ce n'est pas le cas, c'est un
> bug de documentation.

---

## 2. Encart « À venir » (dans le corps)

Quand une **section** d'une fiche décrit un comportement non encore
implémenté, on l'encadre par cet encart standard :

```markdown
> 🚧 **À venir** — Cette section décrit un comportement non encore
> implémenté. Voir la [roadmap](../roadmap.md#ancre-de-la-section).
```

Le lien doit pointer vers l'entrée correspondante dans
[`roadmap.md`](./roadmap.md).

---

## 3. Gabarit — Fiche d'agent

Les agents et les skills n'ont plus de fiche Markdown écrite à la main : le catalogue du
site (`docs/site/fr/dashboard/`, `docs/site/en/dashboard/`), généré par
`eng/catalog/scan.mjs` depuis `plugins/*/com.github.copilot/agents/` et `plugins/*/skills/`,
les couvre chacun une fois. Ce gabarit sert quand une page du site décrit un agent en détail.

```markdown
# Agent `<nom>`

**Statut :** ✅ Implémenté | 🚧 À venir | 📝 Partiel
**Source :** `plugins/skraft-framework/com.github.copilot/agents/<nom>.agent.md` (ou `—` si à venir)

## Mission
Une à deux phrases.

## Quand est-il déclenché ?
Conditions de déclenchement, qui l'invoque.

## Skills chargés
- Mandatory : …
- Trigger-based : …

## Cycle d'exécution
Phases ou workflow.

## Garde-fous
Règles non négociables.

## Limites
Ce que l'agent ne fait jamais.

## Voir aussi
Liens vers fiches connexes et documents transverses.
```

---

## 4. Gabarit — Fiche de skill

Même règle que le §3 : le catalogue du site couvre chaque skill ; ce gabarit sert quand une
page du site décrit une skill en détail.

```markdown
# Skill `<nom>`

**Statut :** ✅ Implémenté | 🚧 À venir | 📝 Partiel
**Source :** `plugins/<plugin>/skills/<nom>/SKILL.md` (ou `—` si à venir)

## Quand l'utiliser
Déclencheurs (frontmatter `description` du SKILL).

## Résumé
Le cœur de la méthode en quelques bullets.

## Règles non négociables
Hard rules.

## Ressources associées
- Références (`references/`)
- Assets (`assets/`)

## Consommé par
Liste des agents qui chargent ce skill.
```

---

## 5. Gabarit — Page transverse / architecture

Pas de format imposé, mais :

- titre `H1` unique en tête ;
- une section **« État actuel »** explicite si le sujet recoupe du
  🚧 ;
- toute mention d'un élément 🚧 doit être liée à la roadmap.

---

## 6. Conventions de fichiers

| Règle | Détail |
|---|---|
| Langue | **Français** pour `docs/` ; le site (`docs/site/`) est bilingue, chaque page `fr/` a sa jumelle `en/`. |
| Encodage | UTF-8, sauts de ligne LF. |
| Liens | Toujours **relatifs** depuis le fichier courant. |
| Titres | Un seul `H1` par fichier, hiérarchie stricte ensuite. |
| Diagrammes | Mermaid, blocs <code>```mermaid</code>. |
| Code | Bloc clos avec langage : ```` ```csharp ```` , ```` ```json ```` , etc. |
| Tableaux | Pipe markdown standard, en-tête obligatoire. |

---

## 7. Règles de nommage des fichiers

| Type | Chemin | Exemple |
|---|---|---|
| Index | `docs/README.md` | — |
| Architecture | `docs/architecture.md` | — |
| Roadmap | `docs/roadmap.md` | — |
| Conventions | `docs/conventions.md` | — |
| Page du site | `docs/site/<fr\|en>/<partie>/<nom-anglais>.md`, déclarée dans `docs/site/_data/book.yml` | `docs/site/fr/explanation/architecture.md` |
| Agents et skills | catalogue généré, `docs/site/<fr\|en>/dashboard/` | — |

---

## 8. Cas particulier : pages mixtes (existant + à venir)

Une page peut décrire un workflow dont une partie est implémentée et
l'autre non (cas typique : un pilote d'hôte disponible et un autre encore
à venir).

Dans ce cas :

- badge global **📝 Partiel** ;
- chaque section non implémentée porte l'**encart « À venir »** du §2 ;
- mention explicite « (non encore implémenté) » dans le titre de
  section.
