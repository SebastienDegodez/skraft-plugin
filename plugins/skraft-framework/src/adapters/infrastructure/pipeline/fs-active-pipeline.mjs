import { createActiveSlugStore } from '../active-slug-store.mjs'

// ActivePipeline (ports/infrastructure/active-pipeline.mjs) on the existing pointer file
// {trackingRoot}/.active-slug, the one cli/state.mjs init/select writes and cli/hook.mjs reads.
export const createFsActivePipeline = ({ trackingRoot }) => {
  const store = createActiveSlugStore(trackingRoot)
  return Object.freeze({ activate: async (slug) => store.write(slug), current: async () => store.read() })
}
