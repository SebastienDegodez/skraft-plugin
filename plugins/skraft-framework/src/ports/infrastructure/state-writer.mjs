// Port constant for the StateWriter outbound port (ADR-008).
// Duck-typed contract: { write(projectSlug: string, state: object): Promise<Result<void>> }
// Ok(undefined) on success.
// Err({ code: 'IO_ERROR' | 'CORRUPTED_STATE', reason: string }) on failure.
// MUST NOT throw — exceptions caught and wrapped as Err.
export const STATE_WRITER_PORT = 'StateWriter'
