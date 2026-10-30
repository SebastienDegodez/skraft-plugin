/**
 * The forge a working copy reads its stories from and opens its pull requests on: the one
 * `forge` in skraft-config.json names, else the one the host of its Git remote names. A value the
 * developer wrote always wins.
 *
 * @typedef {'github' | 'azure-devops'} Forge
 */

/** The forges `forge` in skraft-config.json may name. */
export const FORGES = Object.freeze(/** @type {Forge[]} */ (['github', 'azure-devops']))

/** The host of `scheme://[user@]host[:port]/…`. */
const URL_HOST = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/:]+)/i
/** The host of `[user@]host:path`, as scp and ssh write it. */
const SCP_HOST = /^(?:[^@/]*@)?([^/:]+):/
/** dev.azure.com, ssh.dev.azure.com, and every host of visualstudio.com, as Azure DevOps names its remotes. */
const AZURE_DEVOPS_HOST = /^(?:(?:ssh\.)?dev\.azure\.com|.+\.visualstudio\.com)$/i

/**
 * The forge the URL of a Git remote names: Azure DevOps for its hosts, GitHub for any other host
 * or without a remote.
 * @param {string | null} url @returns {Forge}
 */
export const forgeOfRemote = (url) => (AZURE_DEVOPS_HOST.test(hostOf(url ?? '')) ? 'azure-devops' : 'github')

/** @param {string} url */
const hostOf = (url) => (URL_HOST.exec(url) ?? SCP_HOST.exec(url))?.[1] ?? ''
