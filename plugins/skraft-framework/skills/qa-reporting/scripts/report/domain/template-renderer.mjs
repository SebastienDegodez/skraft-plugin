// Minimal Mustache-subset renderer — zero dependency.
//
// Supports the logic-less subset SKRAFT artifact templates need:
//   {{var}}            escaped variable (here: identity — markdown needs no HTML escaping)
//   {{{var}}}          raw variable (alias of {{var}} in this markdown-only context)
//   {{#section}}…{{/}} section: loop over an array, OR render once if value is truthy
//   {{^section}}…{{/}} inverted section: render once if value is falsy / empty array
//   {{.}}              the current item inside a scalar-list section
//   dotted.paths       nested lookup (a.b.c) resolved against the data object
//
// Sections may nest. Lookups walk the data object; inside a loop the item's own
// fields shadow the outer scope. Unknown keys render as the empty string.

const lookup = (key, scope) => {
  if (key === '.') return scope['.'] ?? ''
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope) ?? ''
}

const isTruthy = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(v))

// Mustache "standalone line" rule: when a section tag ({{#x}}, {{^x}}, {{/x}}) is
// the only non-whitespace on its line, its leading indentation and trailing newline
// are stripped. Without this, each loop iteration injects a blank line — which breaks
// markdown tables (a blank line ends a table). Variable tags are never standalone.
const stripStandaloneTags = (tpl) =>
  tpl.replace(/^[ \t]*(\{\{[#^/]\s*[\w.]+\s*\}\})[ \t]*\r?\n/gm, '$1')

const renderSections = (tpl, scope) =>
  tpl.replace(
    /\{\{([#^])\s*([\w.]+)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/g,
    (_match, kind, key, inner) => {
      const value = lookup(key, scope)
      const truthy = isTruthy(value)
      if (kind === '^') return truthy ? '' : render(inner, scope)
      if (!truthy) return ''
      const items = Array.isArray(value) ? value : [value]
      return items
        .map((item) => {
          const childScope =
            item !== null && typeof item === 'object'
              ? { ...scope, ...item, '.': item }
              : { ...scope, '.': item }
          return render(inner, childScope)
        })
        .join('')
    },
  )

const renderVariables = (tpl, scope) =>
  tpl
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_m, key) => String(lookup(key, scope)))
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => String(lookup(key, scope)))

/**
 * Render a Mustache-subset template against a data object.
 * @param {string} tpl  template source
 * @param {object} data plain data object
 * @returns {string}    rendered output
 */
export const render = (tpl, data) =>
  renderVariables(renderSections(stripStandaloneTags(tpl), data), data)
