/** The description of the pull request, kept in the tracking folder. */
export const PULL_REQUEST_FILE = 'pull-request.md'

/**
 * What the description of a pull request says in the story's language: its headings, the fixed
 * lines the engine writes, the headers of its tables and the nouns it counts.
 *
 * @typedef {{ one: string, many: string }} Noun
 * @typedef {typeof EN} Words
 */

/** A noun that a count does not change. @param {string} word @returns {Noun} */
const invariable = (word) => Object.freeze({ one: word, many: word })

const EN = Object.freeze({
  /** Whether a count takes the plural. @param {number} count */
  many: (count) => count !== 1,
  headings: Object.freeze({
    what: 'What changes', why: 'Why', decisions: 'Decisions applied', matrix: 'Consistency matrix', tests: 'Tests',
    red: 'RED evidence', gates: 'Quality gates', review: 'Review', screenshots: 'Screenshots',
    domainHeavy: 'More Domain tests than acceptance tests', limitations: 'Out of scope and limitations',
    summary: 'Run summary', disclosure: 'AI disclosure',
  }),
  notWritten: Object.freeze({
    what: 'Not written: the run has no pr-writer step that wrote what changes.',
    why: 'Not written: the run has no pr-writer step that wrote why.',
    limitations: 'Not written: the run has no pr-writer step that wrote what is out of scope.',
  }),
  cut: `[cut: the description holds more than a pull request takes; read it whole in the tracking folder, ${PULL_REQUEST_FILE}]`,
  prune: 'To find the tests that kill no mutant on their own, the developer runs `/skraft:prune-tests` on a component; it proposes, the developer decides each test.',
  /** @param {string} domain @param {string} acceptance */
  domainHeavy: (domain, acceptance) => `The test plans count ${domain} against ${acceptance} (Application and E2E).`,
  domainRow: Object.freeze({ one: 'Domain row', many: 'Domain rows' }),
  acceptanceRow: Object.freeze({ one: 'acceptance row', many: 'acceptance rows' }),
  noMatrix: 'None recorded: the tracking folder holds no consistency matrix of this run (DESIGN writes it).',
  noTestPlan: 'None recorded: the tracking folder holds no test plan of this run (DISTILL writes it).',
  /** @param {string} path */
  from: (path) => `From ${path} in the tracking folder:`,
  redCommit: Object.freeze({ one: 'red commit', many: 'red commits' }),
  failed: 'failed',
  passed: Object.freeze({ one: 'passed', many: 'passed' }),
  review: Object.freeze({
    status: Object.freeze({ fix: 'To fix', decide: 'To decide', accepted: 'Accepted', note: 'Note', refuted: 'Refuted' }),
    counted: Object.freeze({
      fix: invariable('to fix'), decide: invariable('to decide'), accepted: invariable('accepted'),
      note: Object.freeze({ one: 'note', many: 'notes' }), refuted: Object.freeze({ one: 'refuted', many: 'refuted' }),
    }),
    header: '| Status | Severity | Lens | Location | Finding | Why |',
    confirmed: 'confirmed: ',
    unverifiable: 'not verified: ',
    alone: 'one lens alone, against the lenses that passed; refuted: ',
    accepted: 'a human accepted it as it stands at the review\'s ceiling',
    /** @param {number} pass */
    carried: (pass) => ` (refuted on pass ${pass})`,
    /** @param {number} pass */
    unchanged: (pass) => `new on a line unchanged since pass ${pass}`,
    /** @param {number} pass */
    pass: (pass) => `pass ${pass}`,
    lead: 'Review: ',
    passes: Object.freeze({ one: 'pass', many: 'passes' }),
    /** @param {string} passes @param {string} lenses @param {string} refuter */
    heading: (passes, lenses, refuter) => `${passes} · lenses ${lenses} · refuter ${refuter}`,
  }),
  ratified: 'ratified in this run',
  /** @param {string} node @param {string} reason */
  unlocked: (node, reason) => `Locked gate ${node} skipped, unlocked: ${reason}`,
  noDecision: 'None recorded: no ADR was ratified and no locked gate was unlocked in this run.',
  noRed: 'None recorded: no red commit was accepted in this run.',
  redHeader: '| Commit | Subject | Replay exit code |',
  notReplayed: 'not replayed',
  noExcerpt: 'Output excerpts of the replays are not recorded yet.',
  noGate: 'None recorded: no gate ran in this run.',
  gateHeader: '| Component | Gate | Command | Result | Time | Evidence |',
  allPassed: 'Every lens of the last pass of each review passed without a finding.',
  preparedBy: 'This pull request was prepared by skraft with AI agents',
  /** @param {string} families */
  families: (families) => ` on the model families ${families}`,
  /** @param {string} models */
  models: (models) => ` (models the host named: ${models})`,
  noModel: ' (the host named no model)',
  writtenBy: '. What changes, Why and Out of scope were written by the pr-writer agent; every other section is rendered by the engine from the run\'s journal. A human reviews it before it merges.',
})

