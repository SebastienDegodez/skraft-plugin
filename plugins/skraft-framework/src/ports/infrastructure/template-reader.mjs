// Port for the plugin's own templates (assets/templates/*.template.md), read so the
// artifact renderer stays pure.
// Contract:
//   read(pluginRelativePath) => Promise<string>     rejects when the template is absent
export const TEMPLATE_READER_PORT = 'TemplateReader'
