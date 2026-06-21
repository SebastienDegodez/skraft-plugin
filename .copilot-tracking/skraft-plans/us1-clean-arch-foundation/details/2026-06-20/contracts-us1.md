<!-- markdownlint-disable-file -->
# Interface Contracts — US1 — Fondation Clean Architecture

## domain/result.mjs
```ts
// Exports
Ok(value: any) → { ok: true, value }
Err(error: any) → { ok: false, error }
isOk(result) → boolean
isErr(result) → boolean
```

## domain/value-objects.mjs
```ts
Phase(name: string) → { type: 'Phase', value: string }  // DISCOVER|DISCUSS|DESIGN|DISTILL|DELIVER|DONE
AgentName(name: string) → { type: 'AgentName', value: string }
ProjectSlug(slug: string) → { type: 'ProjectSlug', value: string }  // kebab-case
Verdict(v: string) → { type: 'Verdict', value: string }  // APPROVED|REJECTED|NEEDS_REWORK
SkillRef(path: string) → { type: 'SkillRef', value: string }
```

## domain/error-codes.mjs
```ts
// Constants
MISSING_ARTEFACT = 'MISSING_ARTEFACT'
INVALID_STATE = 'INVALID_STATE'
PHASE_REJECTED = 'PHASE_REJECTED'
MAX_RETRIES_EXCEEDED = 'MAX_RETRIES_EXCEEDED'
CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND'
```

## domain/specifications.mjs
```ts
Specification<T> = { isSatisfiedBy(candidate: T): boolean }
andSpec(a, b) → Specification
orSpec(a, b) → Specification
notSpec(a) → Specification
```

## ports/driven/audit-writer.mjs (port contract — duck typing)
```ts
// AuditWriter port
{
  write(entry: object): Promise<void>  // append-only
}
```

## ports/driven/state-reader.mjs
```ts
{
  read(projectSlug: string): Promise<object>  // returns state JSON
  write(projectSlug: string, state: object): Promise<void>
}
```

## ports/driven/filesystem.mjs
```ts
{
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  appendFile(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  mkdir(path: string): Promise<void>
}
```

## ports/driven/time-provider.mjs
```ts
{
  now(): Date
  isoString(): string
}
```

## ports/driven/config.mjs
```ts
{
  get(key: string): any
  getAll(): object
}
```

## ports/driven/transcript-reader.mjs
```ts
{
  read(): Promise<string>
}
```

## ports/driven/commit-verifier.mjs
```ts
{
  verify(commitHash: string): Promise<boolean>
}
```

## ports/driver/pre-tool-use-port.mjs
```ts
{
  handle(payload: object): Promise<{ decision: 'allow'|'deny'|'block', message?: string, additionalContext?: string }>
}
```

## ports/driver/subagent-stop-port.mjs
```ts
{
  handle(payload: object): Promise<{ decision: 'allow'|'block', message?: string }>
}
```

## adapters/drivers/hooks/payload.mjs
```ts
normalise(raw: object): object  // converts all keys to camelCase (from PascalCase or snake_case)
```

## adapters/drivers/hooks/decision.mjs
```ts
allow(message?: string): object
deny(message: string): object
block(message: string): object
additionalContext(context: string): object
```

## application/config-loader.mjs
```ts
loadConfig(options?: { cwd?: string, home?: string, env?: object }): Promise<object>
// cascade: project-local > global > env
```
