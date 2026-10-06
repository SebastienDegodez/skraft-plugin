// Port for the active pipeline the settings hooks guard (G7, G8). Hook payloads carry no
// project slug: the hooks read the pointer the state CLI and RunPipeline record. A viewer
// (the Copilot app canvas) opened without a slug follows the same pointer.
// Contract:
//   activate(slug) => Promise<void>            the slug the next hook calls evaluate
//   current()      => Promise<string | null>   the recorded slug; null when none or malformed
export const ACTIVE_PIPELINE_PORT = 'ActivePipeline'
