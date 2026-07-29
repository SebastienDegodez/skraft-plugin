// Per-invocation transcript reader factory (Contract 6).
// Validates the transcript array from the hook payload and returns a reader.
// Throws TRANSCRIPT_UNAVAILABLE if the transcript is absent or empty (ADR-006: caller must fail-open).
export const createJsonlTranscriptReader = ({ transcript }) => ({
  read: async () => {
    if (!Array.isArray(transcript) || transcript.length === 0) {
      throw new Error('TRANSCRIPT_UNAVAILABLE')
    }
    return JSON.stringify(transcript)
  }
})
