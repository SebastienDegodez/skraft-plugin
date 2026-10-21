// The canvas vocabulary, in the language of the PRD. Shared by the panel (browser) and by the
// explanation the agent reads (node): one wording for every check, its reason and its fix.

/** @typedef {'fr' | 'en'} Language */

const list = (value) => (Array.isArray(value) ? (value.length ? value.join(', ') : '—') : String(value ?? '—'))

/**
 * Replaces each `{name}` by its parameter (lists read as "a, b") and each `{name|one|other}` by the
 * form the count of `name` takes in the language.
 * @param {string} template @param {Record<string, unknown>} [params] @param {string} [language]
 */
export const format = (template, params = {}, language = 'en') => {
  const rules = new Intl.PluralRules(language)
  return template.replace(/\{(\w+)(?:\|([^|}]*)\|([^}]*))?\}/g, (_, name, one, other) => (one === undefined ? list(params[name])
    : rules.select(Number(params[name])) === 'one' ? one : other))
}

const FR = {
  invest: {
    I: ['Indépendante', 'livrable sans attendre une story retenue, sans cycle'],
    N: ['Négociable', 'dit le besoin, pas la solution'],
    V: ['Porteuse de valeur', 'un bénéfice métier pour une personne précise'],
    E: ['Estimable', "assez claire pour être chiffrée"],
    S: ['Petite', 'de 1 à 8 points, 3 à 7 critères'],
    T: ['Testable', 'chaque critère se vérifie sur un exemple'],
  },
  dor: {
    1: ['Énoncé du problème', 'un besoin observable, pas « implémenter X »'],
    2: ['Persona précise', 'un rôle nommé, jamais « utilisateur »'],
    3: ['Exemples du domaine', 'au moins 3, avec des valeurs réelles'],
    4: ['Scénarios d’acceptation', 'Étant donné / Quand / Alors, 3 à 7'],
    5: ['Critères dérivés des exemples', 'chaque critère part d’un exemple'],
    6: ['Bien dimensionnée', 'effort 1, 2, 3, 5 ou 8, justifié'],
    7: ['Notes techniques', 'contexte, références, manière de tester'],
    8: ['Dépendances listées', 'celles de la carte, chacune avec sa raison'],
  },
  rules: {
    'id-mismatch': ['La fiche porte l’id {found}, la carte prévoit {planned}.', 'Reprendre l’id de la carte.'],
    'epic-mismatch': ['La fiche se range sous {found}, la carte sous {planned}.', 'Reprendre l’épic de la carte.'],
    'field-missing': ['Le champ {field} est vide.', 'Le remplir.'],
    'persona-missing': ['La fiche ne nomme aucune persona.', 'Nommer le rôle qui bénéficie de la story.'],
    'statement-missing': ['L’énoncé « En tant que… je veux… afin de… » est incomplet ({part}).', 'Compléter l’énoncé.'],
    'vague-persona': ['« {persona} » ne désigne aucun rôle précis (persona vague).', 'Remplacer par le rôle du PRD qui en profite.'],
    'implement-x': ['« {iWant} » décrit une réalisation, pas un besoin (implémenter X).', 'Dire ce que la persona peut faire ou observer.'],
    'examples-too-few': ['{count} {count|exemple|exemples} du domaine, il en faut au moins {min} (sans exemples).', 'Ajouter des cas réels, dont un cas limite ou un refus.'],
    'example-incomplete': ['Un exemple n’a pas d’id ou pas de texte.', 'Donner à chaque exemple un id et un texte.'],
    'generic-data': ['{example} ne porte aucune valeur concrète (données génériques).', 'Mettre des noms, des montants, des dates.'],
    'criteria-too-few': ['{count} {count|critère|critères} d’acceptation, il en faut au moins {min}.', 'Écrire un critère par exemple.'],
    'criteria-too-many': ['{count} critères : au-delà de {max}, la story est trop grosse (story géante).', 'Découper la story.'],
    'criterion-incomplete': ['{criterion} : la partie « {part} » manque.', 'Compléter Étant donné / Quand.'],
    'criterion-no-outcome': ['{criterion} ne dit aucun résultat observable.', 'Écrire au moins un « Alors » vérifiable.'],
    'criterion-no-example': ['{criterion} ne part d’aucun exemple de la story.', 'Le rattacher à l’exemple qu’il vérifie.'],
    'criterion-unknown-requirement': ['{criterion} couvre {requirement}, que le PRD ne définit pas.', 'Corriger l’identifiant.'],
    'requirement-uncarried': ['Aucun critère ne prouve {requirement}, que la carte confie à cette story.', 'Ajouter ou compléter un critère qui le couvre.'],
    'technical-ac': ['{criterion} parle de technique (« {found} ») au lieu du métier (critère technique).', 'Décrire le comportement vu par la persona.'],
    'tasks-missing': ['Aucune tâche n’est listée.', 'Lister le travail, chaque tâche avec les critères qu’elle sert.'],
    'task-incomplete': ['Une tâche n’a pas de texte.', 'Décrire la tâche.'],
    'task-unknown-criterion': ['Une tâche sert {criterion}, qui n’est pas un critère de la story.', 'Corriger la référence.'],
    'criterion-unserved': ['Aucune tâche ne sert {criterion}.', 'Rattacher {criterion} à une tâche.'],
    'technical-notes-empty': ['Les notes techniques sont vides.', 'Écrire « None identified » s’il n’y en a pas.'],
    'references-missing': ['Les notes ne citent aucun passage du PRD.', 'Citer les exigences à ouvrir, avec la raison.'],
    'context-missing': ['Les notes ne donnent pas le contexte utile.', 'Résumer décisions, seuils et limites.'],
    'testing-missing': ['Les notes ne disent pas comment prouver les critères.', 'Dire quel test prouve chaque critère.'],
    'dependencies-not-list': ['Les dépendances ne sont pas une liste.', 'Écrire [] s’il n’y en a aucune.'],
    'dependencies-mismatch': ['La fiche attend [{found}], la carte prévoit [{planned}] (dépendances manquantes).', 'Reprendre exactement les dépendances de la carte.'],
    'dependency-no-reason': ['{story} est listée sans raison.', 'Dire ce que la story attend de {story}.'],
    'dependency-no-story': ['La dépendance n° {index} ne nomme aucune story.', 'Écrire { "story": "<id>", "reason": "…" }.'],
    'effort-off-scale': ['L’effort {found} n’est pas sur l’échelle {scale}.', 'Choisir 1, 2, 3, 5 ou 8 ; au-delà, découper.'],
    'effort-split': ['{points} points : plus d’une journée de développement assisté par IA (au-delà de {max}) — avertissement.', 'Découpe recommandée : voir les corrections proposées.'],
    'integrations-many': ['{count} intégrations externes ({integrations}) : une story n’en intègre qu’une.', 'Découper par interface, une story par intégration.'],
    'too-small': ['{points} point et {criteria} critères : trop petite pour porter une valeur seule ?', 'Fusionner avec une story voisine, ou lui donner un parcours propre.'],
    'effort-no-rationale': ['L’effort n’est pas justifié.', 'Une phrase : critères, intégrations, inconnues.'],
    'held-blocker': ['Elle attend {story}, qui est retenue.', 'Rendre {story} prête, ou retirer la dépendance dans la carte.'],
    'effort-at-limit': ['Effort {points} : le haut de l’échelle.', 'Envisager un découpage.'],
    'open-questions': ['{count} {count|question reste ouverte|questions restent ouvertes}.', 'Les trancher avant d’estimer.'],
  },
  states: { unwritten: 'à écrire', refused: 'refusée', written: 'écrite', held: 'retenue', ready: 'prête', published: 'publiée' },
  reviews: { none: 'à relire', reviewed: 'relue', stale: 'fiche modifiée depuis la relecture' },
  missing: { unknown: 'inconnue', 'not-ready': 'pas prête', 'not-reviewed': 'pas relue', 'review-stale': 'relecture périmée', 'not-planned': 'absente du plan' },
  sources: { check: 'contrôle', lens: 'grille', map: 'carte' },
  antipatterns: { 'Implement-X': 'Implémenter X', 'Giant Story': 'Story géante', 'No Examples': 'Sans exemples', 'Technical AC': 'Critère technique', 'Generic Data': 'Données génériques', 'Tests After Code': 'Tests après le code', 'Vague Persona': 'Persona vague', 'Missing Dependencies': 'Dépendances manquantes' },
  severities: { low: 'faible', medium: 'moyenne', high: 'haute', blocker: 'bloquante' },
  responses: {
    pending: 'fiche à écrire',
    noDependency: 'aucune dépendance',
    waits: 'attend {after}',
    held: 'attend {held}, retenue',
    quote: '« {value} »',
    missing: 'absent',
    effort: '{points} pts · {tasks} {tasks|tâche|tâches}',
    size: '{points} pts · {criteria} {criteria|critère|critères}',
    testable: '{criteria} {criteria|critère|critères} · {examples} {examples|exemple|exemples}',
    persona: '{persona}',
    examples: '{examples} {examples|exemple|exemples}',
    criteria: '{criteria} {criteria|critère|critères}',
    derived: '{linked}/{criteria} dérivés',
    points: '{points} pts',
    notes: '{notes} {notes|note|notes}',
    dependencies: '{dependencies}',
  },
  ui: {
    title: 'Backlog', plan: 'Plan de vol', invest: 'INVEST', dor: 'Définition de prêt', lenses: 'Revue des grilles', sheet: 'Fiche',
    asA: 'En tant que', iWant: 'je veux', soThat: 'afin de', examples: 'Exemples', criteria: 'Critères d’acceptation',
    tasks: 'Tâches', notes: 'Notes', dependencies: 'Dépendances', questions: 'Questions ouvertes', given: 'Étant donné', when: 'Quand', then: 'Alors',
    coverage: '{covered}/{fr} FR couvertes · {deferred} reportées', reviewed: '{reviewed}/{ready} prêtes relues', markReviewed: 'Marquer relue',
    unmarkReviewed: 'Retirer la relecture', preview: 'Aperçu à blanc', create: 'Créer {count} {count|issue|issues}', createIdle: 'Créer les issues',
    repo: 'Dépôt', noRepo: 'aucun dépôt', empty: 'Aucun backlog dans cet espace de travail. Lancez le workflow skraft-prd-backlog.',
    filterAll: 'Toutes', filterTodo: 'À relire', filterRefused: 'Refusées', filterHeld: 'Retenues', filterReady: 'Prêtes', filterPublished: 'Publiées',
    search: 'Filtrer par id ou titre', why: 'Pourquoi', fix: 'Correction', seeSheet: 'Voir dans la fiche', mapProblems: 'Problèmes de la carte',
    noFinding: 'Aucun constat des grilles.', tracer: 'tracer', effortUnit: 'pts', previewTitle: 'Création prévue', created: 'Créé', existing: 'Existant',
    linked: 'Lié', skipped: 'Ignoré', failed: 'Échec', dryRun: 'À blanc', planned: 'à créer', missingTitle: 'Stories qui bloquent la création', requiredBy: 'requise par {via}',
    unplaced: 'ne vise aucune lettre INVEST ni aucun item DoR', epicFindings: 'Constats sur l’épic', menu: 'Stories',
    destination: 'vers', waiting: '{count} {count|dépendance|dépendances} en attente', jump: 'Aller à la ligne {line}',
    signoff: 'Relecture humaine', signoffChallenge: 'relue et acceptée telle quelle avant création', signed: 'relue le {at}', nothingToReview: 'pas prête, rien à relire',
    opCreate: 'à créer', opLink: 'à lier', opExisting: 'existe déjà', opCreated: 'créée', opLinked: 'liée', opSkipped: 'ignorée', opFailed: 'en échec',
    subIssueOf: 'sous-issue de {epic}', blockedBy: 'bloquée par {story}', pulled: 'ajoutée comme dépendance', epic: 'Épic', resultTitle: 'Création terminée',
  },
}

