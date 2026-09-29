# PLAN — Évaluation Vally de `clean-architecture-testing`

> Portfolio d'évaluation produit selon `.agents/skills/create-skraft-eval/SKILL.md` (étape 7 :
> checkpoint avant écriture). Rédigé en français — langue de l'utilisateur ; les prompts et
> rubriques de l'instrument sont en anglais, comme l'exige la règle 3.
>
> **Version 2** — le §12 consigne la revue critique de la version 1 et les trois corrections
> structurelles qu'elle a imposées.

---

## 1. Cibles

| Élément | Chemin |
|---|---|
| Skill évaluée | `plugins/skraft-framework/skills/clean-architecture-testing/SKILL.md` |
| Spec d'éval | `tests/skills/clean-architecture-testing/eval.yaml` *(à créer)* |
| Fixture | `tests/skills/clean-architecture-testing/fixtures/payment/` *(à créer)* |
| Runner | `eng/run-vally-evals.sh clean-architecture-testing` |

Le nom du répertoire d'éval correspond exactement au répertoire de la skill livrée — condition
sans laquelle le runner déclare l'éval *skipped*.

---

## 2. Évidence lue et comportements non couverts

Lu, dans cet ordre : `AGENTS.md` → `SKILL.md` cible → ses trois références → les specs voisines
(`test-design-mandates`, `outside-in-tdd`, `test-refactoring-catalog`, `mocking-strategy-roster`) →
`eng/run-vally-evals.sh` → `eng/lib/paired-trials.mjs` et `eng/lib/verdict.mjs`.

**Aucune couverture existante** : la skill n'a pas de `tests/skills/<skill>/` — d'où l'absence
constatée sur le dashboard publié.

Enseignements distinctifs de la skill, et à qui appartient quoi :

| Enseignement | Propriétaire | Retenu ? |
|---|---|---|
| Exactement deux projets de test par contexte borné (`.UnitTest` / `.IntegrationTest`) | cette skill | ✅ S1 |
| Le double suit la couche : client réel + serveur de substitution côté adaptateur | cette skill | ✅ S1 |
| Un provider in-memory n'est **pas** un test d'infrastructure | cette skill | ✅ S2 |
| Le test d'architecture est une garde CI, jamais un test de la boucle rapide | cette skill | ✅ S3 |
| Iron Rule : test Domain seulement pour une règle extraite à matrice large | cette skill (chevauche `test-design-mandates`) | ✅ garde-fou S4 |
| Nommage des dossiers de test par comportement, jamais par ticket | cette skill | ❌ coupé (§4) |
| Mocks de contrat externes | cette skill, renvoie à `contract-testing` | partiellement, via S1 |
| Cycle RED → GREEN | `outside-in-tdd` (sous-skill déclarée) | ❌ → frontière S5 |
| Quels tests méritent d'exister avant le code | `test-design-mandates` | ❌ évité, chevauchement |
| Nettoyer du code de test qui passe | `test-refactoring-catalog` | ❌ évité |

**Décision de cadrage.** Le chevauchement avec `test-design-mandates` est réel (elle possède
« quelle règle mérite son propre test »). Le portfolio se concentre donc sur ce que cette skill
possède seule : **où le test vit physiquement, et avec quoi il a le droit de parler**.

> **Incohérence relevée dans le dépôt, puis corrigée.** Les cinq fixtures de
> `tests/skills/outside-in-tdd/fixtures/*/` plaçaient leurs tests d'architecture dans
> `tests/CheckoutPricing.UnitTests/Architecture/` — exactement la combinaison que
> `clean-architecture-testing` classe comme interdite (« Architecture scanner test in UnitTest »).
> Elles ont été déplacées vers un projet `CheckoutPricing.IntegrationTests`, et les graders de
> `outside-in-tdd/eval.yaml` qui les visaient ont suivi. Détail et vérifications : §14.
> Conséquence sur ce plan : la fixture de S1 ne réutilise pas l'ancienne structure, qui
> amorcerait la mauvaise réponse.

---

## 3. Matrice comportement → couverture

| Comportement | Évidence | Classe | Tâche la plus étroite qui force la décision | Surface de preuve | Hypothèse d'échec baseline | Avantage attendu du traitement | Priorité |
|---|---|---|---|---|---|---|---|
| Un test d'adaptateur vit dans `IntegrationTest` et exerce le vrai client contre un serveur de substitution | tableau « Testing Strategy per Layer » (ligne Infrastructure) + « Doubles Policy » + « External Contract Mocks » | positif | couvrir **un seul** adaptateur déjà écrit, dans une solution où les deux projets de test existent et passent | **déterministe** : diff, fichiers, `dotnet build`, `dotnet test`, comptage des projets | pose le test dans le projet unitaire avec un transport HTTP bouchonné, parce que le constructeur accepte un `HttpClient` | pose le test dans `IntegrationTest` et exerce le vrai client | 1 |
| Un provider in-memory ne prouve pas l'adaptateur ; la lenteur se traite ailleurs qu'en affaiblissant le test d'infra | anti-pattern « In-memory fake DB provider used as Infrastructure test » + Doubles Policy | adversarial / forced-concept | un développeur exige explicitement la substitution pour gagner du temps | prompt | valide la substitution comme compromis pragmatique | refuse pour l'adaptateur, redirige la vitesse vers la couche Application | 2 |
| Le test d'architecture est une garde CI : il ne vit pas dans la suite que l'équipe lance à chaque sauvegarde | ligne interdite « Architecture scanner test in UnitTest » + tableau d'organisation des projets | positif / lifecycle | faire échouer le build sur une violation de couche, sans ralentir la boucle courte | prompt | pose la règle dans le projet unitaire (« elle est rapide, elle n'a pas d'I/O ») ou invente un troisième projet | pose la règle dans `IntegrationTest` et garde deux projets | 3 |
| L'Iron Rule ne supprime pas les tests Domain légitimes | « Extract a Domain test ONLY when… complex invariants… AND extracted » | **garde-fou de régression** | une règle extraite à ~40 cas, partagée par trois use cases | prompt | déjà correct | doit rester au moins aussi bon | garde |
| Rien à placer : la position du test est déjà réglée, seul reste le cycle | frontière déclarée « REQUIRED SUB-SKILL: outside-in-tdd » | **non-activation** | test déjà écrit, déjà rouge, à la bonne frontière | prompt | — | la skill doit rester silencieuse | garde |

