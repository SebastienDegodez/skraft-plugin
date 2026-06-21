<!-- markdownlint-disable-file -->
# AC Draft — US1 — Fondation Clean Architecture

**Story:** En tant que mainteneur du framework, je veux un socle hexagonal (domain pur → application → ports → adapters) avec Result type et audit JSONL, afin de construire des garde-fous testables boundary-to-boundary, sans dépendance.

## Acceptance Criteria

### AC1 — node --test suite verte, zéro dépendance runtime
**Given** le projet est cloné sans `npm install`
**When** `node --test` est exécuté (ou avec glob sur `tests/`)
**Then** la suite s'exécute et passe (0 failing, ≥ 1 passing ou "0 tests" si suite vide); `package.json` ne déclare aucune dépendance runtime

### AC2 — Domain pur : aucun import du protocole hook
**Given** les fichiers sous `domain/` existent
**When** on lit tous les `import` dans `domain/**/*.mjs`
**Then** aucun chemin d'import ne contient `adapters/drivers/hooks` ni `ports/driver`

### AC3 — Audit writer JSONL append-only + null variant
**Given** un `jsonl-audit-writer` initialisé sur un fichier temporaire
**When** on appelle `write(entry)` deux fois
**Then** le fichier contient exactement 2 lignes JSON valides (append-only, pas de troncature)
**And** un `null-audit-writer` existe et expose la même interface sans effet de bord

### AC4 — payload.mjs normalise les 3 formats
**Given** `payload.mjs` est importé
**When** on passe `{ toolName: "bash" }` (camelCase), `{ ToolName: "bash" }` (PascalCase), `{ tool_name: "bash" }` (snake_case)
**Then** les 3 appels retournent un objet avec la clé `toolName` = `"bash"` (normalisé en camelCase)

## Domain Examples
1. `Ok(42)` → `{ ok: true, value: 42 }` ; `Err("not-found")` → `{ ok: false, error: "not-found" }`
2. Audit JSONL: 2 appels `write` → 2 lignes dans le fichier (append)
3. `normalise({ tool_name: "bash" })` → `{ toolName: "bash" }`

## Technical Notes
- Runtime: Node.js ESM (.mjs), zero runtime deps, node --test built-in
- Ports are pure JS interfaces (duck-typing, no class hierarchy)
- Adapters implement port contracts by duck-typing
- Config cascade: project-local > global > environment variables
- JSONL = one JSON object per line, newline-terminated, file opened in append mode

## DoR Checklist
1. ✅ Problem statement
2. ✅ Specific persona
3. ✅ 3+ domain examples with real values
4. ✅ UAT scenarios written
5. ✅ AC derived from UAT
6. ✅ Right-sized (M)
7. ✅ Technical notes
8. ✅ Dependencies listed (none)