const EN = {
  invest: {
    I: ['Independent', 'deliverable without waiting on a held-back story, no cycle'],
    N: ['Negotiable', 'states the need, not the solution'],
    V: ['Valuable', 'a business benefit for a named role'],
    E: ['Estimable', 'clear enough to be sized'],
    S: ['Small', '1 to 8 points, 3 to 7 criteria'],
    T: ['Testable', 'each criterion checks against an example'],
  },
  dor: {
    1: ['Problem statement', 'an observable need, not "implement X"'],
    2: ['Specific persona', 'a named role, never "user"'],
    3: ['Domain examples', 'at least 3, with real values'],
    4: ['Acceptance scenarios', 'Given / When / Then, 3 to 7'],
    5: ['Criteria derived from examples', 'each criterion starts from an example'],
    6: ['Right-sized', 'effort 1, 2, 3, 5 or 8, with a reason'],
    7: ['Technical notes', 'context, references, how to test'],
    8: ['Dependencies listed', 'the map’s, each with its reason'],
  },
  rules: {
    'id-mismatch': ['The file carries id {found}, the map plans {planned}.', 'Use the map’s id.'],
    'epic-mismatch': ['The file sits under {found}, the map under {planned}.', 'Use the map’s epic.'],
    'field-missing': ['Field {field} is empty.', 'Fill it in.'],
    'persona-missing': ['The file names no persona.', 'Name the role that benefits.'],
    'statement-missing': ['The "As a… I want… so that…" statement is incomplete ({part}).', 'Complete the statement.'],
    'vague-persona': ['"{persona}" names no specific role (Vague Persona).', 'Use the PRD role that benefits.'],
    'implement-x': ['"{iWant}" describes an implementation, not a need (Implement-X).', 'Say what the persona can do or observe.'],
    'examples-too-few': ['{count} domain {count|example|examples}, at least {min} needed (No Examples).', 'Add real cases, one of them an edge or a refusal.'],
    'example-incomplete': ['An example has no id or no text.', 'Give every example an id and a text.'],
    'generic-data': ['{example} carries no concrete value (Generic Data).', 'Use names, amounts, dates.'],
    'criteria-too-few': ['{count} acceptance {count|criterion|criteria}, at least {min} needed.', 'Write one criterion per example.'],
    'criteria-too-many': ['{count} criteria: past {max}, the story is too big (Giant Story).', 'Split the story.'],
    'criterion-incomplete': ['{criterion}: its "{part}" is missing.', 'Complete Given / When.'],
    'criterion-no-outcome': ['{criterion} states no observable outcome.', 'Write at least one checkable "Then".'],
    'criterion-no-example': ['{criterion} starts from no example of the story.', 'Tie it to the example it checks.'],
    'criterion-unknown-requirement': ['{criterion} covers {requirement}, which the PRD does not define.', 'Fix the id.'],
    'requirement-uncarried': ['No criterion proves {requirement}, which the map gives this story.', 'Add or extend a criterion that covers it.'],
    'technical-ac': ['{criterion} speaks of internals ("{found}") instead of the business (Technical AC).', 'Describe the behaviour the persona sees.'],
    'tasks-missing': ['No task is listed.', 'List the work, each task with the criteria it serves.'],
    'task-incomplete': ['A task has no text.', 'Describe the task.'],
    'task-unknown-criterion': ['A task serves {criterion}, which is no criterion of the story.', 'Fix the reference.'],
    'criterion-unserved': ['No task serves {criterion}.', 'Tie {criterion} to a task.'],
    'technical-notes-empty': ['Technical notes are empty.', 'Write "None identified" when there is none.'],
    'references-missing': ['The notes cite no PRD passage.', 'Cite the requirements to open, with why.'],
    'context-missing': ['The notes give no useful context.', 'Sum up decisions, thresholds and boundaries.'],
    'testing-missing': ['The notes do not say how the criteria are proven.', 'Say which test proves each criterion.'],
    'dependencies-not-list': ['Dependencies are not a list.', 'Write [] when there is none.'],
    'dependencies-mismatch': ['The file waits on [{found}], the map plans [{planned}] (Missing Dependencies).', 'Use exactly the map’s dependencies.'],
    'dependency-no-reason': ['{story} is listed without a reason.', 'Say what the story needs from {story}.'],
    'dependency-no-story': ['Dependency {index} names no story.', 'Write { "story": "<id>", "reason": "…" }.'],
    'effort-off-scale': ['Effort {found} is not on the scale {scale}.', 'Pick 1, 2, 3, 5 or 8; above, split.'],
    'effort-split': ['{points} points: more than one day of AI-assisted work (above {max}) — a warning.', 'A split is recommended: see the proposed corrections.'],
    'integrations-many': ['{count} external integrations ({integrations}): a story integrates one.', 'Split by interface, one story per integration.'],
    'too-small': ['{points} point and {criteria} criteria: too small to carry value alone?', 'Merge it with a neighbour, or give it a journey of its own.'],
    'effort-no-rationale': ['The effort has no rationale.', 'One sentence: criteria, integrations, unknowns.'],
    'held-blocker': ['It waits on {story}, which is held back.', 'Make {story} ready, or drop the dependency in the map.'],
    'effort-at-limit': ['Effort {points}: the top of the scale.', 'Consider a split.'],
    'open-questions': ['{count} open {count|question remains|questions remain}.', 'Settle them before sizing.'],
  },
  states: { unwritten: 'to write', refused: 'refused', written: 'written', held: 'held back', ready: 'ready', published: 'published' },
  reviews: { none: 'to review', reviewed: 'reviewed', stale: 'file changed since the review' },
  missing: { unknown: 'unknown', 'not-ready': 'not ready', 'not-reviewed': 'not reviewed', 'review-stale': 'review out of date', 'not-planned': 'not in the plan' },
  sources: { check: 'check', lens: 'lens', map: 'map' },
  antipatterns: { 'Implement-X': 'Implement-X', 'Giant Story': 'Giant Story', 'No Examples': 'No Examples', 'Technical AC': 'Technical AC', 'Generic Data': 'Generic Data', 'Tests After Code': 'Tests After Code', 'Vague Persona': 'Vague Persona', 'Missing Dependencies': 'Missing Dependencies' },
  severities: { low: 'low', medium: 'medium', high: 'high', blocker: 'blocker' },
  responses: {
    pending: 'file to write',
    noDependency: 'no dependency',
    waits: 'waits on {after}',
    held: 'waits on {held}, held back',
    quote: '"{value}"',
    missing: 'missing',
    effort: '{points} pts · {tasks} {tasks|task|tasks}',
    size: '{points} pts · {criteria} {criteria|criterion|criteria}',
    testable: '{criteria} {criteria|criterion|criteria} · {examples} {examples|example|examples}',
    persona: '{persona}',
    examples: '{examples} {examples|example|examples}',
    criteria: '{criteria} {criteria|criterion|criteria}',
    derived: '{linked}/{criteria} derived',
    points: '{points} pts',
    notes: '{notes} {notes|note|notes}',
    dependencies: '{dependencies}',
  },
  ui: {
    title: 'Backlog', plan: 'Flight plan', invest: 'INVEST', dor: 'Definition of Ready', lenses: 'Lens review', sheet: 'Story sheet',
    asA: 'As', iWant: 'I want', soThat: 'so that', examples: 'Examples', criteria: 'Acceptance criteria',
    tasks: 'Tasks', notes: 'Notes', dependencies: 'Dependencies', questions: 'Open questions', given: 'Given', when: 'When', then: 'Then',
    coverage: '{covered}/{fr} FR covered · {deferred} deferred', reviewed: '{reviewed}/{ready} ready stories reviewed', markReviewed: 'Mark reviewed',
    unmarkReviewed: 'Withdraw review', preview: 'Dry run', create: 'Create {count} {count|issue|issues}', createIdle: 'Create the issues',
    repo: 'Repository', noRepo: 'no repository', empty: 'No backlog in this workspace. Run the skraft-prd-backlog workflow.',
    filterAll: 'All', filterTodo: 'To review', filterRefused: 'Refused', filterHeld: 'Held back', filterReady: 'Ready', filterPublished: 'Published',
    search: 'Filter by id or title', why: 'Why', fix: 'Fix', seeSheet: 'See in the sheet', mapProblems: 'Story map problems',
    noFinding: 'No lens finding.', tracer: 'tracer', effortUnit: 'pts', previewTitle: 'Planned creation', created: 'Created', existing: 'Existing',
    linked: 'Linked', skipped: 'Skipped', failed: 'Failed', dryRun: 'Dry run', planned: 'to create', missingTitle: 'Stories blocking the creation', requiredBy: 'required by {via}',
    unplaced: 'points at no INVEST letter and no DoR item', epicFindings: 'Findings on the epic', menu: 'Stories',
    destination: 'to', waiting: '{count} {count|dependency|dependencies} waiting', jump: 'Go to line {line}',
    signoff: 'Human review', signoffChallenge: 'reviewed and accepted as is before creation', signed: 'reviewed on {at}', nothingToReview: 'not ready, nothing to review',
    opCreate: 'to create', opLink: 'to link', opExisting: 'exists', opCreated: 'created', opLinked: 'linked', opSkipped: 'skipped', opFailed: 'failed',
    subIssueOf: 'sub-issue of {epic}', blockedBy: 'blocked by {story}', pulled: 'added as a dependency', epic: 'Epic', resultTitle: 'Creation done',
  },
}

