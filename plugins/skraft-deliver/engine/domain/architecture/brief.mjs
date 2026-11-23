const OPEN = '<!-- skraft-architecture-brief:v1\n'
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const HASH = /^[a-f0-9]{64}$/
const ROOTS = ['docs/architecture/', 'docs/adr/', 'docs/domain/event-model/']

export const normalBody = (body) => body.replaceAll('\r\n', '\n')
export const briefPath = (issue, slug) => `docs/architecture/stories/${issue}-${slug}.md`
export const isBriefPath = (path, issue) => new RegExp(`^docs/architecture/stories/${issue}-[a-z0-9]+(?:-[a-z0-9]+)*\\.md$`).test(path)
export const documentPath = (path) => typeof path === 'string' && ROOTS.some((root) => path.startsWith(root))
  && path.endsWith('.md') && !/[\\:#\u0000-\u001f]/.test(path) && !path.split('/').some((part) => part === '..' || part === '.' || part === '')
const words = (value) => Array.isArray(value) && value.every((word) => typeof word === 'string' && word.trim() !== '')
const unique = (values) => new Set(values).size === values.length
const paths = (value) => words(value) && unique(value) && value.every(documentPath)
const components = (value) => words(value) && value.length > 0 && unique(value)
const criterion = (value, brief) => value && typeof value.id === 'string' && value.id.trim() !== ''
  && components(value.components) && value.components.every((name) => brief.components.includes(name))
  && paths(value.adrs) && value.adrs.every((path) => brief.adrs.includes(path))

export const readBrief = (source) => {
  const text = typeof source === 'string' ? normalBody(source) : ''
  if (!text.startsWith(OPEN)) return null
  const end = text.indexOf('\n-->', OPEN.length)
  if (end < 0 || end > 32_768) return null
  try {
    const brief = JSON.parse(text.slice(OPEN.length, end))
    return validBrief(brief) ? brief : null
  } catch {
    return null
  }
}

const identity = (brief) => Number.isSafeInteger(brief.issue) && brief.issue > 0 && ['github', 'azure-devops'].includes(brief.forge)
  && typeof brief.repository === 'string' && brief.repository.trim() !== '' && typeof brief.bodySha256 === 'string' && HASH.test(brief.bodySha256)
const dependencies = (brief) => components(brief.components) && paths(brief.adrs) && paths(brief.documents)
  && brief.adrs.every((path) => /^docs\/adr\/adr-\d+[-\w]*\.md$/.test(path))
const criteria = (brief) => Array.isArray(brief.criteria) && brief.criteria.length > 0
  && unique(brief.criteria.map((item) => item?.id)) && brief.criteria.every((item) => criterion(item, brief))
const validBrief = (brief) => brief && brief.version === 1 && identity(brief) && dependencies(brief) && criteria(brief)

export const writeBrief = (brief, body) => `${OPEN}${JSON.stringify(brief, null, 2)}\n-->\n\n${body}`
export const validSlug = (slug) => typeof slug === 'string' && SLUG.test(slug)
export const adrStatus = (text) => /^status:\s*["']?([A-Za-z]+)["']?\s*$/m.exec(/^(?:<!--[^\n]*-->\s*\n)?---\r?\n([\s\S]*?)\r?\n---/.exec(text ?? '')?.[1] ?? '')?.[1] ?? null
export const citedPaths = (brief) => [...new Set([...brief.documents, ...brief.adrs])]

export const freshnessOf = (brief, issue) => {
  if (brief.issue !== issue.number || brief.forge !== issue.forge || brief.repository !== issue.repository) return 'foreign'
  return brief.bodySha256 === issue.bodySha256 ? 'current' : 'changed'
}
