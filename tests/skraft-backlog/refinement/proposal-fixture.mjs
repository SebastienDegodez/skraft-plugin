// A valid refinement proposal, in French, for tests to start from and break one field at a time.
export const frenchIssue = Object.freeze({
  title: 'Vérifier l\'éligibilité des jeunes conducteurs',
  body: 'En tant que conducteur, je veux savoir si je suis éligible avant de payer.\n\nCritères :\n- la vérification est rapide\n- le serveur renvoie 422 quand le permis est invalide\n\nVoir docs/prd/eligibilite.md',
})

export const proposal = () => ({
  issue: { repo: 'acme/assurance', number: 42, title: frenchIssue.title },
  language: 'fr',
  docs: {
    searched: 'docs',
    used: [{ path: 'docs/prd/eligibilite.md', kind: 'PRD', via: 'linked from the issue' }],
    candidates: [{ path: 'docs/brd/tarifs-conducteurs.md', kind: 'BRD', matched: ['conducteurs'] }],
    missing: [],
    gaps: ['Le PRD limite l\'historique de sinistres à 3 ans ; l\'issue n\'en dit rien.'],
  },
  dor: [
    { item: 1, pass: true },
    { item: 2, pass: false, note: 'Le persona « conducteur » ne distingue pas le jeune conducteur.' },
    { item: 3, pass: false, note: 'Aucun exemple avec un âge ou un nombre de sinistres réel.' },
    { item: 4, pass: false, note: 'Pas de scénario UAT.' },
    { item: 5, pass: false, note: 'Les critères ne découlent d\'aucun scénario.' },
    { item: 6, pass: true },
    { item: 7, pass: true },
    { item: 8, pass: true },
  ],
  story: {
    persona: 'conducteur de moins de 25 ans',
    personaInferred: true,
    statement: 'En tant que conducteur de moins de 25 ans, je veux connaître mon éligibilité avant de payer, afin de ne pas engager de frais pour une offre refusée.',
  },
  examples: [
    'Léa, 22 ans, permis B depuis 2023, aucun sinistre : éligible au tarif standard.',
    'Hugo, 19 ans, permis B depuis 2025, un sinistre responsable en 2025 : éligible avec surprime.',
    'Inès, 24 ans, permis suspendu en 2024 : non éligible, motif « permis suspendu ».',
  ],
  acceptanceCriteria: [
    { id: 'AC1', title: 'Jeune conducteur sans sinistre', given: 'Léa, 22 ans, permis B depuis 2023, aucun sinistre', when: 'elle demande son éligibilité', then: 'elle est éligible au tarif standard', example: 1 },
    { id: 'AC2', title: 'Sinistre responsable récent', given: 'Hugo, 19 ans, un sinistre responsable en 2025', when: 'il demande son éligibilité', then: 'il est éligible avec une surprime', example: 2 },
    { id: 'AC3', title: 'Permis suspendu', given: 'Inès, 24 ans, permis suspendu en 2024', when: 'elle demande son éligibilité', then: 'elle est refusée avec le motif « permis suspendu »', example: 3 },
  ],
  acDefects: [
    { ac: '« la vérification est rapide »', kind: 'vague', detail: 'Aucun seuil : rapide en combien de temps, mesuré où ?' },
    { ac: '« le serveur renvoie 422 quand le permis est invalide »', kind: 'technical', detail: 'Un code HTTP n\'est pas un comportement métier.' },
  ],
  invest: ['Independent', 'Negotiable', 'Valuable', 'Estimable', 'Small', 'Testable'].map((criterion) => ({ criterion, pass: true })),
  antipatterns: [{ name: 'Technical AC', severity: 'HIGH', detail: 'Le deuxième critère cite le code HTTP 422.' }],
  size: { points: 5, justification: 'Trois critères, une règle nouvelle, pas d\'intégration externe.', split: [] },
  triage: { type: 'feature', priority: 'P1', justification: 'Bloque l\'offre jeunes conducteurs.' },
  related: [{ number: 51, title: 'Surprime jeunes conducteurs', similarity: 'RELATED' }],
  review: { verdict: 'APPROVED', attempts: 1, unresolved: [] },
})
