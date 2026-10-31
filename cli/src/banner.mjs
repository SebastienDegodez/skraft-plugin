/**
 * The skraft banner, written on stderr when a person starts the command in a terminal.
 * stdout is never touched: `--json` output and the version line stay machine-readable.
 */

/** Box-drawing letters: Windows Terminal, macOS and Linux terminals. */
const SHADOW = [
  "███████╗██╗  ██╗██████╗  █████╗ ███████╗████████╗",
  "██╔════╝██║ ██╔╝██╔══██╗██╔══██╗██╔════╝╚══██╔══╝",
  "███████╗█████╔╝ ██████╔╝███████║█████╗     ██║",
  "╚════██║██╔═██╗ ██╔══██╗██╔══██║██╔══╝     ██║",
  "███████║██║  ██╗██║  ██║██║  ██║██║        ██║",
  "╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝        ╚═╝"
]

/** Plain ASCII: the legacy Windows console, whose code page garbles box-drawing letters. */
const PLAIN = [
  "     _               __ _",
  " ___| | ___ __ __ _ / _| |_",
  "/ __| |/ / '__/ _` | |_| __|",
  "\\__ \\   <| | | (_| |  _| |_",
  "|___/_|\\_\\_|  \\__,_|_|  \\__|"
]

const TAGLINE = 'AI-powered digital craft'

/** The logo's gradient, left to right: green, teal, blue. */
const STOPS = [
  [0x5e, 0xe6, 0x9a],
  [0x2f, 0xc8, 0xd8],
  [0x3b, 0x82, 0xf6],
]

/** @param {{ argv: string[], env: Record<string, string | undefined>, isTTY: boolean }} call @returns {boolean} */
export const wantsBanner = ({ argv, env, isTTY }) => {
  if (env.SKRAFT_BANNER === '0') return false
  if (env.SKRAFT_BANNER === '1') return true
  if (!isTTY || env.CI) return false
  return !argv.some((arg) => arg === '--json' || arg === '--version')
}

/** @param {number} at 0..1 @returns {number[]} */
const colourAt = (at) => {
  const scaled = at * (STOPS.length - 1)
  const index = Math.min(Math.floor(scaled), STOPS.length - 2)
  const [from, to] = [STOPS[index], STOPS[index + 1]]
  return from.map((channel, i) => Math.round(channel + (to[i] - channel) * (scaled - index)))
}

/** @param {number[]} rgb @param {boolean} trueColour */
const escapeOf = ([r, g, b], trueColour) =>
  trueColour ? `\x1b[38;2;${r};${g};${b}m` : `\x1b[38;5;${16 + 36 * Math.round((r / 255) * 5) + 6 * Math.round((g / 255) * 5) + Math.round((b / 255) * 5)}m`

/** @param {string} line @param {number} width @param {boolean} trueColour */
const painted = (line, width, trueColour) =>
  [...line].map((char, column) => (char === ' ' ? char : `${escapeOf(colourAt(column / Math.max(width - 1, 1)), trueColour)}${char}`)).join('') + '\x1b[0m'

/** @param {Record<string, string | undefined>} env @param {string} platform */
const legacyConsole = (env, platform) => platform === 'win32' && !env.WT_SESSION && !env.TERM_PROGRAM

/**
 * @param {{ env: Record<string, string | undefined>, platform: string, version: string }} terminal
 * @returns {string} the banner, newline-terminated
 */
export const banner = ({ env, platform, version }) => {
  const letters = legacyConsole(env, platform) ? PLAIN : SHADOW
  const width = Math.max(...letters.map((line) => line.length))
  const colour = !('NO_COLOR' in env) && env.TERM !== 'dumb'
  const trueColour = /truecolor|24bit/i.test(env.COLORTERM ?? '') || Boolean(env.WT_SESSION)
  const logo = letters.map((line) => (colour ? painted(line, width, trueColour) : line))
  const footer = `${TAGLINE} · cli ${version}`
  const dim = (text) => (colour ? `\x1b[2m${text}\x1b[0m` : text)
  return `\n${logo.join('\n')}\n${dim(footer.padStart(width))}\n\n`
}
