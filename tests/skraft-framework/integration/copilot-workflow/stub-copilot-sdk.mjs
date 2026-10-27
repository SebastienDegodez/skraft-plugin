// What `@github/copilot-sdk/extension` resolves to in import-entry-child.mjs: the simulated SDK,
// left on globalThis so that the child can say what the extension entry joined.
import { simulatedSdk } from './simulated-sdk.mjs'

const sdk = simulatedSdk({ session: { rpc: { metadata: { snapshot: async () => ({}) } } } })
globalThis.skraftStubSdk = sdk

export const { defineWorkflow, joinSession } = sdk
