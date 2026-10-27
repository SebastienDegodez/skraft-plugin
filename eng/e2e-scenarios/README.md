# Scénarios de bout en bout

Un scénario rejoue une story complète, de RESEARCH à la pull request de fin de run, sous un
vrai hôte Copilot, sur un petit dépôt de bac à sable. On le rejoue à l'identique après un échec
ou une grosse modification du moteur.

Chaque scénario est un dossier :

| Fichier | Rôle |
| --- | --- |
| `seed/` | le dépôt de départ ; `skraft-config.template.json` devient `skraft-config.json` |
| `issue.md` | l'issue ouverte à chaque remise à zéro (`# <titre>` puis le corps) |
| `scenario.json` | le dépôt de bac à sable (`repo`) et le slug du run |
| `scenario.md` | les points de contrôle de chaque phase et le journal des passes |

`tests/tooling/e2e-scenarios/` vérifie que la configuration de chaque graine reste acceptée par
le moteur, que chaque script de gate qu'elle nomme existe dans le plugin et que son
`package-lock.json` est suivi par git.

## Prérequis

Node 22.5+, `gh` connecté à github.com, et git capable de pousser en HTTPS sans invite :
`gh auth setup-git` si git passe d'ordinaire par SSH (le moteur pousse la branche du run avec
`credential.interactive=never`).

## 1. Installer le plugin sous test

Installer depuis un worktree figé de `integration/v2-next`, jamais depuis le dépôt de travail,
avec un chemin absolu. Une marketplace locale ne copie rien : Copilot (CLI 1.0.102-1) charge le
plugin en direct depuis `~/skraft-v2-sous-test/plugins/skraft-framework`, donc le worktree ne
bouge pas pendant une passe.

```bash
git fetch origin
git worktree add --detach ~/skraft-v2-sous-test origin/integration/v2-next   # ensuite : git -C ~/skraft-v2-sous-test checkout --detach origin/integration/v2-next
copilot plugin uninstall skraft@skraft                                      # échoue sans dommage s'il n'est pas installé
copilot plugin marketplace remove skraft
copilot plugin marketplace add ~/skraft-v2-sous-test
copilot plugin install skraft@skraft
git -C ~/skraft-v2-sous-test rev-parse --short HEAD                          # le commit à noter dans le journal des passes
```

Retirer la marketplace `skraft` désinstalle aussi `skraft-backlog@skraft` ; la réinstaller de la
même façon si besoin. Revenir à la version publiée : `copilot plugin marketplace remove skraft`,
puis `copilot plugin marketplace add sebastiendegodez/skraft-plugin`.

## 2. Remettre le bac à sable à zéro

```bash
node eng/e2e-scenarios/reset.mjs mastermind --workdir ~/skraft-sandbox/mastermind --plugin ~/skraft-v2-sous-test/plugins/skraft-framework
```

Le script **réécrit `main` du dépôt nommé dans `scenario.json`** (push forcé), ferme ses pull
requests ouvertes et ses issues `skraft-scenario`, supprime ses autres branches, rouvre l'issue
du scénario et laisse un clone neuf sur la branche du run (`feat/<issue>-<slug>`). Le dépôt ne
se passe pas en argument. Le script ne supprime un `--workdir` existant que s'il l'a créé
lui-même. `--plugin` est le dossier `plugins/skraft-framework` que Copilot charge : celui du
worktree de l'étape 1.

Les commandes de gates de `skraft-config.json` nomment les scripts du plugin par leur chemin
absolu sur la machine, comme la skill `quality-gates-typescript` le demande : ce chemin apparaît
dans le `skraft-config.json` commité et dans la description de la PR. C'est attendu.

Il affiche les arguments du workflow, par exemple
`{"slug":"evaluer-proposition","issue":3,"title":"Évaluer une proposition"}` ; ils sont aussi
dans `.git/skraft-scenario.json` du clone.

## 3. Jouer le run

Dans le clone : `npm ci`, puis ouvrir l'hôte **en mode interactif** (jamais en autopilot : les
décisions humaines y sont refusées).

- **Copilot CLI** : `copilot` dans le clone, puis demander de lancer le workflow dynamique
  `skraft-pipeline` avec les arguments affichés.
- **App Copilot** : ouvrir le dossier du clone, puis la même demande.

Quand le run pose une question (consentement à la PR, ratification d'ADR), répondre par l'outil
`skraft_decide`, confirmer dans la boîte de dialogue de l'hôte, puis reprendre le run depuis
`/workflows`.

## 4. Relever le résultat

Noter la passe dans le journal de `scenario.md` (date, hôte et version, commit du plugin,
phase atteinte, résultat), avec un lien vers une issue par écart. Les preuves restent dans le
clone : `.copilot-tracking/skraft-plans/<slug>/events.jsonl` et `run-report.md`, plus la pull
request et le commentaire de l'issue sur GitHub.
