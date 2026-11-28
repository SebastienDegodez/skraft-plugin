import { code, inert, oneLine } from '../reporting/markdown-safety.mjs'
import { DESIGN_PLUGIN } from './light-design.mjs'

/**
 * The words of a CI design run's question comments, per story language: the headings, the effect
 * of each answer by the kind of question, and why a step is blocked (#662).
 */

/** A story the architect cannot design, on one line: its number and the reason it gave. @param {string} colon @returns {(story: { issue: number, reason: string }) => string} */
const storyLine = (colon) => ({ issue, reason }) => `- #${issue}${colon} ${inert(oneLine(reason))}`

/** An open design branch and a context it changes too. @param {string} verb @param {{ branch: string, context: string }} overlap */
const overlapLine = (verb, { branch, context }) => `- ${code(branch)} ${verb} ${code(context)}`

/** A table of rows, its header first. @param {string[]} head @param {string[][]} rows */
const table = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.map((one) => inert(oneLine(one)).replaceAll('|', '\\|')).join(' | ')} |`)]

/** A list under a bold heading, nothing when it lists nothing. @param {string} heading @param {string[]} items */
const listed = (heading, items) => (items.length === 0 ? [] : [`**${heading}**`, ...items.map((item) => `- ${inert(oneLine(item))}`), ''])

/** The end of a run's output, folded, in a fence no line of it can close. @param {string} summary @param {string | null} tail @param {string} none */
const folded = (summary, tail, none) => (tail === null ? [none] : [`<details><summary>${summary}</summary>`, '', '````text', ...tail.replaceAll('````', '```').split('\n'), '````', '', '</details>'])

/** The scenarios, the order DELIVER builds them in, and their red. @param {any} words @param {any} facts */
const scenarioLines = (words, { scenarios, features, groups, skeleton, exemption, red, redTail }) => [
  `**${words.scenarios(scenarios.length)}**`, '',
  ...table(['#', words.scenario, words.component, words.tags], scenarios.map(({ index, title, component, tags }) => [`S${index}`, title, component, tags.join(' ')])), '',
  ...(features.length === 0 ? [] : [words.writtenIn(features.map(code).join(', ')), '']),
  `**${words.order}**`, ...groups.map(({ index, scenarios: numbers }) => `${index}. ${numbers.map((number) => `S${number}`).join(', ')}`), '',
  ...(skeleton === null ? [words.noSkeleton(inert(oneLine(String(exemption)))), ''] : []),
  `**${words.red}** ${red.sha.slice(0, 7)} ${code(red.subject)} — ${red.files.map(code).join(', ')}`, '',
  words.checkRed, '', ...folded(words.redRun, redTail, words.noRedRun),
]

/** The light design a person reads: its brief, each ADR's decision, what it assumed, what goes beyond. @param {any} words @param {any} facts */
const lightLines = (words, { brief, adrs, assumptions, reasons }) => [
  words.wrote(code(brief)), '',
  ...(adrs.length === 0 ? [] : [`**${words.adrs}**`, '', ...table([words.adr, words.decision], adrs.map(({ path, decision }) => [path, decision])), '']),
  ...listed(words.assumedHeading, assumptions),
  ...listed(words.beyond, reasons),
]

/** @param {string} agent @param {number} attempt */
const twiceEn = (agent, attempt) => `${agent} failed the same way on attempts ${attempt - 1} and ${attempt}.`
/** @param {string} agent @param {number} attempt */
const twiceFr = (agent, attempt) => `${agent} a échoué de la même façon aux essais ${attempt - 1} et ${attempt}.`

/** The sentence a design run's blocking questions end with, so that a person in a chat knows REFRESH is an answer; a comment says it in its table instead. */
export const REFRESH_SENTENCE = ' REFRESH takes the default branch as it is now, detects the components again and designs again from RESEARCH, in this run.'

