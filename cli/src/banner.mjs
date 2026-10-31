/**
 * The skraft banner, written on stderr once, when a person opens a session (`skraft` alone in a
 * terminal). A one-shot command never shows it: its output stays exactly the engine's.
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
 * @param {{ env: Record<string, string | undefined>, platform: string }} terminal
 * @returns {{ letters: string[], width: number, colour: boolean, trueColour: boolean }}
 */
const styleOf = ({ env, platform }) => {
  const letters = legacyConsole(env, platform) ? PLAIN : SHADOW
  return {
    letters,
    width: Math.max(...letters.map((line) => line.length)),
    colour: !('NO_COLOR' in env) && env.TERM !== 'dumb',
    trueColour: /truecolor|24bit/i.test(env.COLORTERM ?? '') || Boolean(env.WT_SESSION),
  }
}

/** @param {ReturnType<typeof styleOf>} style @param {string} version */
const footerOf = ({ width, colour }, version) => {
  const text = `${TAGLINE} · cli ${version}`.padStart(width)
  return colour ? `\x1b[2m${text}\x1b[0m` : text
}

/** @param {ReturnType<typeof styleOf>} style @param {number} shown columns revealed */
const logoOf = ({ letters, width, colour, trueColour }, shown) =>
  letters.map((line) => {
    const visible = line.slice(0, shown)
    return colour ? painted(visible, width, trueColour) : visible
  })

/**
 * @param {{ env: Record<string, string | undefined>, platform: string, version: string }} terminal
 * @returns {string} the banner, newline-terminated
 */
export const banner = ({ env, platform, version }) => {
  const style = styleOf({ env, platform })
  return `\n${logoOf(style, style.width).join('\n')}\n${footerOf(style, version)}\n\n`
}

/**
 * The banner sweeps in from the left, in about 400 ms, then the tagline appears. Animated only on
 * a colour terminal; otherwise, or with SKRAFT_BANNER=static, it is written at once.
 * @param {{ env: Record<string, string | undefined>, platform: string, version: string, write: (text: string) => void, animate: boolean }} terminal
 * @returns {Promise<void>}
 */
export const showBanner = async ({ env, platform, version, write, animate }) => {
  const style = styleOf({ env, platform })
  if (!animate || !style.colour || env.SKRAFT_BANNER === 'static') {
    write(banner({ env, platform, version }))
    return
  }
  const frames = 16
  const rows = style.letters.length
  write(`\x1b[?25l\n${'\n'.repeat(rows)}`)
  try {
    for (let frame = 1; frame <= frames; frame += 1) {
      const shown = Math.ceil((style.width * frame) / frames)
      write(`\x1b[${rows}A\r${logoOf(style, shown).map((line) => `${line}\x1b[K`).join('\n')}\n`)
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    write(`${footerOf(style, version)}\n\n`)
  } finally {
    write('\x1b[?25h')
  }
}
