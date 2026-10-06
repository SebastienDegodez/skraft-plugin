// Inbound port: follow a pipeline, read-only.
// Contract:
//   snapshot(slug)           => Promise<PipelineView>   (domain/pipeline/pipeline-view-policy.mjs)
//   readTracked(slug, path)  => Promise<string | null>  a Markdown or JSON tracking file the view lists
// Implemented by application/pipeline/observe-pipeline.mjs; driven by the Copilot app canvas
// (adapters/api/copilot-canvas/).
export const OBSERVE_PIPELINE_INTERFACE = 'ObservePipelineInterface'
