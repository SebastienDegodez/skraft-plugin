import test from 'node:test';
import assert from 'node:assert/strict';
import { selectVersions, buildManifest, nextDocPatchTag, integrationPath } from '../../eng/docs/versions.mjs';
import { injectInto, switcherSnippet } from '../../eng/docs/inject-switcher.mjs';

const minors = (from, to) => {
  const t = [];
  for (let m = from; m <= to; m++) t.push(`v1.${m}.0`);
  return t;
};

test('keeps the latest line and the 5 minor lines before it', () => {
  const lines = selectVersions(minors(0, 15));
  assert.deepEqual(lines.map((l) => l.line), ['1.15', '1.14', '1.13', '1.12', '1.11', '1.10']);
});

test('lists every patch of a line but counts the line once', () => {
  const lines = selectVersions([...minors(10, 15), 'v1.14.1']);
  assert.equal(lines.length, 6);
  assert.deepEqual(lines[1].versions, ['v1.14.1', 'v1.14.0']);
});

test('a pre-release ahead of the latest stable takes a slot', () => {
  const lines = selectVersions([...minors(10, 15), 'v2.0.0-rc.1', 'v2.0.0-beta.1']);
  assert.deepEqual(lines.map((l) => l.line), ['2.0', '1.15', '1.14', '1.13', '1.12', '1.11']);
  assert.equal(lines[0].prerelease, true);
});

test('a pre-release line carries only its newest pre-release', () => {
  const alphas = Array.from({ length: 16 }, (_, i) => `v2.0.0-alpha.${i + 1}`);
  const [pre] = selectVersions(['v1.15.1', ...alphas]);
  assert.equal(pre.prerelease, true);
  assert.deepEqual(pre.versions, ['v2.0.0-alpha.16']);
});

test('a pre-release is dropped once its release is stable', () => {
  const lines = selectVersions([...minors(10, 15), 'v1.15.0-rc.1', 'v2.0.0-rc.1', 'v2.0.0']);
  assert.ok(lines.every((l) => !l.prerelease));
  assert.equal(lines[0].line, '2.0');
});

test('manifest flags the latest stable line and the integration branch', () => {
  const m = buildManifest(['v1.15.0', 'v1.15.1', 'v2.0.0-rc.1']);
  assert.equal(m.latest, 'v1.15.1');
  assert.equal(m.integration.branch, 'integration/v2-next');
  assert.equal(m.integration.path, 'v2-next/');
  assert.equal(m.lines.find((l) => l.current).line, '1.15');
});

test('the integration URL keeps only the last branch segment', () => {
  assert.equal(integrationPath('integration/v2-next'), 'v2-next/');
  assert.equal(integrationPath('v3-next'), 'v3-next/');
  assert.equal(buildManifest([], { integrationBranch: null }).integration, null);
});

test('documentation tags only bump the patch', () => {
  assert.equal(nextDocPatchTag(['v1.15.1', 'v1.14.9', 'v2.0.0-rc.1']), 'v1.15.2');
  assert.equal(nextDocPatchTag([]), null);
});

test('switcher injection is idempotent', () => {
  const s = switcherSnippet('/skraft-plugin', 'v1.14.0/');
  const once = injectInto('<html><body>x</body></html>', s);
  assert.equal(injectInto(once, s), once);
});
