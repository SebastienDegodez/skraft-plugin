# Conventions de documentation

Cette page définit les **conventions visuelles et structurelles** de la
documentation de `skraft-plugin` : badges, gabarits de fiche, signalement des
éléments non encore implémentés, nommage des fichiers. Le contrat du site
(un mode Diátaxis par page, parité FR/EN, gabarits de page, citations) est
l'en-tête de [`website/book.yml`](./website/book.yml) ; cette page ne le
répète pas.

---

## 1. Badges de statut

Chaque fiche (agent, skill, composant) commence par une ligne de badge :

| Badge | Sens | Quand l'utiliser |
|---|---|---|
| `Statut : ✅ Implémenté` | Le composant existe dans le repo et est utilisable en l'état. | Le fichier source existe sous `plugins/` (agent, skill, code du moteur ou d'un pilote). |
| `Statut : 🚧 À venir` | Le composant est référencé/spécifié mais n'a pas encore de fichier source. | Agent, skill, commande `skraft` ou pilote mentionné mais absent de `plugins/`. |
| `Statut : 📝 Partiel` | Le composant existe mais des fonctionnalités/comportements documentés ne sont pas encore opérationnels. | Skill avec sections incomplètes, agent avec capacités planifiées. |

> Règle : tout élément **🚧** ou **📝** doit aussi apparaître dans la
> [feuille de route](./website/i18n/fr/docusaurus-plugin-content-docs/current/index.mdx#roadmap) de l'accueil du handbook.
> Si ce n'est pas le cas, c'est un bug de documentation.

---

## 2. Encart « À venir » (dans le corps)

Quand une **section** d'une fiche décrit un comportement non encore
implémenté, on l'encadre par cet encart standard :

```markdown
> 🚧 **À venir** — Cette section décrit un comportement non encore
> implémenté. Voir la [feuille de route](../index.mdx#roadmap).
```

Le lien est un lien de fichier relatif vers l'accueil du handbook (`index.mdx#roadmap`) ;
le chemin relatif dépend de la profondeur de la page (ici, une page à un niveau).

---

## 3. Gabarit — Fiche d'agent

Les agents et les skills n'ont plus de fiche Markdown écrite à la main : le catalogue du
site (`docs/website/static/dashboard/`, servi sous `/dashboard/` et `/fr/dashboard/`), généré par
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
- toute mention d'un élément 🚧 doit être liée à la feuille de route.

---

## 6. Conventions de fichiers

| Règle | Détail |
|---|---|
| Langue | **Français** pour `docs/` ; le site (`docs/website/`) est bilingue, chaque page EN de `docs/website/docs/` a sa jumelle FR au même chemin sous `docs/website/i18n/fr/docusaurus-plugin-content-docs/current/`. |
| Encodage | UTF-8, sauts de ligne LF. |
| Liens | Relatifs depuis le fichier courant dans `docs/` ; dans le site aussi, lien de fichier relatif (`../how-to/run-gates.md`), jamais un `/fr/…` ou `/en/…` absolu. |
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
| Roadmap | renvoi `docs/roadmap.md` ; tableau dans `index.mdx#roadmap` de chaque locale du site | — |
| Conventions | `docs/conventions.md` | — |
| Page du site | EN `docs/website/docs/<doc>.md`, FR `docs/website/i18n/fr/docusaurus-plugin-content-docs/current/<doc>.md` (`.mdx` seulement avec du JSX), déclarée par son `doc` dans `docs/website/book.yml` | `explanation/architecture` |
| Agents et skills | catalogue généré, `docs/website/static/dashboard/` | — |

---

## 8. Cas particulier : page qui décrit de l'existant et de l'à-venir

Une page peut décrire un workflow dont une partie est implémentée et
l'autre non (cas typique : un pilote d'hôte disponible et un autre encore
à venir).

Dans ce cas :

- badge global **📝 Partiel** ;
- chaque section non implémentée porte l'**encart « À venir »** du §2 ;
- mention explicite « (non encore implémenté) » dans le titre de
  section.
