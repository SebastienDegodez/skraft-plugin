// Port for asking the human a checkpoint question (ADR ratification, environment fix,
// rejected phase).
// Contract: ask({ key, question, options }) => Promise<string | null>
//   key     — stable: the same question asked again after a resume carries the same key.
//   null    — nobody can answer now; the pipeline stops as awaiting-human.
//   A host may suspend instead of answering (a Copilot workflow pauses its run).
export const HUMAN_INTERACTION_PORT = 'HumanInteraction'
