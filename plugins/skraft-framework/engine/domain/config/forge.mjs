/**
 * The forge a working copy reads its stories from and opens its pull requests on: the one
 * `forge` in skraft-config.json names, else the one the host of its Git remote names. A value the
 * developer wrote always wins.
 *
 * @typedef {'github' | 'azure-devops'} Forge
 */

/** The forges `forge` in skraft-config.json may name. */
export const FORGES = Object.freeze(/** @type {Forge[]} */ (['github', 'azure-devops']))