---

## 4. Classement et ce qui a été coupé

Retenus : **3 décideurs + 1 garde-fou + 1 near miss = 5 stimuli**, conforme à l'étape 4 de
`create-skraft-eval` (« trois ou quatre candidats qui décident le verdict, plus le near miss
obligatoire et tout garde-fou »).

**Écartés, avec la raison :**

| Candidat | Raison du rejet |
|---|---|
| Nommage des dossiers de test (`STORY-42/` → `EligibilityCheck/`) | décision quasi gratuite ; la baseline suit la proposition du développeur dans un sens comme dans l'autre. Faible discrimination pour un stimulus payé deux fois |
| Mocker un agrégat du domaine | même décision que S1 (double par rôle) sans surface de preuve supplémentaire |
| « Combien de projets de test pour ce nouveau contexte ? » | question de connaissance générale posée en quiz ; S1 et S3 prouvent déjà la même règle, dont S1 de façon déterministe |
| Booter l'app host pour tester un handler | duplique S1 en moins net |
| Couvrir **aussi** le use case dans S1 | l'adaptateur seul force déjà la décision ; ajouter le use case double les tours d'agent sans ajouter de signal |
| Scénario bout-en-bout « ajoute la fonctionnalité paiement avec ses tests » | ~25 tours d'agent par essai, dans **deux** bras, pour trancher exactement la même décision |

**Réduction de coût explicite (règle 6).** S1 aurait pu demander « ajoute l'adaptateur de
paiement et sa couverture » : il ne demande que de couvrir **un adaptateur déjà écrit et déjà
compilant**. La décision mesurée est identique ; le coût par essai chute d'un ordre de grandeur,
et aucun conteneur Docker n'entre dans la boucle.

---

## 5. Les cinq stimuli

### S1 — Couvrir l'adaptateur HTTP déjà écrit *(décideur, déterministe)*

- **Intention du prompt** : l'adaptateur qui appelle le fournisseur de paiement n'est couvert par
  rien ; il faut qu'il le soit, et que la couverture prouve qu'il parle correctement au
  fournisseur.
- **Résultat attendu** : le test atterrit dans `PaymentAuthorization.IntegrationTest`,
  `PaymentAuthorization.UnitTest` ne reçoit aucun nouveau test, il y a toujours exactement deux
  projets de test, la solution compile et tout est vert.
- **Baseline vs traitement** : le constructeur de l'adaptateur accepte un `HttpClient` — appât
  délibéré. La baseline saisit presque toujours cet appât : elle bouchonne le transport et pose
  le test dans le projet unitaire, qui est plus rapide et déjà là. Le traitement suit la ligne
  Infrastructure du tableau : projet d'intégration, vrai client, serveur de substitution.
- **Activation** : requise.
- **Surface de preuve** : déterministe en premier. `diff-contains` (test créé côté intégration),
  `diff-not-contains` (rien de nouveau côté unitaire), `run-command` × 3 (build sentinelle,
  `dotnet test` vert, comptage des projets), plus un grader `prompt` pour le jugement résiduel —
  « le vrai client est exercé, pas remplacé » — qu'aucune commande ne prouve honnêtement.
- **Fixture** : nécessaire (§6).
- **Neutralité** : le prompt ne nomme ni projet, ni couche, ni librairie, ni type de double, ni
  commande, ni fichier. Il énonce le résultat observable voulu.
- **Anti-vacuité** : le test ajouté doit être **vert** sous `dotnet test`, et la solution doit
  encore compiler. Un test creux passe ces deux gardes ; c'est la rubrique et le placement
  déterministe qui portent le reste du jugement. Ce plan ne prétend pas prouver
  déterministiquement la profondeur du test — voir §12, correction n° 2.

### S2 — Remplacer le moteur réel par un provider in-memory *(décideur, forced-concept)*

- **Concept forcé** : le développeur exige explicitement le passage des tests de dépôt sur un
  provider de base de données in-memory.
- **Pourquoi c'est nuisible ici** : la skill l'interdit nommément — un provider in-process
  accepte silencieusement du SQL invalide, donc le test cesse de prouver ce que l'adaptateur
  était censé prouver. La lenteur est un vrai problème, mais elle se traite en déplaçant le
  feedback rapide vers la couche Application, pas en affaiblissant le test d'infrastructure.
- **Évidence qui doit gouverner la résistance** : ligne « In-memory fake DB provider used as
  Infrastructure test » de la table des anti-patterns, et ligne « Real container … Never for :
  Application or Domain tests » de la Doubles Policy.
- **Pourquoi nommer le concept est nécessaire** : sans la demande explicite il n'y a pas de
  pression à évaluer. C'est exactement le cas d'exception prévu par `prompt-neutrality.md`.
- **Baseline vs traitement** : la baseline valide généralement la substitution (« compromis
  pragmatique », « acceptable dans la majorité des cas »). Le traitement refuse pour les tests
  d'adaptateur et redirige la plainte de vitesse.
- **Ni obéissance ni refus réflexes** : la rubrique note la **redirection du problème de
  vitesse**, pas la véhémence du refus. Une réponse qui refuse sans rien proposer ne marque pas.
- **Activation** : requise. **Surface de preuve** : prompt — la décision est un jugement sur une
  proposition, aucun artefact ne la prouve.

### S3 — Faire respecter la frontière de couches sans ralentir la boucle courte *(décideur)*

- **Intention** : les violations de couche passent en revue de code ; le build doit les arrêter,
  et la suite lancée à chaque sauvegarde ne doit pas s'alourdir.
- **Résultat attendu** : la règle est installée comme garde de CI dans le projet d'intégration,
  la suite rapide reste intacte, et aucun troisième projet de test n'apparaît.
- **Baseline vs traitement** : la baseline place la règle dans le projet unitaire — c'est
  l'intuition dominante, un scan d'assemblage est rapide et sans I/O — ou crée un projet dédié.
  Le traitement applique la ligne explicite : garde CI, donc projet d'intégration, et deux
  projets, pas trois.
