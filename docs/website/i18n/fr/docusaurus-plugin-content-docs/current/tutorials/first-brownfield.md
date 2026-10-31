---
title: "Premier dépôt existant"
description: "Sous GitHub Copilot CLI, faire décrire un petit code existant sans documentation par l'analyste brownfield, puis transformer son PRD en backlog relu dans le canvas skraft backlog."
persona: tech-lead
---

# Premier dépôt existant

Dans ce tutoriel, vous partez d'un petit code existant, sans test ni documentation. L'agent
`brownfield-analyst` en tire un PRD ; le workflow `skraft-prd-backlog` découpe ce PRD en epics et en
stories ; vous relisez les stories prêtes dans le canvas **skraft backlog**. À la fin, le canvas
affiche votre backlog, chaque story prête marquée relue, et rien n'est encore publié sur GitHub.

Un seul parcours ; chaque étape dit ce que vous devez voir. Les agents sont réels : comptez du
temps et les crédits Copilot qu'ils consomment.

## Ce dont vous avez besoin

- **Node 22** ou plus, et **Git** ;
- **GitHub Copilot CLI**, connecté, dans un client qui affiche les canvas.

## 1. Créer le code existant

Dans un terminal, créez le dossier `permis` :

```console
$ mkdir permis
$ cd permis
$ git init -b main
```

`package.json` :

```json
{
  "name": "permis",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

`src/eligibility.js`, la règle qu'un service d'assurance applique aux jeunes conducteurs :

```js
const decisions = new Map()
const DAY = 24 * 60 * 60 * 1000

const ageOn = (birth, today) => {
  const age = today.getFullYear() - birth.getFullYear()
  const birthday = new Date(today.getFullYear(), birth.getMonth(), birth.getDate())
  return today < birthday ? age - 1 : age
}

export const decide = (driver, today = new Date()) => {
  const decision = ageOn(new Date(driver.birthDate), today) >= 18
    ? { eligible: true }
    : { eligible: false, reason: 'âge minimum 18 ans' }
  decisions.set(driver.id, { ...decision, at: today })
  return decision
}

