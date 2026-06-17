# Audience boundary reference (v0.3.7)

Load this file before drafting handoff packet step 6 when the
design includes ≥1 task() spawn. Keeps per-spawn declaration
discipline out of SKILL.md body (500-line budget).

---

## Per-spawn declaration table template

Every handoff packet with ≥1 task() spawn MUST include this block:

```markdown
## PER-SPAWN DECLARATION TABLE

| Spawn # | Role/Lens | Audience | Tier | Brief mode | Receipt mode | Justification (1 line) |
|---|---|---|---|---|---|---|
| 1 | <lens name> | INTERNAL | TRIVIAL | CAVEMAN_ULTRA | JSON_RECEIPT | fixed schema, single anchor |
| 2 | <lens name> | INTERNAL | REVIEWER | CAVEMAN_FULL | CAVEMAN_FRAGMENT | judgement; no schema |
| 3 | <lens name> | EXTERNAL | PLANNER | NORMAL | NORMAL_RECEIPT | user-facing synthesis |
```

Audience ∈ {INTERNAL, EXTERNAL}.
Tier ∈ {TRIVIAL, REVIEWER, IMPLEMENTER, PLANNER, RESEARCHER, LCRETRIEVER}.
Brief mode ∈ {CAVEMAN_ULTRA, CAVEMAN_FULL, CAVEMAN_LITE, NORMAL}.
Receipt mode ∈ {JSON_RECEIPT, CAVEMAN_FRAGMENT, NORMAL_RECEIPT}.

Rule: Audience=INTERNAL AND mode=NORMAL → step-8 BLOCKER unless
Justification cites one of: {security warning, irreversible op,
ambiguous multi-step, judgement-with-no-schema}. Else compress.

---

## Brief templates

Five ready-made templates live in `assets/caveman-templates.md`.
Load that file when drafting SPAWN_BRIEF blocks. Templates cover:
1. Severity classifier
2. Duplicate oracle
3. Label picker
4. Missing-info lens
5. Style lens (diff scan)

---

## Worked example — S1-shape PANEL refactored to v0.3.7

### Before (v0.3.6 anti-pattern: ROGUE PROSE IN BRIEF)

```
task(prompt="""
<entire 8K-token HUMAN_RATIONALE block with design choices,
trade-off rationale, citation paragraphs, pattern selection
history copied verbatim into the spawn brief>
Now review the PR for security issues.
""")
```

### After (v0.3.7 canonical)

handoff.md contains both blocks; only SPAWN_BRIEF goes to task():

```markdown
## HUMAN_RATIONALE
<8K-token design reasoning — NEVER copied to task()>

## SPAWN_BRIEF #1 (security lens)
```caveman
ROLE: security lens. RESPOND CAVEMAN.
SCAN DIFF. FIND: auth-bypass, SSRF, SQLi, IDOR, secrets-in-code.
ANCHOR: blocker = exploitable RCE or auth-bypass in prod path only.
PRESERVE EXACT: CVE IDs, error strings, file:line refs.
ESCAPE TO NORMAL: if finding is ambiguous destructive action.
OUTPUT JSON ONLY: {sev, cwe, file, line, fix}. NO PROSE.
```

## RECEIPT_SCHEMA #1
{"sev":"blocker|high|medium|low","cwe":"CWE-NNN","file":"<path>","line":<int>,"fix":"<caveman, <=20 words>"}
```

task(prompt=SPAWN_BRIEF_1_ONLY)   # ~90 tokens, not 8K
```

Savings on this spawn alone: ~7.9K input tokens per run.

### PER-SPAWN DECLARATION TABLE for S1 (9 spawns)

| Spawn # | Role/Lens | Audience | Tier | Brief mode | Receipt mode | Justification |
|---|---|---|---|---|---|---|
| 1 | security lens | INTERNAL | REVIEWER | CAVEMAN_FULL | JSON_RECEIPT | fixed schema; security escape clause active |
| 2 | severity classifier | INTERNAL | TRIVIAL | CAVEMAN_ULTRA | JSON_RECEIPT | single anchor, fixed schema |
| 3 | dup oracle | INTERNAL | TRIVIAL | CAVEMAN_ULTRA | JSON_RECEIPT | fixed schema or null |
| 4 | label picker | INTERNAL | TRIVIAL | CAVEMAN_ULTRA | JSON_RECEIPT | allowed-set picker |
| 5 | missing-info lens | INTERNAL | TRIVIAL | CAVEMAN_FULL | JSON_RECEIPT | escape if security reporter |
| 6 | style lens | INTERNAL | TRIVIAL | CAVEMAN_FULL | CAVEMAN_FRAGMENT | JSONL stream |
| 7 | perf lens | INTERNAL | REVIEWER | CAVEMAN_FULL | CAVEMAN_FRAGMENT | rubric-graded, no open-ended |
| 8 | test coverage | INTERNAL | REVIEWER | CAVEMAN_LITE | CAVEMAN_FRAGMENT | judgement-without-schema |
| 9 | synthesizer | EXTERNAL | REVIEWER | NORMAL | NORMAL_RECEIPT | user-facing PR advisory |

Spawn 9 (synthesizer) is EXTERNAL: it ingests INTERNAL receipts
from spawns 1-8 and emits normal-prose PR description. The boundary
is here. See composition-substrate.md §7 AUDIENCE BOUNDARY.

---

## Lint rules (pseudocode — enforce at step 8)

```
for each handoff_packet in emitted:
  assert "PER-SPAWN DECLARATION TABLE" in packet              # required block
  for each row in per_spawn_table:
    assert row.audience in {INTERNAL, EXTERNAL}
    assert row.brief_mode in {CAVEMAN_ULTRA, CAVEMAN_FULL, CAVEMAN_LITE, NORMAL}
    if row.audience == INTERNAL and row.brief_mode == NORMAL:
      assert row.justification in {
        "security warning", "irreversible op",
        "ambiguous multi-step", "judgement-without-schema"
      }                                                        # else BLOCKER
  assert spawn_brief_count == len(per_spawn_table)            # one brief per row
  for each spawn_brief in packet:
    assert matching_receipt_schema_exists(spawn_brief)        # paired schema
    assert not substring_of(spawn_brief, human_rationale)     # ROGUE PROSE check
  for each external_spec in packet:
    assert external_spec.mode == NORMAL                       # never compress EXTERNAL
```

BLOCKER conditions (stop; return to step 3.2):
- INTERNAL spawn with NORMAL brief, no justification.
- SPAWN_BRIEF longer than 500 tokens on a TRIVIAL spawn.
- SPAWN_BRIEF substring found verbatim in HUMAN_RATIONALE.
- Missing RECEIPT_SCHEMA for any SPAWN_BRIEF.
- EXTERNAL artifact with caveman brief mode.