- **Activation** : requise. **Surface de preuve** : prompt. Rendre ce stimulus exécutable a été
  envisagé puis écarté — voir §12, correction n° 1.

### S4 — Garde-fou de régression : la règle extraite qui mérite son test

- **Tranche que la baseline traite déjà bien** : quarante cas de validation IBAN, règle extraite,
  partagée par trois use cases. La baseline propose spontanément un test dédié à la règle : c'est
  la bonne réponse.
- **Résultat attendu : une égalité, pas une victoire.** Ce stimulus est le seul instrument
  capable de détecter que la skill dégrade une tranche qui fonctionnait. Une sur-application de
  l'Iron Rule (« jamais de test Domain ») ferait perdre le bras traité, et **cette perte serait
  le résultat** — elle primerait sur une victoire ailleurs.
- **Exempté du classement par discrimination**, conformément à la règle 8.
- **Activation** : requise (la description de la skill couvre explicitement « whether a value
  object or a constructor is worth a test of its own »).

### S5 — Near miss de non-activation : la position du test est déjà réglée

- **Frontière visée** : `outside-in-tdd`, sous-skill déclarée par la cible elle-même.
- **Pourquoi c'est un near miss sérieux** : le prompt partage tous les noms déclencheurs (test,
  frontière, use case, couche) mais ne pose aucune question de placement — le test est écrit, il
  est rouge, il est au bon endroit. Ce qui reste est le cycle, qui appartient à la voisine.
- **Activation** : `disallowed: clean-architecture-testing`, `tags.intent: non-activation`.
- **Ce que ce stimulus mesure** : que la simple présence de la skill ne dégrade pas une tâche
  qu'elle ne possède pas.

---

## 6. Fixture : `fixtures/payment/` (S1 uniquement)

Choix **C#/.NET**, conforme à la règle 18 — aucune exception JavaScript à justifier.

```
PaymentAuthorization.slnx
Directory.Build.props            # Nullable, ImplicitUsings, TreatWarningsAsErrors
Directory.Packages.props         # xunit, Microsoft.NET.Test.Sdk, xunit.runner.visualstudio
src/PaymentAuthorization.Domain/          Money.cs, AuthorizationOutcome.cs
src/PaymentAuthorization.Application/     AuthorizePayment.cs, IPaymentGateway.cs
src/PaymentAuthorization.Infrastructure/  HttpPaymentGateway.cs
tests/PaymentAuthorization.UnitTest/         AuthorizePayment/AuthorizePaymentTests.cs
tests/PaymentAuthorization.IntegrationTest/  README-less, un seul test existant sur le domaine d'infra
```

**Checklist de préparation (règle 19 + `executable-fixtures.md`) :**

- [x] `Domain` ne référence rien ; `Application` → `Domain` ; `Infrastructure` → `Application`
      (elle implémente le port sortant qui y est déclaré). Chaque projet de test entre par la
      frontière qu'il possède.
- [x] Aucune dépendance tierce nouvelle nécessaire : un serveur de substitution s'écrit avec
      `System.Net.HttpListener`, présent dans le runtime. Rien dans le prompt ne l'impose : si
      l'agent préfère une librairie, le réseau du bac à sable le permet et aucun grader ne le
      pénalise.
- [x] Aucun conteneur, aucun Docker.
- [x] **Appât délibéré** : `HttpPaymentGateway` reçoit son `HttpClient` par constructeur. Le
      raccourci « bouchonner le transport dans le projet unitaire » est donc facile, naturel, et
      c'est exactement l'erreur que le stimulus doit pouvoir observer.
- [x] État de départ **VERT** : les deux projets compilent et passent. L'agent ajoute une
      couverture manquante, il ne répare pas un dégât.
- [x] Les deux projets de test existent déjà : le stimulus mesure *où l'on pose le nouveau test*,
      jamais *comment on organise un dépôt vierge*.
- [x] `git init` + commit initial en setup, pour que les graders de diff distinguent ce que
      l'agent a réellement ajouté.
- [x] **Sentinelle d'infrastructure de build** : `dotnet build PaymentAuthorization.slnx` doit
      encore réussir. Un agent qui casse le `.slnx` ou un `.csproj` apparaît alors comme une
      panne de harnais, jamais comme une perte architecturale silencieuse.
- [x] **Sentinelle de structure** : le nombre de répertoires directement sous `tests/` doit
      rester à deux.
- [x] Aucun test de la fixture ne lit, ne parse ni n'assertionne la spec d'éval (règle 11).
- [x] Toutes les commandes de setup et de grading sont bornées par un timeout.

---

## 7. Budget et puissance statistique

```
coût = 2 bras × 5 stimuli × 4 runs × tokens-par-essai + travail du juge
     = 40 essais d'agent + 20 comparaisons jugées
```

| Poste | Valeur |
|---|---|
| Stimuli | 5 |
| `defaults.runs` | 4 |
| Essais par bras | 20 |
| Essais totaux (2 bras) | 40 |
| Taux d'égalité supposé | ~40 % — le garde-fou (4 essais) et le near miss (4 essais) sont attendus à égalité par construction |
| Paires discordantes attendues | ~10 à 12, issues des 12 essais des trois décideurs |
| Plancher requis | 6 (`eng/lib/verdict.mjs`, test des signes bilatéral, α = 0,05) |

Marge suffisante : sous 6 paires discordantes, le verdict serait déclaré *underpowered* quel que
soit le score. La puissance s'achète **avant** le tirage, jamais après — rajouter des runs sur une
comparaison déjà bruitée est le pire achat du protocole.

`defaults.timeout: 4m`, et `constraints.max_duration: 8m` sur S1 seul — le seul stimulus qui
compile et exécute du code.

---

## 8. Dépense étagée (règle 13)

| Étape | Contenu | Ce qu'on vérifie | Approbation |
|---|---|---|---|
| **A — validation du harnais** | 1 essai sur **S1**, le stimulus le plus large et le seul destructeur du portfolio | la sentinelle a tenu, le `.slnx` a survécu, chaque échec de grader a une cause architecturale et non un problème d'outillage | séparée |
| **B — pilote de signal** | `STIMULI="adapter" PILOT_RUNS=4`, écrit dans `eval-results-pilot/` | le traitement bouge-t-il quelque chose, dans une direction lisible | séparée |
| **C — bras complet** | portfolio entier, profondeur planifiée, `eval-results/` | verdict | séparée |

