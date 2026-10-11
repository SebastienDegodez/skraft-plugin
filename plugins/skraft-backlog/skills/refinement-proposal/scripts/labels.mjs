// Fixed text of the proposal comment. The agent writes the content in the issue's language;
// these headings exist in French and English, and English serves every other language.
export const LABELS = Object.freeze({
  en: {
    sep: ':',
    title: 'Refinement proposal',
    ready: 'ready for design',
    notReady: 'needs refinement',
    size: 'Size',
    points: (n) => `${n} point${n > 1 ? 's' : ''}`,
    days: (d) => `≈ ${d} team-day${d === 1 ? '' : 's'} (capacity arithmetic, not a forecast)`,
    split: 'split it before sizing',
    type: 'Type',
    priority: 'Priority',
    dor: 'Definition of Ready',
    blocking: 'What keeps it from being ready',
    story: 'Proposed story',
    inferred: 'Persona inferred from the issue — confirm it.',
    examples: 'Domain examples',
    criteria: 'Proposed acceptance criteria',
    fromExample: (n) => `from example ${n}`,
    acDefects: 'Problems in the current acceptance criteria',
    defect: { vague: 'vague', untestable: 'not testable', duplicate: 'duplicate', technical: 'technical, not business', antipattern: 'antipattern', invest: 'breaks INVEST', missing: 'missing' },
    invest: 'INVEST',
    criterion: 'Criterion',
    state: 'State',
    note: 'Note',
    splitTitle: 'Proposed split',
    docs: 'Reference documents',
    used: 'Reviewed against',
    toConfirm: 'To confirm — not used',
    confirmHow: 'link it in the issue, then comment `/skraft-refine`',
    matched: 'shared words',
    none: (dir) => `No PRD or BRD found under \`${dir}/\`.`,
    missing: 'Linked but not found',
    gaps: 'Gaps against the document',
    related: 'Related issues',
    review: 'Review',
    reviewLine: (verdict, attempts) => `Lens review verdict: **${verdict}** after ${attempts} attempt${attempts > 1 ? 's' : ''}.`,
    unresolved: 'Unresolved review findings',
    footer: (version) => `skraft-backlog ${version} · after editing the issue, comment \`/skraft-refine\` (or \`/skraft-refine --force\` to redo it unchanged)`,
    dorItems: ['Problem statement', 'Specific persona', '3+ domain examples', 'UAT scenarios', 'Criteria derived from UAT', 'Right-sized', 'Technical notes', 'Dependencies listed'],
  },
  fr: {
    sep: ' :',
    title: 'Proposition de refinement',
    ready: 'prête pour la conception',
    notReady: 'à retravailler',
    size: 'Taille',
    points: (n) => `${n} point${n > 1 ? 's' : ''}`,
    days: (d) => `≈ ${String(d).replace('.', ',')} jour${d >= 2 ? 's' : ''} d'équipe (calcul de capacité, pas une prévision)`,
    split: 'à découper avant de l\'estimer',
    type: 'Type',
    priority: 'Priorité',
    dor: 'Definition of Ready',
    blocking: 'Ce qui l\'empêche d\'être prête',
    story: 'Story proposée',
    inferred: 'Persona déduit de l\'issue — à confirmer.',
    examples: 'Exemples métier',
    criteria: 'Critères d\'acceptation proposés',
    fromExample: (n) => `issu de l'exemple ${n}`,
    acDefects: 'Problèmes des critères d\'acceptation actuels',
    defect: { vague: 'vague', untestable: 'non testable', duplicate: 'doublon', technical: 'technique, pas métier', antipattern: 'antipattern', invest: 'enfreint INVEST', missing: 'manquant' },
    invest: 'INVEST',
    criterion: 'Critère',
    state: 'État',
    note: 'Note',
    splitTitle: 'Découpage proposé',
    docs: 'Documents de référence',
    used: 'Revue faite contre',
    toConfirm: 'À confirmer — non utilisé',
    confirmHow: 'ajoutez son lien dans l\'issue, puis commentez `/skraft-refine`',
    matched: 'mots communs',
    none: (dir) => `Aucun PRD ni BRD trouvé sous \`${dir}/\`.`,
    missing: 'Lien introuvable',
    gaps: 'Écarts avec le document',
    related: 'Issues proches',
    review: 'Revue',
    reviewLine: (verdict, attempts) => `Verdict de la revue par lentilles : **${verdict}** après ${attempts} tentative${attempts > 1 ? 's' : ''}.`,
    unresolved: 'Points de revue non résolus',
    footer: (version) => `skraft-backlog ${version} · après modification de l'issue, commentez \`/skraft-refine\` (ou \`/skraft-refine --force\` pour la refaire à l'identique)`,
    dorItems: ['Énoncé du problème', 'Persona précis', '3 exemples métier ou plus', 'Scénarios UAT', 'Critères issus des UAT', 'Bien dimensionnée', 'Notes techniques', 'Dépendances listées'],
  },
})

// Gherkin keywords of each language Cucumber ships, for the proposed criteria.
export const GHERKIN = Object.freeze({
  en: ['Given', 'When', 'Then'],
  fr: ['Étant donné', 'Quand', 'Alors'],
  es: ['Dado', 'Cuando', 'Entonces'],
  de: ['Angenommen', 'Wenn', 'Dann'],
  it: ['Dato', 'Quando', 'Allora'],
  pt: ['Dado', 'Quando', 'Então'],
  nl: ['Gegeven', 'Als', 'Dan'],
})

const STOPWORDS = Object.freeze({
  en: ['the', 'and', 'is', 'to', 'of', 'a', 'in', 'that', 'it', 'for', 'when', 'should', 'with', 'be', 'as', 'this', 'not', 'can', 'are', 'we'],
  fr: ['le', 'la', 'les', 'et', 'est', 'des', 'un', 'une', 'du', 'pour', 'que', 'qui', 'dans', 'pas', 'sur', 'avec', 'quand', 'doit', 'nous', 'en'],
  es: ['el', 'los', 'las', 'y', 'es', 'que', 'una', 'para', 'por', 'con', 'del', 'cuando', 'debe', 'como', 'pero'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'mit', 'für', 'wenn', 'soll', 'auf', 'den', 'dem'],
  it: ['il', 'lo', 'gli', 'e', 'che', 'una', 'per', 'con', 'del', 'della', 'quando', 'deve', 'non', 'sono'],
  pt: ['o', 'os', 'as', 'e', 'que', 'uma', 'para', 'com', 'do', 'da', 'quando', 'deve', 'não', 'são'],
  nl: ['de', 'het', 'een', 'en', 'is', 'van', 'dat', 'niet', 'met', 'voor', 'als', 'moet', 'wordt'],
})

/** The language an issue is written in, from its most frequent function words; null when unclear. */
export function detectLanguage(text) {
  const tokens = String(text ?? '').toLowerCase().split(/[^\p{L}']+/u).filter(Boolean)
  if (tokens.length === 0) return null
  const scores = Object.entries(STOPWORDS).map(([lang, words]) => {
    const set = new Set(words)
    return [lang, tokens.filter((token) => set.has(token)).length]
  }).sort((left, right) => right[1] - left[1])
  const [[best, top], [, second]] = scores
  return top >= 2 && top > second ? best : null
}
