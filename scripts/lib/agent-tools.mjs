import { parseYaml } from '../../eng/lib/yaml-parser.mjs'

// Supported SKRAFT references, not an exhaustive runtime inventory.
// VS Code d9cccddf6b34357c58b5bbfb60ea03d4c4d1df65:
// extensions/copilot/package.json (languageModelTools / languageModelToolSets).
// https://code.visualstudio.com/docs/agents/reference/custom-agent-file-reference#tools
const copilotTools = new Set([
  'agent', 'read', 'edit', 'execute', 'search', 'web', 'todo', 'skill',
  'read/readFile',
  'edit/createFile', 'edit/createDirectory', 'edit/editFiles',
  'search/codebase', 'search/fileSearch', 'search/textSearch', 'search/usages', 'search/listDirectory',
  'execute/runInTerminal', 'execute/getTerminalOutput', 'execute/killTerminal',
  'execute/sendToTerminal', 'execute/testFailure',
])

// https://code.claude.com/docs/en/tools-reference
// https://code.claude.com/docs/en/sub-agents#restrict-which-tools-a-subagent-can-use
const claudeTools = new Set(['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash', 'TaskOutput', 'TaskStop', 'Agent', 'Skill'])
const externalServers = ['graphify', 'github', 'ado', 'gitlab']
const historicalTools = new Map([
  ['TaskOutput', 'TaskOutput was removed in Claude Code 2.1.277; use Read on the background output file on newer versions.'],
])

function splitTools(value) {
  const tools = []
  let start = 0
  let depth = 0
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '(') depth++
    if (value[index] === ')') depth--
    if (depth < 0) throw new Error('tools: unmatched closing parenthesis')
    if (value[index] === ',' && depth === 0) {
      tools.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  if (depth !== 0) throw new Error('tools: unmatched opening parenthesis')
  tools.push(value.slice(start).trim())
  return tools
}

/** Validate SKRAFT's explicit tool boundary; external references still need a live inventory check. */
export function validateAgentTools(content, { client, agentIds = [] }) {
  if (!['local', 'copilot', 'claude'].includes(client)) throw new Error(`Unknown tools client: ${client}`)
  const header = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
  if (!header) throw new Error('tools: missing agent frontmatter')
  if ([...header[1].matchAll(/^tools:/gm)].length !== 1) {
    throw new Error('tools: require exactly one explicit top-level declaration')
  }
  const { tools: declared } = parseYaml(header[1])
  const tools = typeof declared === 'string' ? splitTools(declared) : declared
  if (!Array.isArray(tools) || tools.some((tool) => typeof tool !== 'string' || !tool.trim() || tool !== tool.trim())) {
    throw new Error('tools: expected tool names as a YAML list or comma-separated string')
  }
  if (new Set(tools).size !== tools.length) throw new Error('tools: duplicate reference')
  const externalTools = []
  const compatibilityWarnings = []
  for (const tool of tools) {
    const externalReferences = externalServers.map((server) =>
      client === 'claude' ? `mcp__${server}__*` : `${server}/*`)
    if (client === 'claude' && tool === 'mcp__skraft__run_pipeline') {
      externalTools.push(tool)
      continue
    }
    if (externalReferences.includes(tool)) {
      externalTools.push(tool)
      continue
    }
    if ((client === 'claude' ? claudeTools : copilotTools).has(tool)) {
      if (client === 'claude' && historicalTools.has(tool)) compatibilityWarnings.push(historicalTools.get(tool))
      continue
    }
    const scopedAgent = client === 'claude' && /^Agent\(([^()]+)\)$/.exec(tool)
    if (scopedAgent) {
      const children = scopedAgent[1].split(',').map((child) => child.trim())
      if (new Set(children).size !== children.length || children.some((child) => !agentIds.includes(child))) {
        throw new Error(`tools: unknown or duplicate delegated agent in ${tool}`)
      }
      continue
    }
    throw new Error(`tools: unsupported ${client} reference ${JSON.stringify(tool)}; verify official inventory before extending SKRAFT's supported set`)
  }
  return { tools, externalTools, compatibilityWarnings }
}
