/**
 * A light designer that writes the brief its plan names, with the identity the plan gives, and the
 * ADRs given, as its descriptor asks; `brief` overrides fields of the header, `body` the text after it.
 * @param {{ brief?: object, body?: string, adrs?: Record<string, string> }} [behaviour]
 */
export const lightDesigner = ({ brief = {}, body = '# Checkout receipt\n', adrs = {} } = {}) => (host) => async () => {
  const step = host.events().filter(({ type }) => type === 'step.started').at(-1)
  const plan = JSON.parse(await host.tracking.read(host.slug, 'plans/light-design.json'))
  const header = { version: 1, issue: plan.issue, forge: plan.forge, repository: plan.repository, bodySha256: plan.bodySha256,
    components: ['.'], criteria: [{ id: 'AC-1', components: ['.'], adrs: [] }], adrs: [], documents: [], ...brief }
  for (const [path, text] of [[plan.brief, `<!-- skraft-architecture-brief:v1\n${JSON.stringify(header)}\n-->\n\n${body}`], ...Object.entries(adrs)]) {
    host.workspace.files.set(path, text)
    host.git.change(path)
  }
  await host.tracking.write(host.slug, step.result, JSON.stringify({ status: 'done', summary: 'light design written' }))
}