export const QUESTION_WORDS = Object.freeze({
  en: Object.freeze({
    instructionTitle: 'The run waits on your instruction',
    decisionTitle: 'A decision waits on you',
    questionsTitle: (count) => `The architect's questions (${count})`,
    answeredTitle: 'Question answered',
    askedAsIs: 'The question as it was asked',
    intro: { issue: 'skraft-design waits on a person before it designs anything; answer in one comment on this issue.', 'pull-request': 'skraft-design waits on a person; answer in one comment on this pull request.' },
    blocks: (step) => `What blocks ${step}`,
    left: (from, count) => `What ${from} left (${count})`,
    question: 'The question',
    answers: 'Your answers',
    answer: 'Answer', effect: 'Effect',
    option: 'Option', choice: 'Choice', consequence: 'Consequence', assumed: 'assumed meanwhile',
    reply: 'Reply in one comment:',
    replyAll: 'Reply in one comment, one line per question:',
    ownWords: 'Your own words answer too, such as `Q1: B everywhere`.',
    yourInstruction: 'your instruction, in your own words',
    instructionExample: '<your instruction>',
    optionOrWords: '<option or your words>',
    recorded: 'Recorded answer:',
    recordedFrom: (author) => `Recorded answer, from ${author}:`,
    key: (key) => `Key: ${key}`,
    causes: {
      'agent-blocked': ({ agent }) => `${agent} cannot go on.`,
      breaker: ({ agent, attempt }) => twiceEn(agent, attempt),
      ceiling: ({ agent, attempt }) => `${agent} still failed after ${attempt} attempts.`,
      'loop-ceiling': ({ from, step }) => `${from} → ${step} ran as often as the workflow allows.`,
      'lens-inconclusive': () => 'A review lens could not conclude.',
    },
    effects: {
      instruction: 'runs the step again on a new pass, with what it left and your words',
      REFRESH: 'takes the default branch as it is now, detects the components again and designs again from RESEARCH',
      STOP: 'ends the run',
      'architecture-blocked': { CONTINUE: 'goes on without the blocked stories' },
      'architecture-exclusions': { CONTINUE: 'goes on without the excluded stories' },
      'architecture-concurrent': { CONTINUE: 'publishes this design anyway' },
      'architecture-wait': { RESUME: `reads the merged base again, once ${DESIGN_PLUGIN} merged a brief for the story`, CONTINUE: 'delivers on a light design instead' },
      'light-design-review': { APPROVED: 'ratifies its ADRs, accepted on the merge of the delivery pull request, and goes on to DISTILL', REVISE: 'sends the light design back with your corrections', DESIGN: `pauses the delivery until ${DESIGN_PLUGIN} merges a brief for the story` },
      'scenario-review': { APPROVED: 'DELIVER makes them pass', REVISE: 'sends DISTILL back with your corrections' },
      'architecture-refresh': { KEEP: 'delivers on the merged brief as it is', REDESIGN: 'pauses the delivery for a new design of the story' },
    },
    refusalHint: (refusal) => `${refusal} takes your corrections after it, on its line or the next ones: \`/skraft-answer ${refusal} <your corrections>\`.`,
    scenarios: (count) => `The story's scenarios (${count})`, scenario: 'Scenario', component: 'Component', tags: 'Tags',
    writtenIn: (files) => `Written in ${files}.`,
    order: 'The order DELIVER makes them pass in',
    noSkeleton: (exemption) => `The story has no walking skeleton: ${exemption}`,
    red: 'Their red:',
    checkRed: 'skraft does not run them: check that each fails on its own assertion.',
    redRun: 'The end of the designer\'s traced run of them',
    noRedRun: 'The designer traced no run of them: ask for it with REVISE.',
    wrote: (brief) => `The light design wrote ${brief}.`,
    adrs: 'ADRs to ratify', adr: 'ADR', decision: 'Decision',
    assumedHeading: 'What it assumed where the story leaves a choice open',
    beyond: 'What goes beyond a light design (DESIGN is advised)',
    texts: {
      'architecture-wait': ({ issue, why, merged, branch }) => [`The delivery of #${issue} waits for a design: ${inert(oneLine(why ?? 'a person asked for one at its light design.'))}`,
        ...(merged === null ? [] : ['', `The merged base now reads: ${inert(oneLine(merged))}`]), '', `Run ${DESIGN_PLUGIN} on #${issue} and merge its pull request, check out ${code(branch)} again, then answer RESUME.`],
      'light-design-review': (facts) => lightLines(QUESTION_WORDS.en, facts),
      'scenario-review': (facts) => scenarioLines(QUESTION_WORDS.en, facts),
      'architecture-refresh': ({ brief }) => [`The story's issue changed since its brief ${code(brief)} was designed.`],
      'architecture-blocked': ({ stories }) => ['The architect cannot design these stories:', ...stories.map(storyLine(':')), '', 'Go on without them, or stop. Refine the stories left out with /skraft-refine.'],
      'architecture-concurrent': ({ overlaps }) => ['Other open design branches change contexts this run changes:', ...overlaps.map((one) => overlapLine('also changes the context', one)), '', 'Publish this design anyway, or stop and design again once they are merged.'],
    },
    refreshConflict: 'REFRESH could not take the default branch into this run\'s branch: Git stopped on a conflict and undid the merge. Merge the default branch into the branch yourself, then answer REFRESH again.',
  }),
  fr: Object.freeze({
    instructionTitle: 'Le run attend votre instruction',
    decisionTitle: 'Une décision vous attend',
    questionsTitle: (count) => `Les questions de l’architecte (${count})`,
    answeredTitle: 'Question répondue',
    askedAsIs: 'La question telle qu’elle a été posée',
    intro: { issue: 'skraft-design attend une personne avant de concevoir quoi que ce soit ; répondez en un seul commentaire sur cette issue.', 'pull-request': 'skraft-design attend une personne ; répondez en un seul commentaire sur cette pull request.' },
    blocks: (step) => `Ce qui bloque ${step}`,
    left: (from, count) => `Ce que ${from} a laissé (${count})`,
    question: 'La question',
    answers: 'Vos réponses',
    answer: 'Réponse', effect: 'Effet',
    option: 'Option', choice: 'Choix', consequence: 'Conséquence', assumed: 'hypothèse retenue en attendant',
    reply: 'Répondez en un seul commentaire :',
    replyAll: 'Répondez en un seul commentaire, une ligne par question :',
    ownWords: 'Vos propres mots répondent aussi, par exemple `Q1: B partout`.',
    yourInstruction: 'votre instruction, avec vos mots',
    instructionExample: '<votre instruction>',
    optionOrWords: '<option ou vos mots>',
    recorded: 'Réponse enregistrée :',
    recordedFrom: (author) => `Réponse enregistrée, de ${author} :`,
    key: (key) => `Clé : ${key}`,
    causes: {
      'agent-blocked': ({ agent }) => `${agent} ne peut pas continuer.`,
      breaker: ({ agent, attempt }) => twiceFr(agent, attempt),
      ceiling: ({ agent, attempt }) => `${agent} échoue encore après ${attempt} essais.`,
      'loop-ceiling': ({ from, step }) => `${from} → ${step} a tourné autant que le workflow le permet.`,
      'lens-inconclusive': () => 'Une lentille de revue n’a pas pu conclure.',
    },
    effects: {
      instruction: 'relance l’étape sur une nouvelle passe, avec ce qu’elle a laissé et vos mots',
      REFRESH: 'reprend la branche par défaut telle qu’elle est, détecte à nouveau les composants et repart de RESEARCH',
      STOP: 'arrête le run',
      'architecture-blocked': { CONTINUE: 'continue sans les stories bloquées' },
      'architecture-exclusions': { CONTINUE: 'continue sans les stories exclues' },
      'architecture-concurrent': { CONTINUE: 'publie ce design quand même' },
      'architecture-wait': { RESUME: `relit la base fusionnée, une fois que ${DESIGN_PLUGIN} a fusionné un brief pour la story`, CONTINUE: 'livre plutôt sur un design léger' },
      'light-design-review': { APPROVED: 'ratifie ses ADR, acceptés à la fusion de la pull request de livraison, et passe à DISTILL', REVISE: 'renvoie le design léger avec vos corrections', DESIGN: `met la livraison en pause jusqu’à ce que ${DESIGN_PLUGIN} fusionne un brief pour la story` },
      'scenario-review': { APPROVED: 'DELIVER les fait passer', REVISE: 'renvoie DISTILL avec vos corrections' },
      'architecture-refresh': { KEEP: 'livre sur le brief fusionné tel qu’il est', REDESIGN: 'met la livraison en pause pour un nouveau design de la story' },
    },
    refusalHint: (refusal) => `${refusal} prend vos corrections après lui, sur sa ligne ou les suivantes : \`/skraft-answer ${refusal} <vos corrections>\`.`,
    scenarios: (count) => `Les scénarios de la story (${count})`, scenario: 'Scénario', component: 'Composant', tags: 'Étiquettes',
    writtenIn: (files) => `Écrits dans ${files}.`,
    order: 'L’ordre dans lequel DELIVER les fait passer',
    noSkeleton: (exemption) => `La story n’a pas de walking skeleton : ${exemption}`,
    red: 'Leur rouge :',
    checkRed: 'skraft ne les lance pas : vérifiez que chacun échoue sur sa propre assertion.',
    redRun: 'La fin du run tracé du designer',
    noRedRun: 'Le designer n’en a tracé aucun run : demandez-le avec REVISE.',
    wrote: (brief) => `Le design léger a écrit ${brief}.`,
    adrs: 'ADR à ratifier', adr: 'ADR', decision: 'Décision',
    assumedHeading: 'Ce qu’il a supposé là où la story laisse un choix ouvert',
    beyond: 'Ce qui dépasse un design léger (DESIGN est conseillé)',
    texts: {
      'architecture-wait': ({ issue, why, merged, branch }) => [`La livraison de #${issue} attend un design : ${inert(oneLine(why ?? 'une personne en a demandé un à son design léger.'))}`,
        ...(merged === null ? [] : ['', `La base fusionnée indique maintenant : ${inert(oneLine(merged))}`]), '', `Lancez ${DESIGN_PLUGIN} sur #${issue} et fusionnez sa pull request, revenez sur ${code(branch)}, puis répondez RESUME.`],
      'light-design-review': (facts) => lightLines(QUESTION_WORDS.fr, facts),
      'scenario-review': (facts) => scenarioLines(QUESTION_WORDS.fr, facts),
      'architecture-refresh': ({ brief }) => [`L’issue de la story a changé depuis la conception de son brief ${code(brief)}.`],
      'architecture-blocked': ({ stories }) => ['L’architecte ne peut pas concevoir ces stories :', ...stories.map(storyLine(' :')), '', 'Continuez sans elles, ou arrêtez. Affinez les stories laissées de côté avec /skraft-refine.'],
      'architecture-concurrent': ({ overlaps }) => ['D’autres branches de design ouvertes changent des contextes que ce run change :', ...overlaps.map((one) => overlapLine('change aussi le contexte', one)), '', 'Publiez ce design quand même, ou arrêtez et concevez à nouveau une fois qu’elles sont fusionnées.'],
    },
    refreshConflict: 'REFRESH n’a pas pu reprendre la branche par défaut dans la branche de ce run : Git s’est arrêté sur un conflit et a annulé la fusion. Fusionnez vous-même la branche par défaut dans la branche, puis répondez REFRESH à nouveau.',
  }),
})
