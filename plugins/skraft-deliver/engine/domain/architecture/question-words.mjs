/**
 * The words of a CI design run's question comments, per story language: the headings, the effect
 * of each answer by the kind of question, and why a step is blocked (#662).
 */

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
    intro: { issue: 'skraft-deliver waits on a person before it designs anything; answer in one comment on this issue.', 'pull-request': 'skraft-deliver waits on a person; answer in one comment on this pull request.' },
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
    },
  }),
  fr: Object.freeze({
    instructionTitle: 'Le run attend votre instruction',
    decisionTitle: 'Une décision vous attend',
    questionsTitle: (count) => `Les questions de l’architecte (${count})`,
    answeredTitle: 'Question répondue',
    intro: { issue: 'skraft-deliver attend une personne avant de concevoir quoi que ce soit ; répondez en un seul commentaire sur cette issue.', 'pull-request': 'skraft-deliver attend une personne ; répondez en un seul commentaire sur cette pull request.' },
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
    },
  }),
})