Le harnais est validé sur S1 *parce que* c'est le stimulus qui peut casser quelque chose : un
harnais validé sur un stimulus bien élevé n'est pas validé.

`BASELINE_CACHE` **n'est pas utilisé**. Aucun résultat servi depuis un cache n'est publiable.

Authentification : le runner exige un token GitHub habilité Copilot
(`COPILOT_GITHUB_TOKEN`, ou un `gh auth login` déjà en place). Aucun secret n'est demandé en clair.

---

## 9. Fichiers à créer ou modifier

| Action | Chemin |
|---|---|
| créer | `tests/skills/clean-architecture-testing/eval.yaml` |
| créer | `tests/skills/clean-architecture-testing/PLAN.md` *(ce document)* |
| créer | `tests/skills/clean-architecture-testing/fixtures/payment/**` |
| ne pas modifier | `eng/vally-adapter/skip-evals.txt` — une skill nouvellement évaluée ne naît pas dans la liste des sautées |

**Rien d'autre.** En particulier : aucune modification de la skill cible, aucun test unitaire ou
d'acceptation sur la spec d'éval (interdit par `AGENTS.md` et par la règle 11), aucune retouche du
runner, aucun résultat généré commité.

---

## 10. Validations statiques prévues (sans appel modèle)

1. Chargement de la spec par l'API Vally installée — parseabilité et schéma.
2. Le répertoire d'éval résout bien vers la skill livrée.
3. Chaque `rubric` est frère de `graders`, jamais imbriqué sous `graders[].config` — sinon Vally
   retombe silencieusement sur sa rubrique par défaut et l'éval mesure la qualité de la prose.
4. Chaque stimulus porte un grader `skill-invocation` : `required` sur les positifs, `disallowed`
   sur le near miss.
5. Aucun `scoring.weights` dans la spec — le bras baseline tourne avec un répertoire de skills
   vide et échoue par construction le grader d'activation ; `paired-trials.mjs` le retire du
   score, et des poids casseraient cette arithmétique.
6. Chaque grader `prompt` déclare `scoring: scale_1_10`.
7. Scan phrase par phrase des prompts : aucune fuite de HOW, aucun nom de la skill, aucune
   formulation recopiée de son corps.
8. Build local de la fixture, exécution des deux projets de test, confirmation de l'état VERT
   attendu, et vérification que la commande de comptage de projets répond bien `2`.
9. `npm run ci:local` — les gardes déterministes du dépôt.

Ces vérifications sont **statiques**. Une spec qui parse n'est pas une preuve que la skill
améliore quoi que ce soit.

---

## 11. Question d'approbation

Le portfolio ci-dessus et la liste de fichiers du §9 sont-ils approuvés pour écriture ? La
dépense modèle du §8 fait l'objet d'une approbation distincte, étape par étape.

---

## 12. Revue du plan — ce que la version 1 avait faux

Relecture de la version 1 contre les checklists de `create-skraft-eval` et la table de
`common-pitfalls.md`. Trois défauts structurels, deux ajustements.

### Correction n° 1 — le stimulus exécutable de la v1 était invérifiable

La v1 faisait de « installer une règle d'architecture » le stimulus déterministe, avec pour
graders le placement du fichier plus un `dotnet test` vert. Défaut : **un test d'architecture
creux passe ces graders**. C'est exactement le piège « Green visible test can be hardcoded », qui
exige une sonde indépendante.

Sonde envisagée : introduire une violation de couche pendant le grading et vérifier que la règle
la rattrape. **Impossible ici, et pas par manque d'effort** : dans une solution correctement
stratifiée, toute référence d'une couche interne vers une couche externe est *circulaire*, et
`dotnet` la refuse au restore. Il n'existe donc aucune violation injectable dans une fixture à
trois projets. La sonde aurait exigé un quatrième projet hors de la chaîne — c'est-à-dire une
fixture construite pour l'instrument plutôt que pour le comportement.

**Décision** : la règle d'architecture redevient un stimulus de jugement (S3), et le stimulus
déterministe passe sur la couverture d'un adaptateur (S1), où « le test est-il vrai » est prouvé
par le fait qu'il doit être **vert contre le vrai adaptateur**, pas par une assertion sur son
contenu.

### Correction n° 2 — une contrainte de prompt qui contredisait la skill évaluée

La v1 annonçait dans le prompt « sans ajouter de dépendance tierce », pour retirer le choix de
librairie et isoler la décision de placement. Or `references/architecture-rules.md` **recommande
NetArchTest** : le bras traité aurait suivi sa propre référence et se serait fait pénaliser par
une contrainte inventée par l'évaluateur. L'instrument aurait mesuré l'obéissance au prompt, pas
la valeur de la skill.

**Décision** : contrainte supprimée. La nouvelle fixture n'en a plus besoin — `HttpListener` suffit
sans rien installer, et rien n'interdit à l'agent de faire autrement.

### Correction n° 3 — S1 et S3 de la v1 se recouvraient

La v1 avait un S3 « quel double pour le use case et pour l'adaptateur » qui tranchait la même
décision que le S1 déterministe, sur la même dépendance externe. Piège « duplicate another
scenario's outcome » : deux stimuli payés deux fois chacun pour un seul résultat.

**Décision** : S3 devient le placement de la garde d'architecture — même famille de règle
(organisation des projets de test), décision distincte, mode d'échec baseline distinct.

### Ajustement n° 4 — `max_duration` de S1

Relevé de 6 à 8 minutes. Un `dotnet restore` à froid dans un espace de travail neuf consomme à lui
seul une part non négligeable du budget ; une expiration sur le restore se lirait comme une perte
architecturale alors que ce serait une panne de harnais.

### Ajustement n° 5 — ce que la rubrique de S2 ne doit pas noter

`prompt-neutrality.md` interdit de récompenser le refus réflexe autant que l'obéissance réflexe.
La rubrique v1 se contentait de vérifier le refus de la substitution. Elle exige désormais que la
plainte de vitesse — qui est légitime — soit **redirigée** ailleurs. Un refus sec ne marque pas.

