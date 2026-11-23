/**
 * Timer — runs a function again and again while the run goes.
 *
 * @typedef {{ every: (ms: number, run: () => Promise<void>) => () => void }} Timer
 *   every: calls run every ms milliseconds until the function it returns is called; a host
 *   keeps no process alive for it. run never rejects.
 */
export {}
