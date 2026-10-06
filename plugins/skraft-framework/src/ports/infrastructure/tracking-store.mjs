// Port for one project's tracking directory ({trackingRoot}/{slug}/), addressed by the
// tracking-relative paths the state records.
// Contract:
//   exists(slug, path) => Promise<boolean>
//   read(slug, path)   => Promise<string>     rejects when absent
//   list(slug)         => Promise<string[]>   every file, tracking-relative, '/'-separated
//   write(slug, path, text) => Promise<void>
//   prefix(slug)       => string              repository-relative directory, ending in '/'
//                                             (how agents are told where to write)
export const TRACKING_STORE_PORT = 'TrackingStore'
