// Inbound port: follow a pipeline, read-only.
// Contract:
//   snapshot(slug)           => Promise<PipelineView>   (domain/pipeline/pipeline-view-policy.mjs)
//   readTracked(slug, path)  => Promise<string | null>  a Markdown or JSON tracking file the view lists
//   pipelines()              => Promise<PipelineSummary[]>  every tracked pipeline (pipeline-selection-policy)
//   locate(requested?)       => Promise<{ slug, reason, chooser }>  the pipeline to show: the one
//                               requested, else the current branch's, the active one, the only one;
//                               slug null with the chooser view when none fits
// Implemented by application/pipeline/observe-pipeline.mjs; driven by the Copilot app canvas
// (adapters/api/copilot-canvas/).
export const OBSERVE_PIPELINE_INTERFACE = 'ObservePipelineInterface'
