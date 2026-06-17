# Caveman brief templates (B14b canonical)

Load at step 7b when the architect draws ≥1 CAVEMAN_* spawn brief
in the handoff packet's PER-SPAWN DECLARATION TABLE.

Five ready-made templates cover the most common TRIVIAL and
fixed-schema REVIEWER dispatches. Each template: BRIEF (caveman,
80-300 input tokens) + RECEIPT_SCHEMA (JSON).

---

## Template 1 — Severity classifier

BRIEF:
```caveman
ROLE: severity classifier. RESPOND CAVEMAN until done.
READ issue body + labels.
CLASSIFY sev: blocker|high|medium|low.
ANCHOR: blocker = RCE / data-loss / full-outage / auth-bypass only.
       high = exploitable vuln OR core workflow broken in main.
       medium = degraded path, workaround exists.
       low = cosmetic / docs / nice-to-have.
PRESERVE EXACT: code blocks, paths, URLs, error strings, version
numbers, CVE IDs, identifiers.
DROP: articles, filler, pleasantries, hedging, connective fluff.
ESCAPE TO NORMAL: if security/destructive/irreversible.
OUTPUT JSON ONLY: {sev, why, evidence}. NO PROSE OUTSIDE JSON.
```

RECEIPT:
```json
{
  "sev": "blocker|high|medium|low",
  "why": "<= 20 words>",
  "evidence": "<file:line OR quoted error string OR CVE ID>"
}
```

---

## Template 2 — Duplicate oracle

BRIEF:
```caveman
ROLE: dup oracle. RESPOND CAVEMAN.
READ issue + candidate list (id, title, body excerpt).
PICK duplicate_of = <id> OR null.
ANCHOR: dup needs SAME user-visible failure AND SAME root cause.
       Same component != dup. Same error class != dup.
PRESERVE EXACT: issue numbers, error strings, stack frames.
ESCAPE: never. Schema or null.
OUTPUT JSON ONLY: {duplicate_of, why, evidence}. NO PROSE.
```

RECEIPT:
```json
{
  "duplicate_of": "<int>|null",
  "why": "<= 25 words; cite shared failure + shared cause>",
  "evidence": "<two file:line or two error strings>"
}
```

---

## Template 3 — Label picker

BRIEF:
```caveman
ROLE: label picker. RESPOND CAVEMAN.
READ issue + ALLOWED label set.
PICK <= 3 labels from ALLOWED. KEEP exact strings (case/hyphens).
ANCHOR: if unsure, omit. False positive worse than miss.
PRESERVE EXACT: every label string.
OUTPUT JSON ONLY: {labels: [...], why}. NO PROSE.
```

RECEIPT:
```json
{
  "labels": ["<allowed string>", "..."],
  "why": "<= 15 words>"
}
```

---

## Template 4 — Missing-info lens

BRIEF:
```caveman
ROLE: missing-info lens. RESPOND CAVEMAN.
READ issue.
DECIDE missing_info: true|false.
ANCHOR: TRUE only if (no repro) OR (no env) OR (no expected/actual)
       AND that absence blocks action. "Could be more detailed" = false.
ESCAPE TO NORMAL: if security report (do not pester reporter).
OUTPUT JSON ONLY: {missing_info, ask}. ask = caveman question OR null.
```

RECEIPT:
```json
{
  "missing_info": true,
  "ask": "<caveman question, <= 25 words, OR null if missing_info=false>"
}
```

---

## Template 5 — Style lens (diff scan)

BRIEF:
```caveman
ROLE: style lens. RESPOND CAVEMAN until done.
SCAN DIFF below.
STYLE ONLY: naming, imports, dead code, redundant comments, magic
numbers, pattern drift vs codebase.
IGNORE: correctness, security, perf, tests.
PRESERVE EXACT: all code, paths, line numbers.
EMIT one finding per line as JSONL.
SCHEMA: {file, line, issue, fix}. issue + fix caveman, <= 15 words.
NO PROSE OUTSIDE JSONL.
```

RECEIPT (JSONL stream):
```jsonl
{"file":"src/foo.py","line":42,"issue":"snake_case violated","fix":"rename FooBar -> foo_bar"}
{"file":"src/foo.py","line":58,"issue":"dead import os","fix":"remove"}
```

---

## Template 6 — EXTEND HERE

Add project-specific classifier templates below this line.
Follow the pattern: ROLE declaration + RESPOND CAVEMAN + task imperatives
+ ANCHOR + PRESERVE EXACT + ESCAPE condition + OUTPUT schema directive.

```caveman
ROLE: <name>. RESPOND CAVEMAN until done.
<task imperatives>
ANCHOR: <highest-risk bucket grounding>.
PRESERVE EXACT: <what must not be rewritten>.
ESCAPE TO NORMAL: <when>.
OUTPUT JSON ONLY: {<schema>}. NO PROSE OUTSIDE JSON.
```
