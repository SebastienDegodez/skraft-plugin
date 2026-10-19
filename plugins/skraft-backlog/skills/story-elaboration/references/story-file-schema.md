# Story file schema

`stories/<story id>.json`. Every field is required unless marked optional.

```json
{
  "id": "EP-001-S02",
  "epic": "EP-001",
  "title": "Être refusé avant 18 ans",
  "persona": "conducteur de moins de 18 ans",
  "description": "Le conducteur mineur voit le motif du refus dès la soumission.",
  "story": {
    "asA": "conducteur de moins de 18 ans",
    "iWant": "connaître le motif du refus de ma demande",
    "soThat": "je sache quand je pourrai la renouveler"
  },
  "examples": [
    { "id": "EX-1", "text": "Karim Benali, 17 ans : refus « âge minimum 18 ans »." },
    { "id": "EX-2", "text": "Léa Morel, 18 ans depuis la veille : décision « éligible »." },
    { "id": "EX-3", "text": "Hugo Petit, 16 ans, conduite accompagnée : refus « âge minimum 18 ans »." }
  ],
  "acceptanceCriteria": [
    {
      "id": "AC-01",
      "title": "Un conducteur de 17 ans est refusé avec le motif",
      "given": "un conducteur né il y a 17 ans",
      "when": "il soumet son profil",
      "then": ["la demande est refusée", "le motif « âge minimum 18 ans » est affiché"],
      "example": "EX-1",
      "covers": ["FR-002", "AC-002"]
    }
  ],
  "tasks": [
    { "text": "Refuser une demande avant 18 ans et afficher le motif, test d'acceptation compris", "acceptanceCriteria": ["AC-01"] }
  ],
  "devNotes": {
    "context": ["L'âge se calcule à la date de soumission (DD-012)."],
    "references": [{ "id": "FR-002", "note": "règle de refus et motif" }],
    "testing": ["Un test d'acceptation par critère au niveau du cas d'usage de soumission."]
  },
  "technicalNotes": ["None identified"],
  "dependencies": [{ "story": "EP-001-S01", "reason": "la décision d'éligibilité doit exister" }],
  "effort": { "points": 2, "rationale": "Trois critères, une règle, aucune intégration." },
  "openQuestions": []
}
```

| Field | Rule |
|---|---|
| `id`, `epic` | As in the story map. |
| `examples` | At least 3; ids `EX-<n>`; concrete values in each text. |
| `acceptanceCriteria` | 3 to 7; ids `AC-<two digits>` local to the story; `example` names an example of this file; `covers` ids defined by the PRD. |
| `tasks[].acceptanceCriteria` | Criterion ids of this file; together they serve every criterion. |
| `devNotes.references` | At least one; each `id` is a PRD id. |
| `dependencies[].story` | Exactly the map's `after`, each with a `reason`. |
| `effort.points` | 1, 2, 3, 5 or 8. |
| `openQuestions` | Optional. |
