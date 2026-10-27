// The data a scripted slicer and story writer write: a valid story map for the eligibility PRD
// fixture, and a valid story file for each of its stories.

export const storyMap = () => ({
  schemaVersion: 1,
  milestones: [
    { id: 'M1', title: 'v0.1-eligibilite', dueOn: '2026-11-13', description: 'Le conducteur connaît son éligibilité.' },
    { id: 'M2', title: 'v0.2-justificatifs', dueOn: '2026-11-27', description: 'Le conducteur dépose son permis.' },
  ],
  epics: [
    {
      id: 'EP-001', title: "Contrôle d'éligibilité", outcome: 'Le conducteur connaît son éligibilité dès la soumission de son profil.',
      doneWhen: ['Un conducteur éligible et un conducteur refusé voient chacun leur décision en production.'],
      covers: ['FR-001', 'FR-002', 'FR-003', 'NFR-001'],
      stories: [
        { id: 'EP-001-S01', title: "Recevoir la décision d'éligibilité", persona: 'conducteur qui soumet son premier profil', description: 'Le conducteur éligible voit sa décision.', covers: ['FR-001', 'NFR-001'], after: [], milestone: 'M1', moscow: 'must', effort: 3, tracer: true },
        { id: 'EP-001-S02', title: 'Être refusé avant 18 ans', persona: 'conducteur de moins de 18 ans', description: 'Le conducteur mineur voit le motif du refus.', covers: ['FR-002'], after: ['EP-001-S01'], milestone: 'M1', moscow: 'must', effort: 2 },
        { id: 'EP-001-S03', title: 'Retrouver sa décision pendant 30 jours', persona: 'conducteur déclaré éligible', description: 'La décision reste consultable 30 jours.', covers: ['FR-003'], after: ['EP-001-S01'], milestone: 'M1', moscow: 'should', effort: 2 },
      ],
    },
    {
      id: 'EP-002', title: 'Justificatifs', outcome: 'Le conducteur éligible dépose un permis vérifié.',
      doneWhen: ['Un permis valide est accepté en production.'],
      covers: ['FR-004'],
      stories: [
        { id: 'EP-002-S01', title: 'Déposer son permis', persona: 'conducteur déclaré éligible', description: 'Le permis déposé est vérifié.', covers: ['FR-004'], after: ['EP-001-S01'], milestone: 'M2', moscow: 'must', effort: 3, tracer: true },
      ],
    },
  ],
  deferred: [],
  decisions: ['2026-10-19 Decision: EP-001-S01 is the tracer bullet of EP-001.'],
})

/** @param {ReturnType<typeof storyMap>['epics'][number]['stories'][number] & { epic: string }} planned */
export const storyFile = (planned) => ({
  id: planned.id,
  epic: planned.epic,
  title: planned.title,
  persona: planned.persona,
  description: `${planned.description} Elle fait avancer ${planned.epic}.`,
  story: { asA: planned.persona, iWant: planned.title.toLowerCase(), soThat: 'je sache où en est ma demande' },
  examples: [
    { id: 'EX-1', text: 'Sophie Martin, 29 ans, permis B depuis 8 ans : décision « éligible ».' },
    { id: 'EX-2', text: 'Karim Benali, 17 ans : refus « âge minimum 18 ans ».' },
    { id: 'EX-3', text: 'Isabelle Dupont, 18 ans le jour même : décision « éligible ».' },
  ],
  acceptanceCriteria: ['EX-1', 'EX-2', 'EX-3'].map((example, index) => ({
    id: `AC-0${index + 1}`,
    title: `Cas ${index + 1}`,
    given: `le profil de l'exemple ${example}`,
    when: 'le conducteur soumet son profil',
    then: ['le portail affiche la décision attendue'],
    example,
    covers: index === 0 ? planned.covers : [],
  })),
  tasks: [{ text: 'Afficher la décision sur le portail', acceptanceCriteria: ['AC-01', 'AC-02', 'AC-03'] }],
  devNotes: {
    context: ['La décision est calculée à partir du profil soumis.'],
    references: planned.covers.map((id) => ({ id, note: 'exigence portée par la story' })),
    testing: ['Un test d’acceptation par critère, au niveau du cas d’usage.'],
  },
  technicalNotes: ['None identified'],
  dependencies: planned.after.map((story) => ({ story, reason: 'la décision doit exister' })),
  effort: { points: planned.effort, rationale: 'Trois critères, aucune intégration externe.' },
  openQuestions: [],
})

export const PASSING_LENS = (lens) => `lens: ${lens}\nverdict: pass\ndefects: []`
