// Port for reporting pipeline progress to the person watching.
// Contract: phase(title: string) => void, log(message: string) => void. Fire and forget.
export const PIPELINE_PROGRESS_PORT = 'PipelineProgress'