/** @type {Words} */
const FR = Object.freeze({
  many: (count) => count > 1,
  headings: Object.freeze({
    what: 'Ce qui change', why: 'Pourquoi', decisions: 'Décisions appliquées', matrix: 'Matrice de cohérence', tests: 'Tests',
    red: 'Preuves RED', gates: 'Portes de qualité', review: 'Revue', screenshots: 'Captures d\'écran',
    domainHeavy: 'Plus de tests Domain que de tests d\'acceptation', limitations: 'Hors périmètre et limites',
    summary: 'Résumé du run', disclosure: 'Mention de l\'IA',
  }),
  notWritten: Object.freeze({
    what: 'Non rédigé : le run n\'a aucune étape pr-writer qui ait rédigé ce qui change.',
    why: 'Non rédigé : le run n\'a aucune étape pr-writer qui ait rédigé le pourquoi.',
    limitations: 'Non rédigé : le run n\'a aucune étape pr-writer qui ait rédigé ce qui est hors périmètre.',
  }),
  cut: `[coupé : la description dépasse ce qu'une pull request accepte ; lisez-la en entier dans le dossier de suivi, ${PULL_REQUEST_FILE}]`,
  prune: 'Pour trouver les tests qui ne tuent aucun mutant à eux seuls, le développeur lance `/skraft:prune-tests` sur un composant ; la commande propose, le développeur décide de chaque test.',
  domainHeavy: (domain, acceptance) => `Les plans de test comptent ${domain} contre ${acceptance} (Application et E2E).`,
  domainRow: Object.freeze({ one: 'ligne Domain', many: 'lignes Domain' }),
  acceptanceRow: Object.freeze({ one: 'ligne d\'acceptation', many: 'lignes d\'acceptation' }),
  noMatrix: 'Aucune consignée : le dossier de suivi ne contient aucune matrice de cohérence de ce run (DESIGN l\'écrit).',
  noTestPlan: 'Aucun consigné : le dossier de suivi ne contient aucun plan de test de ce run (DISTILL l\'écrit).',
  from: (path) => `Depuis ${path} dans le dossier de suivi :`,
  redCommit: Object.freeze({ one: 'commit red', many: 'commits red' }),
  failed: 'en échec',
  passed: Object.freeze({ one: 'réussie', many: 'réussies' }),
  review: Object.freeze({
    status: Object.freeze({ fix: 'À corriger', decide: 'À trancher', accepted: 'Accepté', note: 'Note', refuted: 'Réfuté' }),
    counted: Object.freeze({
      fix: invariable('à corriger'), decide: invariable('à trancher'), accepted: Object.freeze({ one: 'accepté', many: 'acceptés' }),
      note: Object.freeze({ one: 'note', many: 'notes' }), refuted: Object.freeze({ one: 'réfuté', many: 'réfutés' }),
    }),
    header: '| Statut | Sévérité | Lentille | Emplacement | Constat | Pourquoi |',
    confirmed: 'confirmé : ',
    unverifiable: 'non vérifié : ',
    alone: 'une seule lentille, contre celles qui sont passées ; réfuté : ',
    accepted: 'un humain l\'a accepté tel quel au plafond de la revue',
    carried: (pass) => ` (réfuté à la passe ${pass})`,
    unchanged: (pass) => `nouveau sur une ligne inchangée depuis la passe ${pass}`,
    pass: (pass) => `passe ${pass}`,
    lead: 'Revue : ',
    passes: Object.freeze({ one: 'passe', many: 'passes' }),
    heading: (passes, lenses, refuter) => `${passes} · lentilles ${lenses} · réfuteur ${refuter}`,
  }),
  ratified: 'ratifié dans ce run',
  unlocked: (node, reason) => `Porte verrouillée ${node} sautée, déverrouillée : ${reason}`,
  noDecision: 'Aucune consignée : aucun ADR n\'a été ratifié et aucune porte verrouillée n\'a été déverrouillée dans ce run.',
  noRed: 'Aucune consignée : aucun commit red n\'a été accepté dans ce run.',
  redHeader: '| Commit | Sujet | Code de sortie du rejeu |',
  notReplayed: 'non rejoué',
  noExcerpt: 'Les extraits de sortie des rejeux ne sont pas encore consignés.',
  noGate: 'Aucune consignée : aucune porte n\'a tourné dans ce run.',
  gateHeader: '| Composant | Porte | Commande | Résultat | Durée | Preuve |',
  allPassed: 'Chaque lentille de la dernière passe de chaque revue est passée sans constat.',
  preparedBy: 'Cette pull request a été préparée par skraft avec des agents IA',
  families: (families) => ` sur les familles de modèles ${families}`,
  models: (models) => ` (modèles nommés par l'hôte : ${models})`,
  noModel: ' (l\'hôte n\'a nommé aucun modèle)',
  writtenBy: '. Ce qui change, Pourquoi et Hors périmètre ont été rédigés par l\'agent pr-writer ; toutes les autres sections sont rendues par le moteur à partir du journal du run. Un humain la relit avant sa fusion.',
})

/** The words of a description, per language. */
export const DESCRIPTION_WORDS = Object.freeze({ en: EN, fr: FR })

/** A count and its noun, plural as the language takes it. @param {Words} words @param {number} count @param {Noun} noun */
export const counted = (words, count, noun) => `${count} ${words.many(count) ? noun.many : noun.one}`
