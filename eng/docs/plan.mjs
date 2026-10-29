// Prints the versions manifest as JSON, from the repository tags.
//   node eng/docs/plan.mjs [--integration integration/v2-next|none] [--window 6]
//   node eng/docs/plan.mjs --integration-path   (URL segment of the integration branch)
import { execFileSync } from 'node:child_process';
import { buildManifest, nextDocPatchTag, INTEGRATION_BRANCH, integrationPath } from './versions.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const tags = execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' }).split('\n').filter(Boolean);

if (args.includes('--next-doc-tag')) {
  const next = nextDocPatchTag(tags);
  if (!next) {
    console.error('no stable tag to bump');
    process.exit(1);
  }
  console.log(next);
} else if (args.includes('--integration-path')) {
  console.log(integrationPath(opt('integration', INTEGRATION_BRANCH)));
} else {
  const integration = opt('integration', INTEGRATION_BRANCH);
  console.log(JSON.stringify(buildManifest(tags, { integrationBranch: integration === 'none' ? null : integration, window: Number(opt('window', 6)) }), null, 2));
}