### Points revérifiés et laissés inchangés

- Ratio de surfaces de preuve : 1 stimulus déterministe sur 5. La règle 17 interdit de faire de
  *chaque* scénario un grader `prompt` ; elle n'exige pas une proportion. Les quatre autres
  décisions sont des jugements sur une proposition, qu'aucun artefact ne prouve honnêtement.
- Budget : inchangé à 5 × 4. Les trois décideurs fournissent seuls la puissance ; le garde-fou et
  le near miss sont attendus à égalité et n'y contribuent pas.
- Le garde-fou survit au classement par discrimination, comme l'exige la règle 8.

---

## 13. État d'exécution — mesure live non réalisée

L'instrument est écrit, gelé et validé statiquement. **Aucune mesure live n'a été
produite.** L'étape A a été tentée quatre fois ; les trois premiers échecs étaient des pannes
d'outillage, corrigées et vérifiées (commit `fix(evals)`), le quatrième est un blocage
d'environnement.

| Tentative | Échec | Nature | Suite |
|---|---|---|---|
| 1 | `Could not resolve a @github/copilot platform package (tried @github/copilot-darwin-arm64)` | outillage | `@github/copilot-darwin-arm64@1.0.81` a supprimé l'export `./sdk` attendu par `@github/copilot-sdk@1.0.9` → épinglage à 1.0.78 |
| 2 | `/Users/a239hz/OneDrive: No such file or directory` | outillage | `$VALLY` non quoté dans le runner → tableau bash |
| 3 | idem 1, réapparu | outillage | `npm install --no-save` avait élagué le paquet épinglé ; réinstallé avec le CLI |
| 4 | `ProxyResponseError: HTTP 403 response does not appear to originate from GitHub` | **environnement** | non contournable depuis cette machine |

Diagnostic du blocage n° 4 : `GET https://api.github.com/copilot_internal/v2/token` avec le token
`gh` actif renvoie une page 403 anti-scraping. Le compte actif (`fdescamps`) n'a pas
d'habilitation Copilot sur ce chemin, et le compte Copilot d'entreprise
(`francois-descamps_axaghcop`) est en échec d'authentification dans le trousseau
(`gh auth status` : *Failed to log in*).

**Pour débloquer**, au choix :

1. `gh auth login` sur le compte habilité Copilot, puis
   `VALLY=./node_modules/.bin/vally ./eng/run-vally-evals.sh clean-architecture-testing` ;
2. exporter `COPILOT_GITHUB_TOKEN` (PAT fine-grained avec *Copilot Requests*) ;
3. lancer la mesure côté CI. Le job `evaluate-pr` de `.github/workflows/skill-evaluation.yml`
   couvre déjà `tests/skills/**`, mais il est **désactivé sur les PR issues d'un fork**
   (`head.repo.full_name == github.repository`). Un mainteneur doit donc la déclencher via
   `workflow_dispatch` avec `skill: clean-architecture-testing`, ou rejouer la branche depuis
   le dépôt amont.

Les étapes A, B et C du §8 restent donc **à dérouler**, dans cet ordre et avec leurs
approbations séparées. Rien de ce qui figure ici ne doit être lu comme un verdict.

---

## 14. Correction des fixtures `outside-in-tdd`

Les cinq fixtures de `tests/skills/outside-in-tdd/fixtures/` livraient
`CleanArchitectureDependencyTests.cs` dans `tests/CheckoutPricing.UnitTests/Architecture/`. Le
dépôt enseignait donc, par l'exemple, la combinaison que la skill ici évaluée interdit
explicitement : un scanner d'architecture dans la suite que l'équipe lance à chaque sauvegarde.

**Ce qui a été fait**, dans les cinq fixtures :

1. `CleanArchitectureDependencyTests.cs` déplacé vers
   `tests/CheckoutPricing.IntegrationTests/Architecture/`, namespace suivi ;
2. création de `tests/CheckoutPricing.IntegrationTests/CheckoutPricing.IntegrationTests.csproj`,
   **sans `coverlet.msbuild`** — la porte de couverture à 100 % est mesurée sur la suite rapide,
   et un second collecteur écrivant sur la même sortie la déplacerait ;
3. le projet est déclaré dans `CheckoutPricing.slnx` sous le dossier `/tests/` ;
4. dans `outside-in-tdd/eval.yaml` : les entrées `environment.files` montent désormais le csproj
   d'intégration et le test à son nouvel emplacement, et les trois graders
   « Clean Architecture dependency tests are GREEN » ciblent le projet qui possède la règle.

**Ce qui n'a délibérément pas changé :**

- Les patterns `(?!Architecture/|bin/|obj/)` des graders de diff sur `UnitTests` sont conservés.
  L'exclusion est désormais sans objet puisque plus rien n'est monté là, mais la retirer
  rendrait ces graders satisfiables par un agent qui recréerait un dossier `Architecture/` dans
  le projet rapide — c'est-à-dire par le placement que cette correction vient d'éliminer.
- Le nommage pluriel `UnitTests` / `IntegrationTests` de cette famille de fixtures est conservé.
  La skill écrit `<Context>.UnitTest` / `<Context>.IntegrationTest` au singulier ; renommer
  aurait touché des dizaines de références de graders pour un écart cosmétique, sans rapport avec
  la règle enfreinte.

**Vérifications** (les cinq fixtures, localement) :

| Fixture | Build | Porte d'archi depuis `IntegrationTests` | `dotnet test` sur la solution |
|---|---|---|---|
| `approved-discount-red` | OK | GREEN | 0 — inchangé |
| `approved-gold-discount-missing` | OK | GREEN | 0 — inchangé |
| `discount-fixture-theater` | OK | GREEN | 0 — inchangé |
| `green-checkout-tests` | OK | GREEN | 0 — inchangé |
| `placeholder-red-evidence` | OK | GREEN | 1 — **état RED voulu, préservé** |

Deux fixtures (`approved-discount-red`, `approved-gold-discount-missing`) n'avaient que le test
d'architecture dans `UnitTests` : ce projet démarre donc maintenant sans aucun test, ce qui est
l'état correct pour un squelette où l'agent doit écrire le premier test rouge. Vérifié : un
projet de test sans test n'échoue pas la solution, il émet un avertissement et sort en 0.

