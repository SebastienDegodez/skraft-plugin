# Artifact-Driven Discovery Heuristics

Algorithm for discovering GitHub issues that are semantically related to the code a developer is currently modifying. Converts file system signals into domain-aware search queries.

---

## Overview

When a developer is actively changing code in a specific domain area, artifact-driven discovery surfaces issues that are likely relevant to that work — without requiring the developer to manually specify keywords.

**Signal source**: recently modified files (git history, last 7 days)
**Output**: a ranked list of open issues related to the modified domain area

---

## Algorithm

```
Step 1: Extract recently modified files from git
Step 2: Derive domain keywords from file names and paths
Step 3: Build a GitHub search query from top keywords
Step 4: Execute search and rank results by relevance
Step 5: Return top 20 results for triage
```

---

## Step 1: Extract Recently Modified Files

Run:
```bash
git log --since="7 days ago" --diff-filter=M --name-only --pretty=format: | sort -u
```

**Flags explained**:
- `--since="7 days ago"`: only commits from the last week
- `--diff-filter=M`: modified files only (excludes added/deleted/renamed)
- `--name-only`: only file names, no commit metadata
- `--pretty=format:`: suppress commit headers (empty format = only file names)
- `sort -u`: deduplicate

**Example output**:
```
src/MonAssurance.Application/Eligibility/EligibilityUseCase.cs
src/MonAssurance.Domain/Driver/DriverProfile.cs
src/MonAssurance.Domain/Driver/DriverAge.cs
src/MonAssurance.Infrastructure/Persistence/EligibilityRepository.cs
tests/MonAssurance.UnitTests/Eligibility/EligibilityUseCaseTests.cs
```

**Fallback**: if git is unavailable or history is empty, skip artifact-driven and report:
```
[ARTIFACT-DRIVEN SKIPPED] No git history available. Using user-assigned mode.
```

---

## Step 2: Domain Term Extraction

### 2a. Extract Raw Terms from File Paths

For each file path:
1. Take the file name (last path segment), remove extension
2. Split PascalCase: `EligibilityUseCase` → `["Eligibility", "Use", "Case"]`
3. Split on underscores: `driver_profile` → `["driver", "profile"]`
4. Flatten to single token list

**PascalCase splitting algorithm** (regex-based):
```
pattern = /([A-Z][a-z]+)/g
"EligibilityUseCase".match(pattern) → ["Eligibility", "Use", "Case"]
"DriverAge".match(pattern) → ["Driver", "Age"]
```

### 2b. Filter Infrastructure Terms

Discard tokens that are implementation/infrastructure vocabulary (not domain):

| Discard list | Reason |
|---|---|
| `Controller`, `Handler`, `Middleware` | HTTP layer |
| `Repository`, `DbContext`, `Migration` | Persistence layer |
| `Service`, `Factory`, `Builder`, `Mapper` | DI patterns |
| `UseCase`, `Command`, `Query`, `Event` | CQRS plumbing |
| `Test`, `Tests`, `Spec`, `Mock`, `Fake` | Test infrastructure |
| `Dto`, `Request`, `Response`, `Model` | Data transfer objects |
| `Config`, `Settings`, `Options` | Configuration |
| `Base`, `Abstract`, `Interface` | OOP boilerplate |
| `Extension`, `Helper`, `Util`, `Utils` | Utility |

### 2c. Keep Domain Nouns

Keep tokens that represent business concepts in the auto-insurance domain:

| Domain nouns to keep (examples) |
|---|
| `Eligibility`, `Eligible`, `Ineligible` |
| `Driver`, `DriverAge`, `DriverProfile` |
| `Application`, `Policy`, `Quote`, `Premium` |
| `Claim`, `Vehicle`, `Coverage` |
| `Underwriting`, `Risk` |
| `Renewal`, `Cancellation` |

**General rule**: keep single-word tokens that a business analyst would recognize without technical context.

### 2d. Deduplicate and Rank

1. Lowercase all kept tokens
2. Remove duplicates (preserve first occurrence)
3. Score by frequency (terms appearing in multiple files = higher signal)
4. Take top 3–5 most frequent domain terms

**Example**:
```
Input files: EligibilityUseCase.cs, DriverProfile.cs, DriverAge.cs, EligibilityRepository.cs

Extracted: [eligibility, use, case, driver, profile, driver, age, eligibility]
After filter (remove: use, case): [eligibility, driver, profile, driver, age, eligibility]
Deduplicated with frequency: {eligibility: 2, driver: 2, profile: 1, age: 1}
Top terms: [eligibility, driver]
```

