/**
 * Whether the run is over because the host cancelled or paused it: its `ctx.signal` is aborted.
 * The SDK aborts it before it rejects pending calls (SDK 1.0.101 source, `awaitWorkflowOperation`;
 * read, not measured by the probe). A cancellation is rethrown; any other error, an `AbortError`
 * included, is the failure of what threw it.
 * @param {AbortSignal | undefined} signal the run's, captured when it started
 * @returns {boolean}
 */
export const isCancellation = (signal) => signal?.aborted === true
