import { createNodeHostPorts } from './node-host-ports.mjs'
import { createDecisionInbox } from '../../application/pipeline/decision-inbox.mjs'

// GitHub Copilot dynamic workflow → run-pipeline ports. Thin by design: ctx.agent runs
// a phase agent, ctx.pause is the durable checkpoint, ctx.phase/ctx.log the progress
// the /workflows view shows. Everything else is the Node host (node-host-ports.mjs).
//
// Copilot agent ids: a plugin agent is addressed by its .agent.md `name`
// ("Skraft - Software Engineer"), which is also the canonical name in
// skraft-framework.config.json. `agentIds` overrides it per agent, should a CLI build
// expect a namespaced id (to be confirmed against the experimental API).

export const createCopilotWorkflowPorts = (ctx, { cwd, pluginRoot, slug, agentIds = {}, env = process.env }) => {
  let inbox

  const ports = createNodeHostPorts({
    cwd,
    env,
    pluginRoot,
    signal: ctx.signal,
    agents: {
      // ctx.agent journals each call by prompt + options: a resumed run gets the
      // finished dispatches back without re-running them. The label keeps
      // distinct dispatches distinct. A failure resolves null, never throws.
      run: async ({ agent, label, prompt }) => {
        const text = await ctx.agent(prompt, { label, agent: agentIds[agent] ?? agent })
        return { ok: typeof text === 'string' && text.length > 0, text: typeof text === 'string' ? text : '' }
      },
    },
    interaction: {
      // 1. an answer already recorded (skraft_decide tool, decide.mjs) wins;
      // 2. otherwise pause at a durable checkpoint: the first attempt stops here
      //    (ctx.pause throws AbortError); `R` in /workflows resumes the run;
      // 3. resumed and still unanswered: null, the run ends as awaiting-human.
      decide: async ({ key, question, options }) => {
        const recorded = await inbox.read(key)
        if (recorded) return recorded
        ctx.log(`Waiting for you — ${question.split('\n')[0]}`)
        ctx.log(`Answer with the skraft_decide tool (key "${key}", one of: ${options.join(' | ')}), then resume this run.`)
        await ctx.pause(key)
        return inbox.read(key)
      },
    },
    progress: {
      phase: (title) => ctx.phase(title),
      log: (message) => ctx.log(message),
    },
  })

  inbox = createDecisionInbox({ trackingFiles: ports.trackingFiles, slug })
  return ports
}
