// Prism themes of code blocks: the GitHub Primer syntax colours, every token at >= 4.5:1 on its
// background in both modes (tests/tooling/docs-theme/contrast.test.mjs). prism-react-renderer's
// `github` and `vsDark` themes have token colours below AA (#999988 and #36acaa in light; #646695,
// #808080 and #000080 in dark). ```console fences use the terminal palette instead.
const theme = (plain, colours) => ({
  plain,
  styles: [
    { types: ['comment', 'prolog', 'doctype', 'cdata'], style: { color: colours.comment, fontStyle: 'italic' } },
    { types: ['namespace'], style: { opacity: 0.85 } },
    { types: ['string', 'attr-value', 'char', 'regex', 'inserted'], style: { color: colours.string } },
    { types: ['punctuation', 'operator'], style: { color: plain.color } },
    { types: ['entity', 'url', 'symbol', 'number', 'boolean', 'constant', 'property', 'variable'], style: { color: colours.constant } },
    { types: ['atrule', 'keyword', 'important', 'deleted'], style: { color: colours.keyword } },
    { types: ['attr-name', 'class-name', 'function', 'function-variable', 'selector'], style: { color: colours.function } },
    { types: ['tag', 'builtin'], style: { color: colours.tag } },
    { types: ['parameter'], style: { color: colours.parameter } },
    { types: ['bold', 'important'], style: { fontWeight: 'bold' } },
    { types: ['italic'], style: { fontStyle: 'italic' } },
  ],
})

export const codeThemeLight = theme(
  { color: '#1f2328', backgroundColor: '#f6f8fa' },
  { comment: '#59636e', string: '#0a3069', constant: '#0550ae', keyword: '#cf222e', function: '#8250df', tag: '#116329', parameter: '#953800' },
)

export const codeThemeDark = theme(
  { color: '#eef6ff', backgroundColor: '#152231' },
  { comment: '#9198a1', string: '#a5d6ff', constant: '#79c0ff', keyword: '#ff7b72', function: '#d2a8ff', tag: '#7ee787', parameter: '#ffa657' },
)
