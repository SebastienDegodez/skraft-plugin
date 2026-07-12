// Port constant for the StateBackupReader outbound port (US13 recovery/rollback).
// Duck-typed contract: { list(projectSlug: string): Promise<Backup[]> }
//   Backup = { name: string, timestamp: number, raw: object | null }
// `raw` is the parsed JSON of the backup, or null when the backup file is itself
// unreadable/corrupt. MUST NOT throw for a missing directory — returns [] instead.
// Reads only the rotating backups created by the atomic writer (#60); never writes.
export const STATE_BACKUP_READER_PORT = 'StateBackupReader'
