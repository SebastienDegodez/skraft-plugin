// What the Workflow tab draws of a review, from the plugin's workflows as the engine reads them in a
// working copy: its lenses, then the refuter they join, which runs finding-refuter.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createObserve } from '../../../../plugins/skraft-framework/engine/application/pipeline/observe-usecase.mjs'
import { renderWorkflows } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/canvas-ui/view.js'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { workingCopy } from '../copilot-workflow/simulated-host.mjs'
import { PLUGIN_ROOT } from '../support/workspace.mjs'

/** The card of a step, as the tab draws it. @param {string} html @param {string} id */
const card = (html, id) => new RegExp(`<article [^>]*data-node="${id}"[^>]*>([\\s\\S]*?)</article>`).exec(html)?.[1] ?? ''

test('the Workflow tab shows, under each review and each call, the refuter its lenses join and the agent it runs; a step that is no review shows none', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const workflows = await createObserve(createNodeAdapters({ cwd, pluginRoot: PLUGIN_ROOT, home: `${cwd}-home` })).workflows()

  const pipeline = renderWorkflows(workflows, 'pipeline', 'en')
  for (const [id, refuter] of [['design_review', 'design_review_refuter'], ['distill_review', 'distill_review_refuter'], ['deliver_review', 'refuter'], ['mutation_review', 'mutation_review_refuter']]) {
    assert.match(card(pipeline, id), new RegExp(`<p class="refuter">.*<code>${refuter}</code> runs <code>finding-refuter</code> <span class="badge">mandatory</span></p>`), id)
  }
  assert.doesNotMatch(card(pipeline, 'gates'), /class="refuter"/)
  assert.match(card(renderWorkflows(workflows, 'review', 'fr'), 'verdict'), /<p class="refuter">.*<code>refuter<\/code> lance <code>finding-refuter<\/code> <span class="badge">obligatoire<\/span><\/p>/)
})
