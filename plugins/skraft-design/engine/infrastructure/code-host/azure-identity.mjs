import { readJson, run, succeeded } from './az-cli.mjs'

export const authenticatedUser = async (commandRunner, { organization }) => {
  const result = await run(commandRunner, ['az', 'devops', 'invoke', '--area=location', '--resource=connectionData',
    `--organization=${organization}`, '--api-version=7.1-preview.1', '--only-show-errors', '--output=json'])
  const identity = succeeded(result) ? readJson(result.stdout)?.authenticatedUser?.id : null
  return typeof identity === 'string' && identity !== '' ? identity : null
}
