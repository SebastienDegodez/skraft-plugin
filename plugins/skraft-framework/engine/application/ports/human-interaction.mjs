/**
 * HumanInteraction — the host puts one question to a human. Drivers implement it (`$.ui.ask`,
 * `ctx.pause`); the engine reads and journals whatever comes back.
 *
 * @typedef {import('../../domain/decisions/questions.mjs').Question} Question
 * @typedef {{ answer: string, reason: string | null }} HumanAnswer
 *   answer: as the human gave it; reason: what they wrote with it, null without.
 * @typedef {{ ask: (question: Question) => Promise<HumanAnswer | null>, by?: string, show?: (view: 'configuration') => Promise<void> }} HumanInteraction
 *   ask: null when nobody answers now (the dialog was dismissed, no one is there, the host has
 *   no dialog): the run waits for `skraft decide`. by: how the journal says the answer came from a
 *   person (`host-confirmed`, `cli-tty`), `host` when absent. A host that pauses the run instead (Copilot's
 *   `ctx.pause`) may throw its own pause once the question is journaled. show: puts what a question
 *   is about in front of the person before it is asked (the configuration); never throws, and a
 *   host without it shows nothing.
 */
export {}