La commande de couverture des graders — `dotnet test … /p:Threshold=100
/p:Include=[CheckoutPricing.Domain]*%2c[CheckoutPricing.Application]*` — a été rejouée sur
`green-checkout-tests` : sortie 0, couverture toujours calculée depuis `UnitTests` seul.

`vally lint --eval-spec … --strict` passe sur `outside-in-tdd/eval.yaml` après modification.

> **Portée de la mesure.** Ce déplacement change l'environnement de départ de plusieurs stimuli
> de `outside-in-tdd`. Son verdict publié a été obtenu sur l'ancienne fixture ; il faudra le
> rejouer avant de comparer un futur résultat à celui-là.

## 15. Extension Spring Boot — J1 à J3

Tranche 0 du support Java/Spring Boot : vérifier, avant d'écrire la moindre skill Java, si la
skill agnostique suffit déjà sur un build Maven multi-module, et si Sonnet 5 sans skill ne gère
pas déjà ces décisions.

### Sondes préalables (indicatives, pas un verdict)

Sous-agents Sonnet 5, fixture `payment-spring`, 1–2 runs par cellule, contexte
de harness non isolé (instructions du dépôt visibles). Signal de direction uniquement.

| Sonde | Sans skill | Avec `clean-architecture-testing` |
|---|---|---|
| Couvrir l'adaptateur HTTP | 2/2 bon module ; 1/2 `MockRestServiceServer` (transport simulé in-process) | 2/2 WireMock, vrai HTTP |
| Adaptateur JPA (piège H2) | 2/2 Testcontainers Postgres + `Replace.NONE` | 1/1 idem |
| Garde de couches | 1/1 **troisième module** `payment-architecture-test` (Failsafe) | 1/1 ArchUnit dans `payment-integration-test` |
| Gate de mutation (100 % cœur / 80 % adaptateurs) | 2/2 PIT cross-module correct, gate réel | non sondé |

Lecture : l'outillage Java/Spring est maîtrisé sans skill. L'écart porte sur la politique — deux
modules de test, serveur de substitution plutôt que transport simulé — et la skill agnostique le
corrige déjà. Aucune skill Java de placement n'est écrite tant que Vally ne montre pas de trou.
La sonde mutation relève de la future `quality-gates-java`, pas de cette skill : coupée ici.

### Stimuli

| # | Stimulus | Classe | Preuve | Hypothèse |
|---|---|---|---|---|
| J1 | `Spring Boot: the Maven build rejects a layer leak, the save loop stays fast` | décideur | déterministe : sentinelle `mvn -o validate`, `verify` vert, suite rapide verte seule, exactement deux `src/test`, diff dans `payment-integration-test/src/test/`, rien dans `payment-unit-test/src/`, **sonde de fuite** (copie jetable, `spring-web` + `RestClient` injectés dans `payment-application`, `verify` doit échouer) ; rubrique | victoire traitement (sonde P3) |
| J2 | `Spring Boot: first tests for the REST payment adapter` | décideur | déterministe : sentinelle, `verify` vert, deux `src/test`, diff dans le module lent, production intacte, **sonde refus** (402 → 409 doit casser un test), **sonde requête** (champ JSON `reference` → `ref` doit casser un test) ; rubrique pour le vrai fil HTTP | victoire partielle (sonde P1) |
| J3 | `Spring Boot: test the JPA order repository adapter` | garde-fou de régression | rubrique | **égalité attendue** ; une défaite est le constat (sonde P2) |

Le near miss S5 couvre la non-activation pour tout le spec. Le S2 .NET (forced-concept
in-memory) n'est pas rejoué en Java : P2 montre que la base choisit déjà le vrai moteur, J3 garde
cette tranche. Les noms ne partagent aucun fragment avec les stimuli .NET : `STIMULI` est
insensible à la casse, et `STIMULI="Spring Boot:"` isole le bloc Java.

### Fixture `fixtures/payment-spring/`

Exception assumée à la règle « C# d'abord » : le comportement évalué est propre à Maven/Spring
(module par préoccupation, suites Failsafe, mocks de transport Spring).

- Spring Boot 3.5.14, Java 21, Maven multi-module, un sous-projet par couche :
  `payment-domain` (aucune dépendance), `payment-application` (→ domain),
  `payment-infrastructure` (→ application, `spring-web`, Jackson),
  `payment-app` (racine de composition `@SpringBootApplication`).
- Deux sous-projets de test existants et verts : `payment-unit-test` (cas d'usage, stubs
  écrits à la main) et `payment-integration-test` (adaptateur fichier réel).
- Piège J2 : `HttpPaymentGateway` reçoit son `RestClient` par constructeur.
- Aucun Docker requis. Setup : `mvn -B -q -ntp verify` en ligne (réchauffe `~/.m2`), puis graders
  hors ligne (`-o`) et bornés.
- Stockage à plat, `<module>/<fichier>` : l'arborescence Maven (`src/main/java/com/example/…`)
  dépasse le budget de 145 caractères des chemins suivis (installation marketplace sous Windows).
  Les `dest:` de `eval.yaml` la reconstruisent ; la fixture ne se construit donc qu'une fois
  mise en place, jamais dans le dépôt.

### Budget

`defaults.runs` vaut 4 pour tout le spec (§7) : 3 × 4 = **12 essais Java par bras**, 32 avec le
bloc .NET. Écart assumé avec les 5 runs proposés : changer `defaults.runs` déplacerait aussi le
budget .NET. Avec ~50 % d'égalités, le bloc Java seul vise 4–6 paires discordantes, sous le
seuil de 6 : son verdict se lit poolé avec le .NET.

### Dépense étagée

1. **A — harnais** : 1 essai de J2 (le plus destructeur : edits de pom, dépendances, transport).
   `STIMULI="Spring Boot: first tests" PILOT_RUNS=1 eng/run-vally-evals.sh clean-architecture-testing`
2. **B — pilote** : J1, 4 runs.
   `STIMULI="Spring Boot: the Maven build" PILOT_RUNS=4 eng/run-vally-evals.sh clean-architecture-testing`
3. **C — bras complet** : tout le spec, après un pilote qui montre une direction.

