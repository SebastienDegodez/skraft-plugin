# skraft-test-harness

> **Évaluer un agent Copilot de façon reproductible, sans dépendance à
> un juge humain.**

---

## Pourquoi ça existe ?

Le plugin `skraft` fournit des agents et des skills qui guident un
développeur vers des pratiques disciplinées (Outside-In TDD, Clean
Architecture, Object Calisthenics…). Mais comment savoir si un agent
*amélioré* est vraiment meilleur que l'agent de base ? Comment détecter
une régression silencieuse après une modification du prompt ?

`skraft-test-harness` répond à cette question en automatisant
l'évaluation : pour chaque scénario décrit dans un fichier `eval.yaml`,
il soumet le même prompt à deux versions de l'agent (**baseline** et
**with-skill**), compare les réponses via un juge, et produit un verdict
chiffré.

```
eval.yaml  ──▶  [harness]  ──▶  SkillVerdict  ──▶  rapport JSON / Markdown / JUnit
                                     │
                            ImprovementScore ∈ [-1, +1]
                            +1 = toujours meilleur avec le skill
                             0 = neutre
                            -1 = toujours moins bon avec le skill
```

---

## À qui ça s'adresse ?

| Persona | Usage |
|---|---|
| **Mainteneur du plugin** | Valide qu'un nouveau skill ou agent améliore réellement les réponses avant de le fusionner. |
| **Contributeur** | Détecte les régressions dans une PR en ajoutant/modifiant des scénarios. |
| **Adopteur du plugin** | Évalue si le plugin apporte une valeur mesurable dans son contexte (prompts personnalisés, équipe spécifique). |

---

## Concepts clés

### `eval.yaml` — la source de vérité

Chaque dossier `tests/skraft-plugin/<agent-id>/` contient un `eval.yaml`
qui décrit les **scénarios** à évaluer. Un scénario = un prompt + des
assertions sur la réponse attendue.

```yaml
scenarios:
  - name: "Routes outside-in TDD"
    prompt: "How do I implement a new feature?"
    assertions:
      - output_contains: "outside-in"
      - output_matches: "(?i)acceptance\\s+test"
      - output_not_contains: "skip tests"
```

Le fichier est la seule chose à écrire pour ajouter un cas de test. Le
harness gère tout le reste.

### `SkillVerdict` — le résultat d'une évaluation

Pour chaque scénario, le harness produit un `ScenarioVerdict`
(WithSkill / Baseline / Tie). L'ensemble forme un `SkillVerdict`
accompagné d'un `ImprovementScore`.

### `ImprovementScore` — la métrique centrale

```
ImprovementScore = (victoires WithSkill − victoires Baseline) / total
```

Un score positif signifie que le skill améliore les réponses. Un score
négatif signale une régression. La plage `[-1, +1]` permet de fixer des
seuils dans un pipeline CI (`ralph --threshold 0.5`).

### `ralph` — la boucle de stabilité

La commande `ralph` exécute l'évaluation N fois et consolide les
résultats. Elle détecte l'**instabilité** : un skill dont le score varie
fortement entre les passes est fragile (overfitting ou sensibilité aux
variations stochastiques du modèle).

```bash
skraft-test-harness ralph \
  --skill software-engineer \
  --tests-dir tests/skraft-plugin/software-engineer-agent \
  --runs 5 \
  --threshold 0.4
```

---

## Comment ça s'intègre dans skraft ?

```
plugins/
  agents/software-engineer.agent.md   ← l'agent à évaluer
  skills/outside-in-tdd/SKILL.md      ← le skill injecté

tests/
  skraft-plugin/
    software-engineer-agent/
      eval.yaml                        ← scénarios d'évaluation

tools/
  skraft-test-harness/                 ← le harness (ce projet)

.github/workflows/
  skraft-test-harness.yml              ← CI : évaluation automatique sur PR
```

Le harness **ne teste pas le code du plugin** (pas de tests unitaires
des fichiers `.md`). Il teste le **comportement observable** de l'agent :
ce qu'il répond à des prompts réels, mesuré contre des assertions
déclaratives.

---

## Limites actuelles

| Limitation | Contournement |
|---|---|
| Les assertions (`output_contains` etc.) ne testent que le texte de la réponse, pas les outils appelés ni les fichiers créés. | Les assertions `expect_tools` et `file_exists` sont planifiées. |
| Le mode `--mock` produit des réponses fixes — le score est non significatif. | Utiliser un vrai `GITHUB_TOKEN` pour des évaluations réelles. |
| L'`OverfittingJudge` utilise une heuristique lexicale simple (chevauchement de mots). | Un juge sémantique (embeddings) est prévu comme adapter `IJudge`. |

---

## Par où commencer ?

1. Lire [`test-harness.md`](./test-harness.md) pour la référence
   technique complète (CLI, schema eval.yaml, commandes).
2. Regarder un `eval.yaml` existant :
   [`tests/skraft-plugin/software-engineer-agent/eval.yaml`](../tests/skraft-plugin/software-engineer-agent/eval.yaml).
3. Lancer une évaluation en mode mock :
   ```bash
   cd tools/skraft-test-harness
   dotnet run --project src/SkraftTestHarness.Cli -- \
     evaluate --skill software-engineer \
     --tests-dir ../../tests/skraft-plugin/software-engineer-agent \
     --mock
   ```
4. Ouvrir le dashboard :
   [`tools/skraft-test-harness/dashboard/index.html`](../tools/skraft-test-harness/dashboard/index.html)
   et charger les fichiers JSON générés par `--report-dir`.