export const DICTIONARIES = Object.freeze({ fr: FR, en: EN })

/** @param {string} language @returns {typeof FR} */
export const dictionary = (language) => (language === 'fr' ? FR : EN)

/** @param {string} language @param {string} key @param {Record<string, unknown>} [params] */
export const ui = (language, key, params) => format(dictionary(language).ui[key] ?? key, params, language)

/**
 * The name and the challenge of a checklist line: an INVEST letter or a DoR item.
 * @param {string} language @param {string} line
 */
export const lineLabel = (language, line) => {
  const words = dictionary(language)
  const [name, challenge] = /\d/.test(line) ? words.dor[line] : words.invest[line]
  return { name, challenge }
}

/**
 * Why a piece of evidence fails a line, and how to fix it. A lens finding speaks for itself: its
 * description and its suggestion.
 * @param {string} language @param {{ source: string, rule?: string, params?: Record<string, unknown>, message: string, suggestion?: string }} evidence
 */
export const explanation = (language, evidence) => {
  const known = evidence.rule ? dictionary(language).rules[evidence.rule] : undefined
  if (evidence.source === 'lens' || !known) return { why: evidence.message, fix: evidence.suggestion ?? '' }
  return { why: format(known[0], evidence.params, language), fix: format(known[1], evidence.params, language) }
}

