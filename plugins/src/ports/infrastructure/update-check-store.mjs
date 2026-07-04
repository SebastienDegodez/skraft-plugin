// Port for the machine-global update-check store. Persists the last check
// timestamp and the last known latest release. Reads fail open to null;
// writes are best-effort (ADR-006: the staleness notice is observability,
// never a gate).
export const UPDATE_CHECK_STORE_PORT = 'UpdateCheckStore'
