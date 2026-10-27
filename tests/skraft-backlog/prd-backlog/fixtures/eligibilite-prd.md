# Éligibilité des jeunes conducteurs : PRD

## Exigences fonctionnelles (Functional Requirements)

### EP-001 : Contrôle d'éligibilité

* `FR-001` : Lorsqu'un conducteur soumet son profil, le portail doit lui indiquer s'il est éligible.
  * Critères d'acceptation : AC-001.
* `FR-002` : Si le conducteur a moins de 18 ans, alors le portail doit refuser la demande en donnant le motif.
  * Critères d'acceptation : AC-002.

#### Détail du contrôle

* `FR-003` : Le portail doit conserver la décision d'éligibilité pendant 30 jours.
  * Critères d'acceptation : AC-003.

### EP-002 : Justificatifs

* `FR-004` : Lorsqu'un conducteur éligible dépose son permis, le portail doit vérifier sa validité.
  * Critères d'acceptation : AC-004.

## Exigences non fonctionnelles (Non-Functional Requirements)

* `NFR-001` : La décision d'éligibilité doit être rendue en 2 s au plus au 95e centile.

## Critères d'acceptation (Acceptance Criteria)

* `AC-001` : Étant donné un conducteur de 29 ans, Quand il soumet son profil, Alors le portail le déclare éligible.
* `AC-002` : Étant donné un conducteur de 17 ans, Quand il soumet son profil, Alors la demande est refusée pour âge insuffisant.
* `AC-003` : Étant donné une décision rendue le 1er mars, Quand le conducteur revient le 30 mars, Alors la décision est toujours affichée.
* `AC-004` : Étant donné un permis valide jusqu'en 2030, Quand le conducteur le dépose, Alors le permis est accepté.
