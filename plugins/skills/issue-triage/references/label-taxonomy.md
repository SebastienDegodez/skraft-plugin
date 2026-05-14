# Recommended Label Taxonomy

Full label definitions, color conventions, creation instructions, and conflict rules for GitHub issue triage in the DISCOVER phase.

---

## Complete Label Tree

### Type Labels

| Label | Color (hex) | Description |
|---|---|---|
| `type/feature` | `#0075ca` (blue) | New user-facing capability that does not currently exist |
| `type/bug` | `#d73a4a` (red) | Incorrect behavior relative to expected behavior |
| `type/tech-debt` | `#e4e669` (yellow) | Internal quality improvement — no user-facing behavior change |
| `type/docs` | `#cfd3d7` (light grey) | Documentation: README, API docs, in-code comments |
| `type/question` | `#d876e3` (purple) | Needs clarification before it can be triaged properly |

### Priority Labels

| Label | Color (hex) | Description |
|---|---|---|
| `priority/P0` | `#b60205` (dark red) | Blocking users or legal/compliance/data-loss risk. Mandatory written justification. |
| `priority/P1` | `#e4811b` (orange) | High business value. Should be in the next sprint. |
| `priority/P2` | `#fbca04` (amber) | Medium value. Target the next 2–3 sprints. |
| `priority/P3` | `#fef2c0` (pale yellow) | Nice-to-have. Not in the current roadmap. |

### Effort Labels

| Label | Color (hex) | Approximate Duration |
|---|---|---|
| `effort/XS` | `#daeefe` (very light blue) | < 2 hours |
| `effort/S` | `#b3d9f7` (light blue) | 2–4 hours |
| `effort/M` | `#7bc8f6` (medium blue) | ~1 day |
| `effort/L` | `#3fa8e0` (blue) | 2–3 days |
| `effort/XL` | `#1a6fa8` (dark blue) | > 3 days — must split before DISCUSS |

### Status Labels

| Label | Color (hex) | Meaning |
|---|---|---|
| `status/needs-triage` | `#ededed` (light grey) | Newly created; not yet classified |
| `status/ready` | `#0e8a16` (green) | Triaged — has type, priority, effort. Ready for DISCUSS. |
| `status/duplicate` | `#cfd3d7` (grey) | Confirmed duplicate. Original linked in comment. |
| `status/wontfix` | `#ffffff` (white/outline) | Explicitly out of scope. Decision documented. |

### Area Labels (Optional)

| Label | Color (hex) | Coverage |
|---|---|---|
| `area/domain` | `#f9d0c4` (salmon) | Domain logic: entities, value objects, domain services |
| `area/api` | `#c2e0c6` (light green) | API layer: controllers, DTOs, contracts |
| `area/infra` | `#e8d7f5` (light purple) | Infrastructure: persistence, external integrations |
| `area/ui` | `#ffd8b2` (peach) | Frontend / client-facing surfaces |

---

## Creating Labels in GitHub

### Via GitHub Web UI

1. Go to **{owner}/{repo}** → **Issues** → **Labels**
2. Click **New label**
3. Enter name exactly as listed above (case-sensitive, slash notation preserved)
4. Enter hex color without the `#` prefix
5. Add a description matching the table above
6. Click **Create label**

### Via GitHub CLI

```bash
# Example: create priority/P0 label
gh label create "priority/P0" \
  --color "b60205" \
  --description "Blocking users or legal/compliance/data-loss risk. Mandatory written justification."

# Example: create effort/M label
gh label create "effort/M" \
  --color "7bc8f6" \
  --description "~1 day — a new use case, endpoint, or feature with 2-3 ACs"
```

### Bulk Creation Script (bash)

```bash
#!/usr/bin/env bash
REPO="owner/repo"

declare -A labels=(
  ["type/feature"]="0075ca:New user-facing capability"
  ["type/bug"]="d73a4a:Incorrect behavior"
  ["type/tech-debt"]="e4e669:Internal quality improvement"
  ["type/docs"]="cfd3d7:Documentation"
  ["type/question"]="d876e3:Needs clarification"
  ["priority/P0"]="b60205:Blocking — requires written justification"
  ["priority/P1"]="e4811b:High value — next sprint"
  ["priority/P2"]="fbca04:Medium value — next 2-3 sprints"
  ["priority/P3"]="fef2c0:Nice-to-have"
  ["effort/XS"]="daeefe:Under 2 hours"
  ["effort/S"]="b3d9f7:2-4 hours"
  ["effort/M"]="7bc8f6:About 1 day"
  ["effort/L"]="3fa8e0:2-3 days"
  ["effort/XL"]="1a6fa8:Over 3 days — must split"
  ["status/needs-triage"]="ededed:Not yet classified"
  ["status/ready"]="0e8a16:Ready for DISCUSS"
  ["status/duplicate"]="cfd3d7:Confirmed duplicate"
  ["status/wontfix"]="ffffff:Out of scope"
)

for name in "${!labels[@]}"; do
  IFS=':' read -r color description <<< "${labels[$name]}"
  gh label create "$name" --repo "$REPO" --color "$color" --description "$description"
done
```

---

## Combining Labels

Every triaged issue should receive exactly **one label from each required group**:

| Group | Required? | One per issue? |
|---|---|---|
| `type/*` | Required | Yes — exactly one |
| `priority/*` | Required | Yes — exactly one |
| `effort/*` | Required | Yes — exactly one |
| `status/*` | Required | Yes — exactly one |
| `area/*` | Optional | One or more allowed |

**Example — complete label set for a triaged issue**:
```
type/bug, priority/P0, effort/S, status/ready, area/domain
```

**Example — area label stacking** (allowed):
```
type/feature, priority/P1, effort/M, status/ready, area/domain, area/api
```
(A feature that touches both domain and API layers)

---

## Label Conflicts

The following label combinations are **mutually exclusive** — never apply both:

| Conflict pair | Reason |
|---|---|
| `status/ready` + `status/needs-triage` | An issue cannot be both ready and untriaged |
| `status/duplicate` + `status/ready` | Duplicates are not eligible for DISCUSS |
| `status/wontfix` + any `priority/*` | A won't-fix issue should not have a priority |
| `priority/P0` + `priority/P1` | One priority per issue |
| `effort/XS` + `effort/XL` | One effort estimate per issue |
| `type/bug` + `type/feature` | One type per issue; if ambiguous, classify by primary intent |

**Conflicting status resolution**: when transitioning between statuses, always **replace** the old label, never accumulate:
- `needs-triage` → triage → remove `needs-triage`, add `ready`
- `ready` → confirmed duplicate → remove `ready`, add `duplicate`

---

## Label Lifecycle

```
[Created] → status/needs-triage
    ↓
[Triaged] → remove needs-triage
           → add type/* + priority/* + effort/* + status/ready
    ↓
[DISCUSS entered] → no label change (status/ready remains)
    ↓
[Confirmed duplicate] → remove status/ready → add status/duplicate
    ↓
[Won't fix] → remove all priority/* → add status/wontfix
```
