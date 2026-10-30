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