Prérequis : JDK 21+ et Maven 3.9 sur la machine qui exécute. Le workflow CI d'évaluation n'installe
pas Java : suivi séparé.

### Validations statiques réalisées

- `vally lint --eval-spec … --strict` : valide ; `loadEvalSpec` : 8 stimuli, rubriques à côté des
  graders, `skill-invocation` partout, `scale_1_10`, aucun `scoring.weights`, 20 chemins de
  fixture présents, destinations sûres.
- Fixture : `mvn -B verify` vert (2 tests unitaires, 1 d'intégration).
- Rejeu des graders déterministes : fixture intacte → J1 échoue placement + sonde de fuite, J2
  échoue placement + deux sondes ; P3-t1 passe tout J1 ; P3-b1 échoue exactement les deux graders
  structurels ; les quatre espaces P1 passent tout J2 déterministe — seul le juge sépare P1-b2.

### Limites connues

- J2 : le « vrai fil HTTP » n'est jugé que par la rubrique.
- Essais parallèles sur un `~/.m2` partagé ; les graders construisent en réacteur (`-am`), jamais
  depuis un artefact installé par un autre essai.
- Les modifications non commitées de `references/architecture-rules.md` et `examples-dotnet.md`
  présentes dans l'arbre de travail changent le bras traitement : à trancher avant toute mesure.

### Étape A — harnais validé (2026-09-28)

1 essai de J2, deux bras. Harnais sain : sentinelle tenue, poms intacts, les 8 graders déterministes
passent dans les deux bras, `skill-invocation` chargée côté traitement seulement, ~2,5–3 min par
bras. Sortie dans `eval-results-pilot/`, jamais un verdict.

Deux défauts d'instrument trouvés et corrigés avant toute mesure :

- Les ancres YAML `&spring-fixture-*` ne survivaient pas à `make-pilot-spec.mjs`, qui extrait les
  blocs de stimulus comme texte : liste de fixture et setup écrits en toutes lettres dans J1 et J2.
- La défaite du seul essai (juge 6,7 contre 8,9) venait entièrement de l'item « couvre un
  changement de forme de la réponse », que la skill n'enseigne pas : bruit hors skill. Remplacé
  par « entre par l'adaptateur et vérifie ce qui passe sur le fil, sans démarrer l'application ».

Observation : la base a cette fois choisi un vrai serveur HTTP (WireMock). J2 risque de produire
surtout des égalités ; J1 reste le décideur attendu.

### Étape B — pilote J1 (2026-09-28, 4 runs, non publiable)

Premier passage perdu : le bras traitement a échoué 4/4 à l'authentification (panne réseau,
`api.github.com/copilot_internal/user`). Rejoué avec `BASELINE_CACHE=1` sur cache vide : bras de
base frais, résultat marqué `publishable: false`.

| Grader | Base | Traitement |
|---|---|---|
| Tests toujours à deux endroits | 0/4 | 4/4 |
| Garde dans la suite lente | 0/4 | 4/4 |
| Fuite injectée rejetée par le build | 2/4 | 3/4 |
| Skill chargée | 0/4 | 4/4 |

Juge : 4 victoires / 0 égalité / 0 défaite, écart moyen +0,55 [IC 95 % +0,07 ; +1,03]. Direction
nette. La base crée un module `payment-architecture-test` à chaque essai (4/4). La sonde de fuite
sépare garde complète et garde partielle : l'échec traitement bannit Spring dans `domain..`
seulement, pas dans `application..`.

Mesuré avec l'arbre de travail de l'époque : références `architecture-rules.md` /
`examples-dotnet.md` / `pattern-catalog.md` non commitées, remplacées depuis (ci-dessous). L'étape C
doit tourner sur la version commitée.

### Règle de dépendance clarifiée (2026-09-28)

La règle porte sur les **références de projet**, pas sur les imports : Api → Infrastructure →
Application → Domain, une seule référence vers la couche voisine. Les types atteints par référence
transitive peuvent être importés (Domain dans Infrastructure, Application dans Api). La fixture
Spring était déjà conforme au niveau des `pom.xml` : aucune modification.

### Étape C, bloc Spring Boot (2026-09-28, 4 runs, pilote non publiable)

Skill commitée `b688e78`, bras frais des deux côtés. `STIMULI="Spring Boot:"`, 12 essais par bras.

Verdict poolé : **aucune amélioration crédible**. Graders 5V/5E/2D (signe p = 0,45), juge 3V/3E/6D
(moyenne −0,10, IC 95 % [−0,32 ; +0,12]). Cellules par stimulus : descriptives uniquement.

| Stimulus | Graders | Lecture |
|---|---|---|
| J1 garde de couches | 4V | Placement : base 0/4, traitement 4/4. Fuite injectée rejetée : base **4/4**, traitement **1/4**. |
| J2 adaptateur REST | 4E au plafond | Les deux bras utilisent un vrai serveur HTTP ; la base gère déjà ce cas. |
| J3 adaptateur JPA (garde) | 2E / 2D | Défaites de 1 point, causées par le juge (« espace vide, gabarit non vérifiable ») dans les deux bras ; les deux choisissent Postgres. Bruit d'instrument, pas une dégradation de la skill. |

Constat principal, J1 : trois gardes traitement sur quatre se limitent à
`layeredArchitecture().consideringOnlyDependenciesInLayers()` — dépendances entre couches internes
seulement, aucune interdiction de framework dans `domain..` / `application..`. La base interdit
Spring/Jackson ou restreint à `java..` dans 4/4. La skill enseigne où placer la garde, pas ce
qu'elle doit couvrir hors .NET : sa table de règles par type ne nomme que `Microsoft.*`, et la
règle de références de projet mise en tête depuis `b688e78` pousse vers une garde interne.
Tendance au pilote B (anciennes références) : 3/4 ; ici 1/4. n = 4, non attribuable avec certitude.

Suites, chacune dans une itération approuvée séparément :

- skill : règle agnostique en liste blanche (Domain et Application ne dépendent que d'eux-mêmes,
  des couches internes et de la bibliothèque standard) + exemple Java ;
- J2 : plafond atteint, à remplacer ou requalifier en garde-fou de régression ;
- J3 : le prompt « écris le test » sans dépôt fait noter la délivrabilité ; reformuler.

