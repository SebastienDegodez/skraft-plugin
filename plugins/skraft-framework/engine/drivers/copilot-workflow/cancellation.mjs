/**
 * Whether an error ends the run because the host cancelled or paused it. The SDK aborts the run's
 * `ctx.signal` and rejects pending calls with an `AbortError` (SDK 1.0.101 source, `awaitWorkflowOperation`;
 * documented, not measured by the probe): either one is a cancellation, which is rethrown, never
 * turned into an outcome or an agent failure.
 * @param {unknown} error @param {AbortSignal | undefined} signal the run's, captured when it started
 * @returns {boolean}
 */
export const isCancellation = (error, signal) => signal?.aborted === true || Object(error).name === 'AbortError'
