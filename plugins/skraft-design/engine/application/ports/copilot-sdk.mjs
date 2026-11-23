/**
 * CopilotSdk — the Copilot SDK the machine's Copilot CLI ships, through which the VS Code driver
 * runs the pipeline; without it, VS Code runs it through the agent loop.
 *
 * @typedef {{ found: true, version: string, sdk: string, cli: string } | { found: false, looked: string }} CopilotSdkLocation
 *   sdk: the folder of the SDK's `index.js`; cli: the Copilot CLI entry beside it, which can
 *   launch the plugin's extension; version: the CLI version they ship with; looked: the folder
 *   searched when there is none.
 * @typedef {{ locate: () => Promise<CopilotSdkLocation> }} CopilotSdk
 *   locate: the newest version that ships both.
 */
export {}
