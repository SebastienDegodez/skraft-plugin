import { fileURLToPath } from 'node:url'
import { pendingDocIds } from './pending.mjs'

// TEMPORARY (see pending.mjs): one placeholder route per page not converted yet.
export default function pendingPagesPlugin(context) {
  return {
    name: 'skraft-pending-pages',
    async contentLoaded({ actions }) {
      const component = fileURLToPath(new URL('../../src/components/PendingPage/index.js', import.meta.url))
      for (const id of pendingDocIds()) {
        actions.addRoute({ path: `${context.baseUrl}${id}`, component, exact: true })
      }
    },
  }
}
