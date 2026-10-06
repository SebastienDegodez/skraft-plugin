// Port for the active pipeline the settings hooks guard (G1, G7, G8, G9). Hook payloads
// carry no project slug: the hooks read the pointer the state CLI and RunPipeline record.
// Contract: activate(slug) => Promise<void>   the slug the next hook calls evaluate
export const ACTIVE_PIPELINE_PORT = 'ActivePipeline'
