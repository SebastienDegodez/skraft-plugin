// Pure policy over already-parsed agent descriptors: no IO. Returns a frozen list
// of violations, empty when the declarations are valid.
//
// A descriptor is: { name, skills[], onDemandSkills[], metadataKeys[] }.
// An agent lists its mandatory skills once, under the top-level `skills` the host
// preloads, and its on-demand skills under `metadata.on_demand_skills`: the only
// metadata field anything reads. Phases, dispatch and artifacts live in the
// workflow and the engine, never in a descriptor.

const READ_METADATA = new Set(['on_demand_skills'])

const violation = (agent, code, message) => Object.freeze({ agent, code, message })

// A skill is mandatory or on demand, never both: listed twice, it would be
// preloaded and still described as loaded only when a step needs it.
const declaredTwice = (d) => {
  const mandatory = new Set(d.skills ?? [])
  return (d.onDemandSkills ?? [])
    .filter((name) => mandatory.has(name))
    .map((name) => violation(d.name, 'SKILL_DECLARED_TWICE', `'${name}' is listed under both skills and on_demand_skills; keep it in one list`))
}

const unreadMetadata = (d) => (d.metadataKeys ?? []).filter((key) => !READ_METADATA.has(key)).map((key) => (key === 'skills'
  ? violation(d.name, 'SKILL_IN_METADATA', 'lists skills under metadata.skills; list them under the top-level skills only')
  : violation(d.name, 'METADATA_FIELD_UNREAD', `metadata.${key} is read by nothing; remove it (phases and dispatch live in the workflow)`)))

export const validateSkillDeclarations = (descriptors) => Object.freeze(
  descriptors.flatMap((d) => [...declaredTwice(d), ...unreadMetadata(d)]),
)
