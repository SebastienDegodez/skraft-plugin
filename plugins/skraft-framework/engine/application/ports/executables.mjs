/**
 * Executables — where a program would be started from, without starting it.
 *
 * @typedef {{ locate: (program: string, cwd: string) => Promise<string | null> }} Executables
 *   program: argv[0] as written (`dotnet`, `./gradlew`); cwd relative to the working copy.
 *   null when no such program exists on the PATH (or at that path).
 */
export {}
