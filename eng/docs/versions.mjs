// Pure rules: which documentation versions the published site carries.
const TAG = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export const MINOR_WINDOW = 6; // the latest line + the 5 minor lines before it

export function parseTag(tag) {
  const m = TAG.exec(tag);
  if (!m) return null;
  return {
    tag,
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? null,
  };
}

const byVersionDesc = (a, b) =>
  b.major - a.major || b.minor - a.minor || b.patch - a.patch ||
  (a.prerelease === b.prerelease ? 0 : a.prerelease === null ? -1 : b.prerelease === null ? 1 : b.prerelease.localeCompare(a.prerelease, 'en', { numeric: true }));

const lineKey = (v) => `${v.major}.${v.minor}`;

/**
 * Picks the minor lines to publish, newest first.
 * - Every patch of a retained line is listed; a line counts once.
 * - A pre-release line counts only while it is ahead of the latest stable
 *   release; once its major (or minor) is released stable it is dropped.
 */
export function selectVersions(tags, { window = MINOR_WINDOW } = {}) {
  const parsed = tags.map(parseTag).filter(Boolean).sort(byVersionDesc);
  const stable = parsed.filter((v) => v.prerelease === null);
  const latestStable = stable[0] ?? null;

  const ahead = (v) =>
    !latestStable ||
    v.major > latestStable.major ||
    (v.major === latestStable.major && v.minor > latestStable.minor);
  const preLines = new Map();
  for (const v of parsed.filter((p) => p.prerelease !== null && ahead(p))) {
    if (!preLines.has(lineKey(v))) preLines.set(lineKey(v), []);
    preLines.get(lineKey(v)).push(v);
  }

  const stableLines = new Map();
  for (const v of stable) {
    if (!stableLines.has(lineKey(v))) stableLines.set(lineKey(v), []);
    stableLines.get(lineKey(v)).push(v);
  }

  const lines = [
    ...[...preLines].map(([line, versions]) => ({ line, prerelease: true, versions })),
    ...[...stableLines].map(([line, versions]) => ({ line, prerelease: false, versions })),
  ];
  // Only the newest pre-release line takes a slot.
  const firstPre = lines.findIndex((l) => l.prerelease);
  return lines
    .filter((l, i) => !l.prerelease || i === firstPre)
    .slice(0, window)
    .map((l) => ({ ...l, versions: l.versions.map((v) => v.tag) }));
}

export const INTEGRATION_BRANCH = 'integration/v2-next';

/** URL segment of an integration branch: its last path segment (integration/v2-next -> v2-next). */
export const integrationPath = (branch) => `${branch.split('/').filter(Boolean).pop()}/`;

/** Manifest consumed by the build and by the in-page version switcher. */
export function buildManifest(tags, { integrationBranch = INTEGRATION_BRANCH, window } = {}) {
  const lines = selectVersions(tags, { window });
  const latest = lines.find((l) => !l.prerelease) ?? null;
  return {
    latest: latest ? latest.versions[0] : null,
    lines: lines.map((l) => ({
      line: l.line,
      prerelease: l.prerelease,
      current: l === latest,
      versions: l.versions.map((tag) => ({ tag, path: `${tag}/` })),
    })),
    integration: integrationBranch ? { branch: integrationBranch, path: integrationPath(integrationBranch) } : null,
  };
}

/** Next documentation tag: patch bump only, never major or minor. */
export function nextDocPatchTag(tags) {
  const latest = tags.map(parseTag).filter((v) => v && v.prerelease === null).sort(byVersionDesc)[0];
  if (!latest) return null;
  return `v${latest.major}.${latest.minor}.${latest.patch + 1}`;
}
