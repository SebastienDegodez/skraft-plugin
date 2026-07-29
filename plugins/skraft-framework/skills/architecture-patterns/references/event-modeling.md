# Event Modeling Methodology

## Overview

Event Modeling is a BDD-first system modeling technique that captures system behaviour as a timeline of events. It was introduced by Adam Dymitruk as a way to make system design accessible to non-technical stakeholders while remaining rigorous enough to drive implementation.

**Core premise:** Every system can be described as a sequence of commands (intent), events (facts), and read models (views). The timeline tells the story of the system from the outside in.

**Why Event Modeling first:** Before writing aggregates or use cases, you need to know what the system does in business terms. Event Modeling produces that shared understanding.

---

## Core Concepts

### Blueprint

The blueprint is the full event timeline drawn on a shared whiteboard or tool. It shows the complete story of the system — every major user action and its outcome — in chronological order.

Reading the blueprint: left to right = time. Top row = commands (what users or systems do). Middle row = events (what the system records). Bottom row = read models (what users see).

### Commands

A command expresses **user or system intent**. It is imperative and directed.

- Grammar: imperative verb phrase — `CheckEligibility`, `SubmitApplication`, `RenewPolicy`
- Commands **may be rejected** — an unsuccessful command does not produce the expected event
- Who sends commands: users (via UI), other systems (via API), scheduled processes (timers), or sagas (internal process managers)
- A command has a clear target aggregate

### Events

An event records **a fact that has happened**. It is in the past tense and immutable.

- Grammar: past tense verb phrase — `EligibilityChecked`, `ApplicationSubmitted`, `PolicyRenewed`
- Events **cannot be rejected** — they are facts; once emitted, they are permanent
- Events are the audit trail of the system
- Events trigger read model updates (projections)

### Read Models

A read model is the **output of a query** — a view of the system state optimised for a specific consumer.

- Read models are shaped for the consumer, not for the domain
- They are updated by projections that react to events
- A read model can be as simple as a single value or as complex as an aggregated report
- Examples: `EligibilityResult`, `ApplicationStatus`, `PolicySummary`

---

## Step-by-Step Process

### Step 1: Brainstorm Events

Start with events. Ask the product stakeholders: "What facts about your business need to be recorded?"

- Write each event on a separate sticky note
- Use past tense consistently
- Do not filter — capture everything first
- Target: 20–50 events for a meaningful feature set

### Step 2: Group by Aggregate or Context

Arrange events into columns based on which aggregate produces them and which bounded context they belong to.

- Events in the same column share a consistency boundary
- Events that must be atomic together belong to the same aggregate

### Step 3: Identify Commands

For each event, ask: "What action triggered this fact?"

- Place the command above its corresponding event on the timeline
- One command may produce multiple events (e.g., a rejection command produces both a rejection event and a notification event)
- If two different commands can produce the same event, model them separately

### Step 4: Identify Read Models

For each command, ask: "What information did the user need to see before they could perform this action?"

- Place the read model to the left of the command it informs
- A read model consumed by a command is that command's precondition view

### Step 5: Define Slices

A slice is one complete vertical cut: one command + the events it produces + the read model it returns.

- Each slice is the minimum deliverable unit of business value
- Slices become the scope of individual user stories and Gherkin scenarios
- Slices that share an aggregate are candidates for the same sprint

---

## Notation

### Mermaid Timeline

```
timeline
    title Eligibility Check — Event Timeline
    section Commands
        CheckEligibility : Driver submits eligibility request
        RenewEligibility : Driver requests renewal before expiry
    section Events
        EligibilityChecked : EligibilityAggregate emits result
        EligibilityRenewed : EligibilityAggregate emits renewal confirmation
    section Read Models
        EligibilityResult : Displays eligibility status and validity period
        EligibilityHistory : Lists all past checks for a driver
```

### Swimlane Notation

For complex timelines, use swimlanes to separate bounded contexts:

```
graph LR
    subgraph EligibilityContext
        C1[CheckEligibility] --> E1[EligibilityChecked]
        E1 --> R1[EligibilityResult]
    end
    subgraph PolicyContext
        C2[IssuePolicy] --> E2[PolicyIssued]
        E2 --> R2[PolicySummary]
    end
    E1 -->|upstream event| C2
```

**Colour coding convention:**
- Commands → blue (#4A90D9)
- Events → orange (#F5A623)
- Read Models → green (#7ED321)

---

## Slice Definition

A slice is the minimum vertical unit that delivers observable business value.

**Slice anatomy:**
1. **Command** — what the user does
2. **Domain Event(s)** — what the system records
3. **Read Model** — what the user sees as a result

**Slice completeness check:**
- Can a user perform this action without additional slices? → Complete
- Does the result of this action directly satisfy an acceptance criterion? → Complete
- Does implementing this slice require another slice to be implemented first? → Note the dependency

**Good slice size:** One story, one command, one to three events, one read model.

---

## Relationship to Gherkin

Each slice maps to one or more Gherkin scenarios. The mapping is direct and traceable.

| Event Model element | Gherkin element | Example |
|---|---|---|
| Pre-condition state (prior events) | `Given` | "Given a driver with a clean record" |
| Command | `When` | "When the driver requests an eligibility check" |
| Domain Event outcome | `Then` | "Then the driver is declared eligible" |
| Read Model content | `And Then` | "And the eligibility certificate is valid for 30 days" |

**Rule:** One Gherkin scenario per success path per slice. Additional scenarios cover rejection paths and boundary conditions.

---

## Auto-Insurance Domain Examples

### Eligibility Check Flow

| Step | Element | Name | Fields |
|---|---|---|---|
| 1 | Command | `CheckEligibility` | driverId, requestedAt |
| 2 | Event (success) | `EligibilityChecked` | driverId, result: Eligible, validUntil |
| 3 | Event (rejection) | `EligibilityDenied` | driverId, result: Ineligible, rejectionReason |
| 4 | Read Model | `EligibilityResult` | eligible: bool, validUntil?, rejectionReason? |

### Application Submission Flow

| Step | Element | Name | Fields |
|---|---|---|---|
| 1 | Command | `SubmitApplication` | applicantId, policyType, vehicleInfo |
| 2 | Event | `ApplicationSubmitted` | applicationId, submittedAt, status: Pending |
| 3 | Read Model | `ApplicationStatus` | applicationId, status, submittedAt |

### Policy Renewal Flow

| Step | Element | Name | Fields |
|---|---|---|---|
| 1 | Command | `RenewPolicy` | policyId, requestedAt |
| 2 | Event (success) | `PolicyRenewed` | policyId, newExpiryDate |
| 3 | Event (lapsed) | `PolicyRenewalDeclined` | policyId, reason |
| 4 | Read Model | `PolicyStatus` | policyId, status: Active|Lapsed, expiryDate |

---

## Common Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Modelling implementation steps | Events named `SaveToDatabase`, `CallExternalAPI` | Reframe in business terms: "What fact is the business recording?" |
| Missing read models | Commands have no preceding view; queries are undefined | Ask: "What did the user need to see to know this action was needed?" |
| Too many aggregates | 15 aggregates for 5 stories; all aggregates have 1–2 events | Merge aggregates whose events must always be consistent together |
| Commands that cannot fail | Every command has exactly one success event; no rejection path | All commands can be rejected — add the rejection event |
| Events in application layer | Events named `UserCreatedSuccessfully` raised from a service | Events are facts — raise them from aggregates, name them without "Successfully" |
| Over-modelling the future | 30 slices for 3 stories | Model only what the current story set requires — YAGNI applies |
