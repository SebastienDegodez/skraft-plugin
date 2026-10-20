/**
 * HumanInteraction — the host puts one question to a human. Drivers implement it (`$.ui.ask`,
 * `ctx.pause`); the engine reads and journals whatever comes back.
 *
 * @typedef {import('../../domain/decisions/questions.mjs').Question} Question
 * @typedef {{ answer: string, reason: string | null }} HumanAnswer
 *   answer: as the human gave it; reason: what they wrote with it, null without.
 * @typedef {{ ask: (question: Question) => Promise<HumanAnswer | null> }} HumanInteraction
 *   ask: null when nobody answers now (the dialog was dismissed, no one is there, the host has
 *   no dialog): the run waits for `skraft decide`. A host that pauses the run instead (Copilot's
 *   `ctx.pause`) may throw its own pause once the question is journaled.
 */
export {}