---

## Step 3: Query Construction

**Template**:
```
{term1} OR {term2} OR {term3} in:title is:open is:issue sort:updated-desc
```

**Rules**:
- Use `in:title` — title matches are stronger signals than body matches
- Prefer 2–3 terms (more terms = better coverage, but diminishing returns beyond 3)
- Do not quote multi-word concepts unless testing exact phrase match

**Example queries**:

| Modified files | Extracted terms | Query |
|---|---|---|
| `EligibilityUseCase.cs`, `DriverProfile.cs` | `eligibility`, `driver` | `eligibility OR driver in:title is:open is:issue sort:updated-desc` |
| `QuoteCalculator.cs`, `PremiumEngine.cs` | `quote`, `premium` | `quote OR premium in:title is:open is:issue sort:updated-desc` |
| `ClaimHandler.cs`, `VehicleRepository.cs` | `claim`, `vehicle` | `claim OR vehicle in:title is:open is:issue sort:updated-desc` |
| `RenewalPolicy.cs` | `renewal`, `policy` | `renewal OR policy in:title is:open is:issue sort:updated-desc` |

---

## Step 4: Relevance Ranking

After fetching search results, rank by relevance:

| Signal | Weight | How to detect |
|---|---|---|
| All domain terms in title | Highest | All query terms appear in title |
| Primary domain term in title | High | First/most frequent term in title |
| Domain term in body only | Medium | Term not in title but in body |
| Recently updated | Boost | `updated_at` within last 30 days |
| High comment count | Boost | `comments` > 5 |
| `priority/P0` or `priority/P1` label | Boost | Always surfaces early |

**Deprioritize**:
- Issues labeled `wontfix`, `duplicate`, `invalid`
- Issues with no activity in > 90 days (unless P0)
- Issues where domain term appears only in a comment (not body or title)

---

## Auto-Insurance Domain Examples

### Scenario 1: Developer modifying eligibility flow

**Modified files**:
```
src/MonAssurance.Application/Eligibility/EligibilityUseCase.cs
src/MonAssurance.Domain/Eligibility/EligibilityResult.cs
```

**Extracted domain terms**: `eligibility`, `result`

**Query**:
```
eligibility in:title is:open is:issue sort:updated-desc
```
(Drop `result` — too generic)

**Expected to surface**:
- `#42: Add eligibility check for young drivers`
- `#47: Eligibility check does not handle international licenses`
- `#53: Return eligibility reasons in API response`

---

### Scenario 2: Developer modifying driver profile

**Modified files**:
```
src/MonAssurance.Domain/Driver/DriverProfile.cs
src/MonAssurance.Domain/Driver/DriverAge.cs
src/MonAssurance.Infrastructure/Persistence/DriverRepository.cs
```

**Extracted domain terms**: `driver`, `age` (drop `profile` — ambiguous in isolation)

**Query**:
```
driver OR age in:title is:open is:issue sort:updated-desc
```

**Expected to surface**:
- `#43: Fix validation error on driver age field`
- `#58: Driver profile missing secondary driver support`
- `#61: Age under 18 not blocked at UI level`

---

### Scenario 3: Developer modifying premium calculation

**Modified files**:
```
src/MonAssurance.Application/Quote/QuoteCalculationUseCase.cs
src/MonAssurance.Domain/Quote/PremiumCalculator.cs
```

**Extracted domain terms**: `quote`, `premium`, `calculation`

**Query**:
```
quote OR premium in:title is:open is:issue sort:updated-desc
```

**Expected to surface**:
- `#67: Premium calculation incorrect for multi-vehicle policies`
- `#71: Quote API returns stale premium after driver profile update`

---

## Anti-Patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| Using infrastructure terms in query | Surfaces noise (`Controller`, `Repository` issues) | Always filter step 2b |
| Querying with class names verbatim | `EligibilityUseCase in:title` returns almost nothing | Extract domain nouns, not class names |
| Too many terms (> 5 OR clauses) | Query becomes too broad, too many irrelevant results | Cap at 3 terms |
| Using `in:body` as primary qualifier | Body matches are weak signals | Prefer `in:title`, add `in:body` only as fallback |
| Skipping artifact-driven for test files only | Test files = domain signal | Keep domain nouns from test file names too |
