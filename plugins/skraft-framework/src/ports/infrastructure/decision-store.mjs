// Port for human answers recorded against a checkpoint key, so an answer outlives the
// session that asked.
// Contract:
//   read(slug, key)                 => Promise<string | null>   null when none recorded
//   write(slug, key, answer, by)    => Promise<void>
export const DECISION_STORE_PORT = 'DecisionStore'
