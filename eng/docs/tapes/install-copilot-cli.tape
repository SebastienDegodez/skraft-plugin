# Real Copilot CLI install on a throwaway HOME; the hidden v2 step points the marketplace at
# integration/v2-next until 2.0.0 ships on main. Run from the repository root: vhs eng/docs/tapes/install-copilot-cli.tape
Output "/tmp/skraft-tape-install-copilot-cli.gif"
Set Shell "bash"
Set FontSize 15
Set FontFamily "Menlo"
Set Width 1100
Set Height 330
Set Padding 24
Set WindowBar Colorful
Set BorderRadius 8
Set Margin 0
Set TypingSpeed 25ms
Set Theme { "name": "skraft", "background": "#16181d", "foreground": "#d7dae0", "cursor": "#d7dae0", "selection": "#2c313a", "black": "#16181d", "red": "#f47067", "green": "#4fc27a", "yellow": "#e3b341", "blue": "#7cc4ff", "magenta": "#c39ac9", "cyan": "#7cc4ff", "white": "#d7dae0", "brightBlack": "#8b929c", "brightRed": "#f47067", "brightGreen": "#4fc27a", "brightYellow": "#e3b341", "brightBlue": "#7cc4ff", "brightMagenta": "#c39ac9", "brightCyan": "#7cc4ff", "brightWhite": "#ffffff" }

Hide
Type `export HOME="$(mktemp -d)/demo home" && mkdir -p "$HOME/.copilot" && export COPILOT_HOME="$HOME/.copilot" && cd "$HOME" && v2() { node -e 'const f=process.env.COPILOT_HOME+"/settings.json";const s=JSON.parse(require("fs").readFileSync(f));s.extraKnownMarketplaces.skraft.source.ref="integration/v2-next";require("fs").writeFileSync(f,JSON.stringify(s))' && rm -rf "$COPILOT_HOME/Library/Caches/copilot/marketplaces" && tput cuu1 && tput ed; } && export PS1='\[\e[38;2;124;196;255m\]$\[\e[0m\] ' && clear`
Enter
Sleep 500ms
Show

Type "copilot plugin marketplace add SebastienDegodez/skraft-plugin"
Enter
Wait+Screen@30s /added successfully/
Sleep 1s
Hide
Type "v2"
Enter
Sleep 300ms
Show
Type "copilot plugin install skraft@skraft"
Enter
Wait+Screen@60s /installed successfully/
Sleep 1s
Type "copilot plugin list"
Enter
Wait+Screen@30s /skraft@skraft/
Sleep 1s
Sleep 500ms
Screenshot "docs/website/static/img/screenshots/shared/install-copilot-cli.png"
Sleep 500ms
