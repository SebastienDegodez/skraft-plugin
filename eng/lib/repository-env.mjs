// The environment a child process gets once nothing in it points git at a repository.
//
// A git hook runs with GIT_DIR exported, absolute from a worktree. A test that runs
// `git init` and `git commit` in a temporary folder inherits it and commits into the
// repository being pushed instead.

/** The variables git reads to locate a repository, as `git rev-parse --local-env-vars` lists them. */
export const REPOSITORY_ENV = Object.freeze([
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_CONFIG', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS',
  'GIT_DIR', 'GIT_GRAFT_FILE', 'GIT_IMPLICIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_NO_REPLACE_OBJECTS',
  'GIT_OBJECT_DIRECTORY', 'GIT_PREFIX', 'GIT_REPLACE_REF_BASE', 'GIT_SHALLOW_FILE', 'GIT_WORK_TREE',
])

/**
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string | undefined>} env without the REPOSITORY_ENV variables, whatever their case
 */
export const withoutRepositoryEnv = (env) =>
  Object.fromEntries(Object.entries(env).filter(([name]) => !REPOSITORY_ENV.includes(name.toUpperCase())))
