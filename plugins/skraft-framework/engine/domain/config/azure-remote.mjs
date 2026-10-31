/**
 * The Azure DevOps repository a Git remote's URL names.
 *
 * @typedef {{ organization: string, project: string, repository: string }} AzureRemote
 *   organization: its URL, as az's --organization takes it; project and repository: their names, decoded.
 */

/**
 * The URLs Azure DevOps gives a remote, each with its organization, project and repository:
 * `https://[user@]dev.azure.com/<org>/[<project>/]_git/<repo>`, `git@ssh.dev.azure.com:v3/<org>/<project>/<repo>`
 * (or `ssh://…:22/v3/…`), `https://<org>.visualstudio.com/[DefaultCollection/][<project>/]_git/<repo>`
 * and `<org>@vs-ssh.visualstudio.com:v3/<org>/<project>/<repo>`; a URL without a project names
 * a repository of the project of the same name. visualstudio: the organization's URL is its own host.
 */
const AZURE_REMOTES = Object.freeze([
  { pattern: /^https:\/\/(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/(?:([^/]+)\/)?_git\/([^/]+?)\/?$/i, visualstudio: false },
  { pattern: /^(?:ssh:\/\/)?[^@/]+@ssh\.dev\.azure\.com(?::22)?[:/]v3\/([^/]+)\/([^/]+)\/([^/]+?)\/?$/i, visualstudio: false },
  { pattern: /^https:\/\/(?:[^@/]+@)?([^./@]+)\.visualstudio\.com\/(?:DefaultCollection\/)?(?:([^/]+)\/)?_git\/([^/]+?)\/?$/i, visualstudio: true },
  { pattern: /^(?:ssh:\/\/)?[^@/]+@vs-ssh\.visualstudio\.com(?::22)?[:/]v3\/([^/]+)\/([^/]+)\/([^/]+?)\/?$/i, visualstudio: true },
])

/** @param {string} url @returns {AzureRemote | null} null when the URL names no Azure DevOps repository */
export const azureRemoteOf = (url) => {
  for (const { pattern, visualstudio } of AZURE_REMOTES) {
    const match = pattern.exec(url)
    if (match !== null) return named(match, visualstudio)
  }
  return null
}

/** @param {RegExpExecArray} match @param {boolean} visualstudio @returns {AzureRemote | null} */
const named = ([, organization, project, repository], visualstudio) => {
  try {
    const decoded = { project: decodeURIComponent(project ?? repository), repository: decodeURIComponent(repository) }
    return { organization: visualstudio ? `https://${organization}.visualstudio.com` : `https://dev.azure.com/${organization}`, ...decoded }
  } catch {
    return null
  }
}

/** The organization of an address on either form of it: `dev.azure.com/<org>` or `<org>.visualstudio.com`. */
const ORGANIZATION = /^https:\/\/(?:dev\.azure\.com\/([^/]+)|([^./@]+)\.visualstudio\.com)(?:\/|$)/i

/** @param {unknown} url @returns {string | null} the organization's name, without case; null when the address is on neither form */
const organizationOf = (url) => {
  const match = ORGANIZATION.exec(String(url))
  return match === null ? null : (match[1] ?? match[2]).toLowerCase()
}

/**
 * Whether an address (a work item's) is on the organization, whatever the case and whichever form
 * of the organization's address either is written in.
 * @param {string} organization the organization's URL, as azureRemoteOf gives it @param {unknown} url
 */
export const isInOrganization = (organization, url) => {
  const named = organizationOf(url)
  return named !== null && named === organizationOf(organization)
}

/**
 * The repository a consent is kept for: the host and `<organization>/<project>/<repository>`, the
 * same whichever form of the organization's address the remote is written in.
 * @param {AzureRemote} remote @returns {{ host: string, repository: string }}
 */
export const azureRepositoryKeyOf = ({ organization, project, repository }) =>
  ({ host: 'dev.azure.com', repository: `${organizationOf(organization)}/${project}/${repository}` })
