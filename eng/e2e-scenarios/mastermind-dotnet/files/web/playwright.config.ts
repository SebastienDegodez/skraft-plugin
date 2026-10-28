import { defineConfig, devices } from '@playwright/test'

// Each run starts its own API and front end, so the screenshots show the code of the working copy.
// A server's settings go in `env`, never in `command`: `NAME=value npm start` does not run on Windows.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: true,
  reporter: [['list'], ['./e2e/visuals-reporter.ts']],
  use: { baseURL: 'http://127.0.0.1:5917' },
  projects: [
    { name: 'light', use: { ...devices['Desktop Chrome'], colorScheme: 'light' } },
    { name: 'dark', use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } },
  ],
  webServer: [
    // `dotnet run` builds the API first: give it longer than the default minute.
    { command: 'dotnet run --project ../api/src/Mastermind.Api', env: { PORT: '3917' }, url: 'http://127.0.0.1:3917/api/couleurs', reuseExistingServer: false, timeout: 180_000 },
    { command: 'npm start', url: 'http://127.0.0.1:5917', reuseExistingServer: false },
  ],
})