### Itération skill — liste blanche (`936f0f5`) et pilote J1 (2026-09-28, 4 runs, non publiable)

Skill : Domain et Application ne dépendent que d'eux-mêmes, des couches internes et du cœur du
langage (sans I/O, réseau, persistance) ; `references/examples-java.md` ajouté ; exemples .NET
passés de liste noire à liste blanche. Extraits Java et .NET exécutés avant commit : verts sur un
projet propre, rouges sur fuite framework, fuite I/O de la bibliothèque standard et référence de
projet sautant une couche.

| Grader | Base | Traitement |
|---|---|---|
| Tests toujours à deux endroits | 0/4 | 4/4 |
| Garde dans la suite lente | 0/4 | 4/4 |
| Fuite injectée rejetée par le build | 4/4 | **4/4** (1/4 à l'itération précédente) |
| Build entier vert | 4/4 | 3/4 → 4/4 après correction du grader |

Graders 4V/0E/0D (signe p = 0,125 : 4 paires discordantes, sous le seuil de 6). Juge 3V/0E/0D, une
comparaison du juge en erreur exclue. Direction nette, verdict impossible à cette taille.

Défaut d'instrument corrigé : l'échec « build entier vert » de l'essai traitement 0 était un
dépassement du tampon de sortie de Vally (1,2 Mo de traces journalisées par la garde ArchUnit,
tests verts). Rejoué sur le diff : vert. Les graders `mvn verify` / `mvn test` écrivent désormais
dans un fichier temporaire et n'affichent que les 40 dernières lignes en cas d'échec ; vérifié sur
un build vert bruyant (passe) et un build rouge (échoue, trace visible).

### Instrument avant l'étape C complète (2026-09-28)

- J2 requalifié **garde-fou de régression** (`role: regression-guard`) : la base a passé tous les
  graders déterministes à l'étape A et en 4/4 à l'étape C Spring. Égalité attendue ; une défaite
  signalerait une dégradation de la couverture d'adaptateur par la skill.
- J3 : le prompt demande l'approche de test plutôt que le fichier (« Before anyone writes it, tell
  me how that adapter should be tested. ») ; item de rubrique ajouté : l'absence de dépôt n'est pas
  un défaut. Toujours garde-fou, égalité attendue.
- Portefeuille : décideurs S1, S2, S3, J1 (16 essais) ; garde-fous S4, J2, J3 et near miss S5
  (16 essais, égalités attendues). 32 essais par bras, 8–12 paires discordantes visées.

### Étape C complète (2026-09-29, instrument `a43da8a`, skill `936f0f5`, bras frais, publiable)

Verdict : **comparaison incomplète** (2 essais en erreur, 4 paires exclues faute d'activation) —
ni réussite, ni régression. Graders 10V/11E/5D, 15 paires discordantes, signe p = 0,30 ;
Wilcoxon p = 0,019 ; juge 10V/14E/6D, moyenne +0,07 [IC 95 % −0,05 ; +0,20]. Cellules
descriptives uniquement.

| Stimulus | Rôle | Paires | Lecture |
|---|---|---|---|
| J1 Spring, garde de couches | décideur | 4V (0,71 → 0,99) | Placement et fuite injectée tenus 4/4 côté traitement ; la base crée un troisième module 4/4. |
| S2 .NET, moteur in-memory | décideur | 2V 2E | — |
| S3 .NET, garde de couches | décideur | 1V 1E(plancher) 2 erreurs | **Défaut d'instrument** : espace vide, « Set that up » ; les deux bras constatent le vide et demandent des précisions (juge 0). Deux essais traitement en délai dépassé (4 min). |
| S1 .NET, adaptateur HTTP | décideur | 4 exclues | **Skill jamais chargée (0/4)** alors que son jumeau Java J2, même prompt, la charge 4/4. Écarts juge 0,02–0,07 entre deux bras sans skill : bruit de référence. |
| J3 Spring, JPA | garde-fou | 2V 2E | Reformulation efficace : plus de pénalité « gabarit non vérifiable ». |
| J2 Spring, adaptateur REST | garde-fou | 3D (1,00 → 0,99) 1E | Graders déterministes identiques ; le juge retire un point sur l'item « suite rapide » en lisant le démarrage de WireMock comme un coût de boucle courte, alors que le test est dans le module lent dans les deux bras. Ambiguïté de rubrique, pas une dégradation. |
| S4 .NET, 40 cas IBAN | garde-fou | 3E(plafond) 1D | Une réponse traitement propose un faux pour la règle de validation dans les tests de cas d'usage — contraire à la skill (objets du domaine réels). Isolé. |
| S5 near miss | non-activation | 2E 1V 1D | Skill non chargée 4/4 comme attendu. |

Causes à traiter dans une itération approuvée séparément, sans achat de runs rétroactif :

1. S3 : espace vide pour une demande d'implémentation → demander l'approche (comme J3) ou monter
   la fixture .NET ; J1 couvre déjà la version exécutable.
2. S1 : écart d'activation → la `description` ne nomme pas le cas « adaptateur vers une API
   externe » ; à vérifier contre le near miss S5.
3. J2 : l'item « suite rapide » est déjà prouvé par les graders de diff ; le retirer de la rubrique.

### Itération après l'étape C (2026-09-29)

- S3 : la fixture .NET `payment-authorization` est désormais montée. Graders déterministes
  calqués sur J1 : build (sentinelle), suite verte, deux projets de test, garde dans
  IntegrationTest, rien dans UnitTest. La sonde de fuite injecte un `System.Net.Http.HttpClient`
  dans Application sur une copie jetable. Rejoué sur trois états : fixture intacte → placement et
  fuite en échec ; liste blanche NetArchTest dans IntegrationTest → tout vert ; troisième projet
  avec une liste noire limitée aux projets voisins → deux projets, placement et fuite en échec.
- S1 : la `description` de la skill nomme désormais la couverture d'un adaptateur vers une API
  externe, une base ou le système de fichiers (0/4 activations à l'étape C).
- S1 et J2 : le critère « suite rapide » est retiré de la rubrique ; les graders de diff le
  prouvent déjà, et le juge l'appliquait au démarrage de WireMock dans le module lent.
