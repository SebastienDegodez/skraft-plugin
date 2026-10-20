// Model families a Claude Code agent file declares, ordered by cost/capability rank.
const FAMILY_RANK = Object.freeze({ haiku: 0, sonnet: 1, opus: 2 })

export const MODEL_FAMILIES = Object.freeze(Object.keys(FAMILY_RANK))

export const isModelFamily = (value) => typeof value === 'string' && Object.hasOwn(FAMILY_RANK, value)

// family → the model names a Copilot agent file that pins its own model (skraft-backlog, which
// Copilot runs without the skraft engine) may carry, PREFERRED FIRST.
//
// `--apply` pins the preferred entry into a file that sits on none of them; `--check` accepts
// any entry, so moving the preference never rewrites a file already on an accepted model.
// Each model is listed in the forms a harness may present it under: plain display name,
// Copilot-suffixed display name, and API id. skraft-framework's Copilot files name no model:
// its driver maps the family through engine/drivers/copilot-workflow/copilot-models.mjs.
const FAMILY_COPILOT_MODELS = Object.freeze({
  haiku: Object.freeze([
    'GPT-5.6 Luna',
    'GPT-5.6 Luna (copilot)',
    'gpt-5.6-luna',
    'Claude Haiku 4.5',
    'Claude Haiku 4.5 (copilot)',
  ]),
  sonnet: Object.freeze([
    'Claude Sonnet 5.5',
    'Claude Sonnet 5.5 (copilot)',
    'claude-sonnet-5.5',
    'Claude Sonnet 5',
    'Claude Sonnet 5 (copilot)',
    'claude-sonnet-5',
  ]),
  opus: Object.freeze([
    'Claude Opus 5',
    'Claude Opus 5 (copilot)',
    'claude-opus-5',
  ]),
})

export const copilotModelsForFamily = (family) => {
  if (!isModelFamily(family)) throw new Error(`Unknown model family: ${family}`)
  return FAMILY_COPILOT_MODELS[family]
}

// The family whose accepted Copilot names include `model`, or undefined.
export const familyForCopilotModel = (model) =>
  MODEL_FAMILIES.find((family) => FAMILY_COPILOT_MODELS[family].includes(model))

// model_requirement is free text; "Sonnet-class or above" sets the floor at sonnet.
export const floorForRequirement = (requirement) =>
  typeof requirement === 'string' && /sonnet-class/i.test(requirement) ? 'sonnet' : null

export const meetsFloor = (family, floor) => floor === null || FAMILY_RANK[family] >= FAMILY_RANK[floor]
