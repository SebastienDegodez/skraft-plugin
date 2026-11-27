# Business-alignment lens — examples

Worked examples of the gates of `acceptance-review-business-alignment`, gate by gate.

## G3 — Business Vocabulary

**Definition:** All nouns, verbs, and adjectives in Given/When/Then steps appear in the domain vocabulary of the stories or the domain lexicon. No technical identifiers.

**How to check:**
1. Extract all words from Given/When/Then steps
2. Cross-reference with: story vocabulary, AC vocabulary, domain lexicon (FR→EN table)
3. Flag any word that is: a class name, a method name, an HTTP verb, a framework term, or a database term

**Auto-fail words (examples):**
- `Repository`, `Service`, `Handler`, `Controller`, `Adapter`, `UseCase`
- `POST`, `GET`, `PUT`, `DELETE`, `HTTP`, `REST`, `JSON`, `XML`
- `null`, `true`, `false` (unless genuinely part of domain language)
- `SQL`, `SELECT`, `INSERT`, `ORM`, `Entity`
- Any PascalCase identifier (class name signal)

**Severity:** HIGH

---

## G4 — No Technical Jargon

**Definition:** Given/When/Then steps contain zero implementation details.

**How to check:**
1. Read each step as if you are a domain expert with no software engineering background
2. Ask: "Would this step make sense to a business analyst?"
3. Flag any step that would require software knowledge to understand

**Auto-fail examples:**
```gherkin
# ❌ BLOCKER
When I call the EligibilityApplicationService.checkEligibility method
Then HTTP status 200 is returned with body {"eligible": true}
Given the InMemoryEligibilityRepository is seeded with driver "DRV-001"
```

**Severity:** BLOCKER
