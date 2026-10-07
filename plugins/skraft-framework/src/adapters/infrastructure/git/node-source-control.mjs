import { createGitSourceControl } from './git-source-control.mjs'
import { createNodeGitRunner } from './node-git-runner.mjs'

// SourceControl for Node hosts (CLI commands, Copilot workflow): git through child_process.
export const createNodeSourceControl = ({ cwd }) => createGitSourceControl({ git: createNodeGitRunner({ cwd }) })
