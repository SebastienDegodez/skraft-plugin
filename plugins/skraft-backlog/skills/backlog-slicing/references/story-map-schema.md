# Story map schema

`story-map.json`, schema version 1. Every field is required unless marked optional.

```json
{
  "schemaVersion": 1,
  "milestones": [
    { "id": "L1", "title": "v0.1-socle", "dueOn": "2026-11-13", "description": "Le squelette de bout en bout tourne." }
  ],
  "epics": [
    {
      "id": "EP-001",
      "title": "Réception et suivi des intentions",
      "outcome": "Le porteur d'intention soumet un besoin depuis GitHub ou Slack et en suit l'état.",
      "doneWhen": ["Une intention GitHub et une intention Slack sont suivies en production."],
      "covers": ["FR-001", "FR-002", "NFR-002"],
      "stories": [
        {
          "id": "EP-001-S01",
          "title": "Soumettre une intention depuis une issue GitHub",
          "persona": "porteur d'intention",
          "description": "Une issue étiquetée crée une intention et reçoit un accusé de réception.",
          "covers": ["FR-001", "NFR-002"],
          "after": [],
          "milestone": "L1",
          "moscow": "must",
          "effort": 3,
          "tracer": true
        }
      ]
    }
  ],
  "deferred": [{ "id": "FR-191", "reason": "Le PRD place le test de modèle à la 1.0." }],
  "decisions": ["2026-10-19 Decision: EP-001-S01 is the tracer bullet of EP-001."]
}
```

| Field | Rule |
|---|---|
| `milestones[].id` | Unique; every story's `milestone` names one. Order = delivery order. |
| `milestones[].dueOn` | Optional, `YYYY-MM-DD`. |
| `epics[].id`, `stories[].id` | Unique across the map. Story ids: `<epic id>-S<two digits>`, in build order. |
| `epics[].covers` | Every id any of its stories covers, plus binding NFR/CON ids. |
| `stories[].covers` | At least one id defined by the PRD. |
| `stories[].after` | Story ids of this map; `[]` when none; no cycle; never a later milestone. |
| `stories[].moscow` | `must`, `should` or `could`. |
| `stories[].effort` | 1, 2, 3, 5 or 8. |
| `stories[].tracer` | `true` on the first story of each epic only; omit elsewhere. |
| `deferred` | Optional; ids the PRD defines, each with the PRD's reason; never also covered. |
| `decisions` | Optional; dated lines. |
