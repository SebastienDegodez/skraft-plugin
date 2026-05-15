# Example 04 — Evidence Manifest

Domain: MonAssurance auto-insurance eligibility check.

After the test run, write `.skraft/sdlc/deliver/{story}/evidence/manifest.md` so agents know what
was captured. The story key aligns with all other SDLC artefacts:
`discuss/ac-draft-{story}.md`, `design/diagrams-{story}.md`, `distill/impl-plan-{story}.md`.

## Global reporter hook

Add a custom reporter in `playwright.config.ts` to write the manifest automatically:

```typescript
// reporters/evidence-manifest-reporter.ts
import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface EvidenceEntry {
  type: 'screenshot' | 'video' | 'trace' | 'report' | 'junit';
  path: string;
  test: string;
}

export default class EvidenceManifestReporter implements Reporter {
  private entries: EvidenceEntry[] = [];
  private start = Date.now();
  private passed = 0;
  private failed = 0;
  private storyId = process.env.SKRAFT_STORY_ID ?? 'unknown-story';

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === 'passed') {
      this.passed++;
    } else {
      this.failed++;
    }

    for (const attachment of result.attachments) {
      if (!attachment.path) continue;
      const type = attachment.contentType.startsWith('image/')
        ? 'screenshot'
        : attachment.name === 'video'
        ? 'video'
        : 'trace';
      this.entries.push({ type, path: attachment.path, test: test.title });
    }
  }

  onEnd(result: FullResult) {
    const dir = `.skraft/sdlc/deliver/${this.storyId}/evidence`;
    mkdirSync(dir, { recursive: true });

    const rows = this.entries
      .map(e => `| ${e.type} | ${e.path} | ${e.test} |`)
      .join('\n');

    const duration = ((Date.now() - this.start) / 1000).toFixed(0);
    const status = this.failed > 0
      ? `failed (${this.failed} failures, ${this.passed} passed)`
      : `passed (${this.passed} passed)`;

    const manifest = `# Evidence Manifest

## Run
- story: ${this.storyId}
- timestamp: ${new Date().toISOString()}
- status: ${status}
- duration: ${duration}s

## Files
| Type | Path | Test |
|---|---|---|
${rows || '| — | — | no evidence captured |'}

## Reports
| Type | Path |
|---|---|
| html | ${dir}/reports/index.html |
| junit | ${dir}/reports/results.xml |
`;

    writeFileSync(join(dir, 'manifest.md'), manifest);
  }
}
```

Register in `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  outputDir: `.skraft/sdlc/deliver/${process.env.SKRAFT_STORY_ID}/evidence`,
  reporter: [
    ['./reporters/evidence-manifest-reporter.ts'],
    ['html', { outputFolder: `.skraft/sdlc/deliver/${process.env.SKRAFT_STORY_ID}/evidence/reports`, open: 'never' }],
    ['junit', { outputFile: `.skraft/sdlc/deliver/${process.env.SKRAFT_STORY_ID}/evidence/reports/results.xml` }],
  ],
  use: {
    screenshot: 'only-on-failure',
    video: { mode: 'retain-on-failure' },
    trace: 'retain-on-failure',
  },
});
```

## CLI

```bash
SKRAFT_STORY_ID=42-add-eligibility-check npx playwright test
# manifest written to .skraft/sdlc/deliver/42-add-eligibility-check/evidence/manifest.md
```

## Resulting manifest

```markdown
# Evidence Manifest

## Run
- story: 42-add-eligibility-check
- timestamp: 2026-05-15T10:30:00Z
- status: failed (1 failures, 9 passed)
- duration: 38s

## Files
| Type | Path | Test |
|---|---|---|
| screenshot | .skraft/sdlc/deliver/42-add-eligibility-check/evidence/eligibility-check-underage-1715770200000.png | underage driver should be rejected |
| trace | .skraft/sdlc/deliver/42-add-eligibility-check/evidence/eligibility-check-underage-1715770200000.zip | underage driver should be rejected |

## Reports
| Type | Path |
|---|---|
| html | .skraft/sdlc/deliver/42-add-eligibility-check/evidence/reports/index.html |
| junit | .skraft/sdlc/deliver/42-add-eligibility-check/evidence/reports/results.xml |
```

The orchestrator resolves the manifest by reading `state.md` → active story → `.skraft/sdlc/deliver/{story}/evidence/manifest.md`.
