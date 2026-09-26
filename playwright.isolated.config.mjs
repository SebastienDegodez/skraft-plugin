import config from './playwright.config.mjs'

process.env.BASE_URL = 'http://localhost:4109/skraft-plugin'

export default {
  ...config,
  use: { ...config.use, baseURL: 'http://localhost:4109/skraft-plugin' },
  webServer: {
    ...config.webServer,
    command: config.webServer.command.replace('--port 4000', '--port 4109'),
    port: 4109,
    reuseExistingServer: false,
  },
}