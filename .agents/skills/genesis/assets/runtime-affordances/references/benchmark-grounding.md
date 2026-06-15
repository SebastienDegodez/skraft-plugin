# Benchmark grounding for role-class choices

Verified 2026-05-29 from vals.ai (SWE-bench Verified, Terminal-Bench
2.1, Vals Index, LiveCodeBench, Vibe Code Bench). Refresh if more
than 90 days stale.

Grounding, not a leaderboard: map the benchmark task profile to the
role class before changing a binding. Anthropic published rates per
Mtok in/out: Haiku 4.5 $1/$5; Sonnet 4.6 $3/$15; Opus 4.7 $15/$75.

## Cross-benchmark table

| Model | SWE-bench Verified | Terminal-Bench 2.1 | Vals Index |
|---|---:|---:|---:|
| Claude Haiku 4.5 (Thinking) | 66.6%, $0.37/test | 43.8% | 40.3% |
| Claude Sonnet 4.6 | 77.4%, $1.30/test | gap in visible set | 60.3% |
| Claude Opus 4.7 | 82.0%, $2.42/test | 68.5% | 66.1% |
| Claude Opus 4.8 | 88.6%, $1.92/test | 71.9% | 70.2% |
| GPT 5.5 | 82.6%, $1.36/test | 76.4% | 67.6% |

SWE-bench is bash-tool over 500 GH issues; Terminal-Bench probes
Claude Code / Codex / Cursor autonomous loops and ranks GPT 5.5
above Opus where SWE-bench does not; LiveCodeBench is pure codegen;
Vibe Code Bench is whole-app; Vals Index is the composite.

## SWE-bench task-length view

Buckets captured 2026-05-29: <15m (194), 15m-1h (261), 1-4hr (42),
>4hr (3, noisy).

| Model | <15m | 15m-1h | 1-4hr | >4hr |
|---|---:|---:|---:|---:|
| Claude Opus 4.8 | 93% | 88% | 74% | 67% |
| Claude Opus 4.7 | 90% | 79% | 64% | 67% |
| Claude Sonnet 4.6 | 87% | 75% | 50% | 33% |
| GPT 5.5 | 92% | 81% | 50% | 67% |

Bucket-to-role-class: `<15m` -> TRIVIAL / IMPLEMENTER; `15m-1h` ->
IMPLEMENTER / REVIEWER (Sonnet knee); `1-4hr` -> PLANNER (cite a
multi-file or fault-boundary stake); `>4hr` -> RESEARCHER (3 tasks).

## Anti-patterns to cite at B12

SONNET-AVERSION: defaulting to Opus on REVIEWER or IMPLEMENTER work
without a long-task, high-stakes, or unclear-fault-boundary cite is
WRONG-PRIMITIVE BINDING. Sub-hour SWE-bench puts Sonnet 4.6 near the
knee at ~5x lower published token rate than Opus 4.7; Vals Index gap
is 5.8 points (60.3 vs 66.1), not a blanket promotion.

HAIKU-PROMOTION: routing Haiku to IMPLEMENTER on autonomous tool
loops is the inverse miss. The 66.6% SWE-bench top-line trails
Sonnet by ~11pts and Opus 4.7 by ~15pts; Terminal-Bench (43.8%) and
Vals Index (40.3%) confirm the gap compounds across turns. Haiku
fits TRIVIAL: classifiers, normalizers, B11 routing.