/**
 * What a line found, in a few words: the response of the checklist.
 * @param {string} language @param {string} line @param {{ status: string, facts: Record<string, any> }} value
 */
export const response = (language, line, { status, facts }) => {
  const r = dictionary(language).responses
  if (status === 'pending') return r.pending
  const say = (template, params) => format(template, params, language)
  const quote = (text) => (text ? say(r.quote, { value: text }) : r.missing)
  switch (line) {
    case 'I': return facts.held.length ? say(r.held, facts) : facts.after.length ? say(r.waits, facts) : r.noDependency
    case 'N': case '1': return quote(facts.iWant)
    case 'V': return `${facts.persona} · ${quote(facts.soThat)}`
    case 'E': return facts.tasks === null ? say(r.points, facts) : say(r.effort, facts)
    case 'S': return facts.criteria === null ? say(r.points, facts) : say(r.size, facts)
    case 'T': return say(r.testable, facts)
    case '2': return say(r.persona, facts)
    case '3': return say(r.examples, facts)
    case '4': return say(r.criteria, facts)
    case '5': return say(r.derived, facts)
    case '6': return say(r.points, facts)
    case '7': return say(r.notes, facts)
    default: return facts.dependencies.length ? say(r.dependencies, facts) : r.noDependency
  }
}
