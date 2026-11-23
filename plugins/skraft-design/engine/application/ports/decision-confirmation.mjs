/**
 * DecisionConfirmation — how a recorded decision is known to come from a person. A typed
 * `skraft decide` needs none (by: `decide`); a host where a model can call the decide tool asks
 * the person in its own dialog first (Copilot: by: `host-confirmed`).
 *
 * @typedef {{ slug: string, key: string, answer: string }} DecisionRequest
 * @typedef {{ ok: true } | { ok: false, code: string, reason: string }} Confirmed
 *   reason: fixed by the host's code, never a value the request carried.
 * @typedef {{ by: string, confirm: (request: DecisionRequest) => Promise<Confirmed> }} DecisionConfirmation
 *   by: the provenance the journal records with the answer.
 */
export {}