export const lastDecision = (driverId, today = new Date()) => {
  const kept = decisions.get(driverId)
  return kept && today - kept.at <= 30 * DAY ? kept : null
}
```

Commitez :

```console
$ git add .
$ git commit -m "Eligibility as it runs today"
```

`git log --oneline` montre un seul commit. Le dépôt n'a ni test, ni documentation, ni backlog :
c'est votre code existant.

## 2. Installer les plugins

```console
$ copilot plugin marketplace add SebastienDegodez/skraft-plugin
$ copilot plugin install skraft@skraft
$ copilot plugin install skraft-brownfield@skraft
$ copilot plugin install skraft-backlog@skraft
$ copilot plugin list
```

Les trois plugins figurent dans la liste.

## 3. Faire décrire le code par l'analyste

Ouvrez une session Copilot dans `permis` (`copilot`), tapez `/agent`, choisissez
`skraft-brownfield:brownfield-analyst`, puis écrivez :

```text
Analyse ce dépôt et rédige son PRD. Produit : « Éligibilité des jeunes conducteurs ».
```

L'analyste lit la structure, le manifeste et le code. Chaque affirmation qu'il écrit est un **FACT**
(lu par un outil) ou une **INFERENCE** avec sa confiance (High, Medium, Low). Il range ses
artefacts de caractérisation sous
`.copilot-tracking/skraft-plans/<projet>/characterization/<AAAA-MM-JJ>/` et lit le verdict de sa
porte de confiance dans `index.md`.

Le dépôt n'a aucun test : attendez-vous au verdict **CONCERNS**. L'analyste vous montre alors sa
liste de vérification, chaque affirmation de confiance Low et chaque fonctionnalité centrale sans
couverture, et attend. Relisez-la : la règle des 18 ans et la conservation 30 jours doivent y
figurer. Répondez :

```text
Confirmé.
```

L'analyste compose le PRD, puis vous donne son chemin sous `docs/prds/`, les verdicts de
caractérisation et de schéma, et le nombre de questions ouvertes. Ouvrez le PRD : ses exigences
fonctionnelles portent des identifiants `FR-001`, `FR-002`…, ses exigences non fonctionnelles
`NFR-…`.
Commitez-le :

```console
$ git add docs/prds
$ git commit -m "docs: PRD from the existing code"
```

## 4. Découper le PRD en backlog

Dans la même session, écrivez, avec le chemin que l'analyste vous a donné :

```text
Lance le workflow skraft-prd-backlog avec prd docs/prds/<nom>.md et frame false.
```

`frame false` découpe sans les questions de cadrage. Suivez le run dans `/workflows` : un script
inventorie chaque identifiant du PRD, puis `backlog-slicer` écrit la carte des stories, que des
scripts vérifient (chaque FR couverte, une story traçante par epic, des dépendances sans cycle).

Le run se met en pause sur la carte. Ouvrez
`.copilot-tracking/skraft-plans/<nom>/backlog/story-map.md` : les epics, leurs stories et leurs
milestones. Elle vous convient : reprenez le run depuis `/workflows`.

Un `story-writer` par story écrit chaque story en entier ; un script la confronte à la Definition of
Ready ; les quatre lentilles de planification relisent chaque epic. Le run se met de nouveau en
pause, à la remise : **rien n'est publié tant qu'un humain n'a pas relu**.

## 5. Relire le backlog dans le canvas

Demandez à Copilot :

```text
Ouvre le canvas skraft backlog.
```

Le canvas s'ouvre sur l'onglet **Suivi** :

![Canvas skraft backlog, onglet Suivi : les chiffres clés (2 épics, 4 stories, 1 refusée, 1 retenue, 2 prêtes, 0/2 relues), la barre des stories par état, puis l'epic EP-001 avec son verdict de revue, son résultat attendu et ses trois stories](/img/screenshots/fr/backlog-canvas-progress.png)

*Figure 1 — L'onglet Suivi : chaque epic dans son cadre, avec le verdict de sa revue de
planification et ses stories. Capture faite sur le jeu d'essai du canvas (un PRD d'éligibilité
proche du vôtre) ; vos chiffres et vos stories dépendent de votre PRD.*

Lisez la ligne du haut : combien de stories sont **prêtes**, **retenues** par la revue, ou
**refusées** par les contrôles. Cliquez sur une story refusée : l'onglet **Revue** l'ouvre comme une
check-list.

![Canvas skraft backlog, onglet Revue : la story EP-001-S02 « Être refusé avant 18 ans » refusée, ses défauts Vague Persona, No Examples et Technical AC, puis les six lettres INVEST, chacune avec la valeur trouvée](/img/screenshots/fr/backlog-canvas-review.png)

*Figure 2 — L'onglet Revue : chaque lettre INVEST et chaque item de la Definition of Ready avec ce
qui a été trouvé ; une ligne en échec dit pourquoi et comment corriger.*

Une story refusée ou retenue ne se publie pas : la check-list vous dit ce qui lui manque. Ouvrez
maintenant chaque story **prête**, lisez sa fiche, et cliquez sur **Marquer relue**. Le bandeau du
bas compte vos relectures : quand il affiche autant de stories relues que de stories prêtes, votre
premier backlog est relu.

Le workflow reste en pause et rien n'est créé sur GitHub : la création passe par le bouton **Créer
les issues** du canvas, ou par la case Human Review de `handoff.md` puis la reprise du run, quand
vous le déciderez.

## Ce que vous avez appris

- `brownfield-analyst` décrit un code existant en distinguant les faits des inférences, et vous
  demande de valider ce qu'il n'a pas pu prouver avant d'écrire le PRD ;
- le workflow `skraft-prd-backlog` découpe un PRD en epics et en stories, vérifiées par des scripts
  puis par quatre lentilles, et s'arrête deux fois pour vous ;
- le canvas skraft backlog montre pourquoi chaque story est prête, retenue ou refusée, et c'est vous
  qui la marquez relue.

## Pages suivantes

- [Le backlog : de l'idée à la story prête](../explanation/backlog.md) — pourquoi chaque contrôle et chaque lentille existe.
- [Parcours Brownfield](../explanation/brownfield.md) — le filet de caractérisation, puis le refactoring Mikado ou Strangler Fig.
- [Premier run sous GitHub Copilot CLI](./first-run-copilot.md) — mener ensuite une story jusqu'à sa pull request.
