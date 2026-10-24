---
name: skraft backlog canvas
description: Each story read as a pre-flight checklist (challenge, dotted leader, the value the check found) on skraft navy or paper.
colors:
  ground: "#0f1722"
  panel: "#121c29"
  raise: "#172334"
  ink: "#eef6ff"
  ink-soft: "#b7c6d8"
  ink-faint: "#8a9bb2"
  rule: "rgb(127 211 255 / 14%)"
  rule-strong: "rgb(127 211 255 / 28%)"
  accent: "#24b5ff"
  accent-ink: "#7fd3ff"
  accent-wash: "rgb(36 181 255 / 12%)"
  on-accent: "#06121c"
  pass: "#4fd1b5"
  warn: "#f2b84b"
  fail: "#ff7a6b"
  pending: "#8a9bb2"
  ground-light: "#f6f8fb"
  panel-light: "#ffffff"
  raise-light: "#eef3f9"
  ink-light: "#0f1722"
  ink-soft-light: "#3d4c61"
  ink-faint-light: "#5b6b80"
  rule-light: "rgb(15 23 34 / 10%)"
  rule-strong-light: "rgb(15 23 34 / 22%)"
  accent-light: "#0071ad"
  accent-ink-light: "#005a8a"
  accent-wash-light: "rgb(0 113 173 / 9%)"
  on-accent-light: "#ffffff"
  pass-light: "#0b7a62"
  warn-light: "#8f5a00"
  fail-light: "#b8322a"
  pending-light: "#5b6b80"
typography:
  display:
    fontFamily: "Lato, 'Avenir Next', Avenir, 'Segoe UI', system-ui, sans-serif"
    fontSize: "clamp(1.4rem, 2.4vw, 1.85rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  lead:
    fontFamily: "Lato, 'Avenir Next', Avenir, 'Segoe UI', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "Lato, 'Avenir Next', Avenir, 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: "Lato, 'Avenir Next', Avenir, 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'tnum'"
  control:
    fontFamily: "Lato, 'Avenir Next', Avenir, 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.5
  caption:
    fontFamily: "Lato, 'Avenir Next', Avenir, 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Lato, 'Avenir Next', Avenir, 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0.06em"
  mono:
    fontFamily: "'Fira Code', 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'calt' 0"
  mono-caption:
    fontFamily: "'Fira Code', 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'calt' 0"
rounded:
  tick: "1px"
  chip: "4px"
  control: "6px"
  frame: "8px"
  pill: "999px"
spacing:
  xs: "0.25rem"
  sm: "0.45rem"
  md: "0.75rem"
  lg: "1.25rem"
  xl: "2.25rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0.45rem 0.95rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-ink}"
    textColor: "{colors.on-accent}"
  button-primary-disabled:
    backgroundColor: "transparent"
    textColor: "{colors.ink-faint}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0.45rem 0.95rem"
  button-small:
    typography: "{typography.caption}"
    rounded: "{rounded.control}"
    padding: "0.3rem 0.7rem"
  filter-pill:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "0.2rem 0.55rem"
  filter-pill-pressed:
    backgroundColor: "{colors.raise}"
    textColor: "{colors.ink}"
  input-search:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.4rem 0.6rem"
  chip-antipattern:
    backgroundColor: "transparent"
    textColor: "{colors.fail}"
    rounded: "{rounded.chip}"
    padding: "0.05rem 0.5rem"
  plan-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "0.55rem 1rem 0.6rem 0.85rem"
  plan-row-current:
    backgroundColor: "{colors.accent-wash}"
  checklist-line:
    backgroundColor: "transparent"
    typography: "{typography.title}"
    padding: "0.7rem 0.25rem"
  checklist-line-hover:
    backgroundColor: "{colors.raise}"
  tick:
    backgroundColor: "{colors.pass}"
    rounded: "{rounded.tick}"
    width: "5px"
    height: "9px"
  tick-index:
    backgroundColor: "{colors.pass}"
    rounded: "{rounded.tick}"
    width: "7px"
    height: "13px"
  launch-bar:
    backgroundColor: "{colors.panel}"
    padding: "0.7rem 1.25rem"
  toast:
    backgroundColor: "{colors.raise}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.55rem 0.85rem"
---

# Design System: skraft backlog canvas

## Overview

**Creative North Star: "The Pre-Flight Checklist"**

The canvas reads a backlog the way a crew reads a checklist before take-off. Every story is a run of named checks, each answered on the same line by the value the check found: the challenge in the text face on the left, a dotted leader, the response in the code face on the right. A verdict never stands alone as a score; it is the colour of the answer and the drawn mark beside it. Before the checklists comes the progress view, the whole backlog at a glance: one band of key figures, the stories by stage in one bar, then each epic framed with its own review and its stories as rows. Beside the checklist sits the flight plan (stories in build order, grouped by milestone then by epic, each epic with its review verdict and each story with its 14-tick strip); below it, the sticky launch bar that holds the count of reviewed stories, the waiting dependencies and the two launch actions.

The material is quiet and dense: skraft night navy by night, cool paper by day, following theme attributes delivered to the canvas document (`data-theme-tone`, else `data-color-mode`, on `html` or `body`), and the browser's `prefers-color-scheme` otherwise. Copilot app injects these attributes; VS Code 1.142 uses the media fallback, which need not match the editor theme. See [theme delivery and verification](README.md#theme-delivery-and-verification). Structure comes from 1px hairlines and one tonal step for the plan and bar panels, not from boxes. Cyan is rare and means "here": where the eye is, and the one thing to do next. The pass, attention and fail colours only ever colour words, strokes and ticks.

Rejected by the build, and to stay rejected: the backlog-dashboard default of score badges, donuts and same-size cards; glass, gradients, cards inside cards; filled verdict badges.

**Key Characteristics:**
- Challenge, dotted leader, response on one baseline; the challenge's gloss on a second row.
- Two grounds (navy and paper), one token set, swapped by delivered theme attributes, else the browser's `prefers-color-scheme`.
- Cyan only for the brand mark, focus, the open tab, the current row, the lit passage and the primary action.
- Verdicts in teal, amber and coral, carried by text, stroked icons and ticks, never by fills behind text.
- Lato for words, Fira Code for ids, found values and counts (skraft brand commitment).
- Hairline rules and tonal panels; one soft shadow, only for what floats.

## Colors

Two grounds of the skraft identity, a single cyan used as a pointer, and three verdict signals that live in the words.

### Primary
- **Skraft Cyan** (`accent` #24b5ff dark / `accent-light` #0071ad light): the primary action fill, the focus ring, the underline of the open tab, the 1px rule on the current row of the plan and of the progress view, the 1px inset rule on the lit passage, the ghost button's hover border, text selection.
- **Pale Skraft Cyan** (`accent-ink` #7fd3ff dark / `accent-ink-light` #005a8a light): the "skraft" brand mark in the top bar and the primary action's hover fill.
- **Cyan Wash** (`accent-wash`, 12% dark / 9% light): the background of the current row in the plan and in the progress view, and of the lit sheet passage. Never on anything else.
- **On-Cyan** (`on-accent` #06121c dark / `on-accent-light` #ffffff light): text on the primary fill. White on `accent-light` measures 5.3:1 and on the light hover fill `accent-ink-light` 7.4:1; dark measures 8.2:1.

### Secondary
- **Clearance Teal** (`pass` #4fd1b5 / `pass-light` #0b7a62): a check that holds, a reviewed marker, a created or linked operation, a passing tick.
- **Caution Amber** (`warn` #f2b84b / `warn-light` #8f5a00): a check that holds with a warning, a stale review, waiting dependencies in the launch bar, a story pulled in as a dependency in the dry-run plan, an open question nobody answered (its left rule and status, the question button of its row, the link in the launch bar).
- **No-Go Coral** (`fail` #ff7a6b / `fail-light` #b8322a): a failing check, the evidence rule under a failing line, antipattern chips, map problems, errors, failed operations. Failing ticks are also 2px taller.
- **Pending** (`pending`, same value as ink-faint): a check with nothing to read yet; drawn as an outlined tick and a dashed circle.

### Neutral
- **Skraft Night Navy** (`ground` #0f1722) / **Cool Paper** (`ground-light` #f6f8fb): the page and the story column.
- **Plan Navy** (`panel` #121c29) / **White Sheet** (`panel-light` #ffffff): the flight plan, its sticky tools, the launch bar, the drawer toggle.
- **Raised Navy** (`raise` #172334) / **Mist** (`raise-light` #eef3f9): hover on rows and lines, the pressed filter pill, the toast.
- **Cockpit White** (`ink` #eef6ff) / **Navy Ink** (`ink-light` #0f1722): titles, line names, story statement, values in `code`.
- **Instrument Grey-Blue** (`ink-soft`): secondary text, plan ids, review label, unpressed filters.
- **Placard Grey** (`ink-faint`): line keys, challenges, statement labels (En tant que / je veux / afin de), section labels, counts, chevrons.
- **Hairline** (`rule`, cyan at 14% on navy, navy at 10% on paper): every divider. **Strong Hairline** (`rule-strong`, 28% / 22%): control borders, the dotted leader, evidence rules, the launch-bar top rule.

### Named Rules
**The Cyan Means Here Rule.** Cyan marks where the reviewer is and the one thing to do: brand mark, focus ring, current row (1px rule plus wash), lit passage, primary action. The ghost button's hover border and text selection borrow it; nothing else may.

**The Verdict In The Words Rule.** Teal, amber and coral colour the response text, the drawn icon, the tick, the evidence rule and the state label. They never fill a shape behind text. The antipattern chip is outlined, not filled.

**The Two Grounds Rule.** Every colour is a custom property whose value is `light-dark(day, night)` in `:root`; `color-scheme` picks the side, from the host's `data-theme-tone` or `data-color-mode`, else from `prefers-color-scheme`. No literal colour in a component.

## Typography

**Display Font:** Lato (stack: 'Avenir Next', Avenir, 'Segoe UI', system-ui, sans-serif)
**Body Font:** Lato (same stack)
**Label/Mono Font:** Fira Code (stack: 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace)

**Character:** A humanist sans for what a person reads (the check's name, the statement, the evidence) and a code face for what a machine found (ids, quoted values, counts, dates, the repository). The pair is the skraft brand pairing of the documentation site.

Known gap: neither face is self-hosted in this build (fetching the OFL woff2 files needed a network approval that was denied), so today the canvas renders in the fallbacks, Avenir Next and the system mono on macOS. The fallbacks are not the system's faces.

### Hierarchy
- **Display** (700, clamp(1.4rem, 2.4vw, 1.85rem), 1.2, -0.015em, balanced wrap): the open story's title, once per screen. The id line sits below it.
- **Lead** (400, 1rem, 1.5): the story statement (as a / I want / so that), at most 68ch.
- **Title** (700, 0.9375rem, 1.5): checklist line names, sheet part headings, criterion titles.
- **Body** (400, 0.9375rem, 1.5, tabular numerals): evidence, sheet text, plan row titles. Evidence text stops at 70ch.
- **Control** (700, 0.875rem): buttons and the reviewed count. The coverage line, repository and launch-bar text use the same size at 400. The story's state label is Body at 700, coloured by verdict.
- **Caption** (400, 0.8125rem): the challenge under each line name, criterion labels, evidence notes (italic), links.
- **Label** (700, 0.75rem, 0.06em, uppercase): section headings of the story (INVEST, Definition of Ready, lens review, sheet) and milestone headings in the plan (0.04em there). They are the heading of their section, never a line stacked above another heading.
- **Mono** (400, 0.8125rem, ligatures off): ids, the found value on every line, counts, dates, the repository, the dry-run ids. **Mono caption** (0.75rem): evidence source lines and filter counts.

### Named Rules
**The Challenge And Response Rule.** The name of a check is Lato; what the check found is Fira Code. A value, id or count set in the text face is a mistake.

**The Brand Face Rule.** Lato and Fira Code are skraft commitments, not choices of this surface. Self-host them; never substitute another display face.

## Layout

A three-band frame filling the panel height: a top bar (brand, backlog slug, the two tabs **Progress** and **Review**, coverage, the board of story verdict counts, repository; it wraps when narrow), then the body of the open tab (the flight plan at `clamp(15rem, 30vw, 21rem)` with its own scroll, the story column scrolling beside it), then the sticky launch bar across the panel. Map problems, when any, take a collapsible band under the top bar.

The panel opens on **Progress** (on **Review** when the agent names a story). Its body is one scrolling region over the whole panel, its content capped at 76rem: the band of key figures, the progress bar and its legend, the shared filters and search (sticky, on the ground tone), then one frame per epic, 1rem apart. **Review** is the two-column body with the flight plan and the story. Only the open tab is drawn; each tab keeps its scroll while the other shows.

The story column pads 2rem top, clamp(1.25rem, 4vw, 3rem) on the sides, 4rem bottom, and caps its content at 54rem. Under the title, meta and statement, the story dock sticks to the top of the column; the sections of the story (INVEST, DoR, sign-off, lenses, sheet) follow, separated by 2.25rem; checklist lines by a hairline each, with 0.7rem vertical padding. The frame gutter is 1.25rem in the top bar and launch bar.

The story column is a size container. When it is narrower than 34rem (a canvas panel beside the chat), the statement stacks its labels and the checklist line drops its leader and stacks key, name, challenge and value in one column, while the plan stays beside it with its epics and ticks.

The progress view is a size container too. Under 52rem its figures fold into two rows of four (two columns under 24rem); under 46rem each story row stacks: id and marker, title, facts line, then ticks with effort and MoSCoW.

Below 640px the plan becomes a drawer: a full-width toggle row (menu icon, "Stories", the position such as 2/4, then the focused story's verdict icon, epic and id on the right) opens it over the story column; the repository leaves the top bar; the launch actions split the full width.

### Named Rules
**The One Baseline Rule.** Line name, dotted leader and found value sit on one baseline; the challenge sits on a second row under the name. The value stops at 26rem and wraps there rather than hiding what was found.

**The Build Order Rule.** The plan lists stories in build order under their milestone and their epic (milestones in map order, epics in map order inside them), each row carrying verdict icon, id, title, the 14-tick strip (I N V E S T, a gap, DoR 1 to 8) and its marker. No sorting by score.

**The Epic Frame Rule.** The progress view is the one place an epic gets a frame: 1px strong hairline, 8px corner, panel tone, a coral or amber tint on the border when its review rejected or questioned it. Its raised head carries the fold chevron, id and title, the review verdict and attempt, the story verdict counts and the strip of cells; its body the outcome, the done-when check, the findings on the epic itself (folded behind a count, coral when one is medium or worse) and its stories as rows separated by hairlines. Frames stack in one column at their own height: never a grid of same-size cards, never a frame inside a frame. The review of an epic lives here only, never in the story.

**The One Band Rule.** The key figures (epics, stories, files written, refused, held back, ready, reviewed, published) are one band between two hairlines, divided by hairlines, the value in 1.5rem mono over its label. Refused takes coral and held back amber when not zero; ready, reviewed and published are dimmed and say "after the creation plan" until it exists. No figure gets a tile of its own.

**The Epic Head Rule.** Each epic opens with a raised head that folds its stories: chevron, id in mono and title, then the epic review verdict and attempt in its colour with the story verdict counts, then a strip of one cell per story in build order. The head carries no side stripe; the verdict is in its words, icon and cells. Its stories hang from it: a 1px rail under the chevron and a short branch to each row, the last branch closing the rail.

## Elevation & Depth

Flat by default. Depth is tonal (navy ground, a half-step lighter panel for the plan and launch bar, a full step for hover) and drawn by hairlines. A single soft ambient shadow exists for surfaces that float above content.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 10px 30px rgb(0 0 0 / 35%)` dark, `0 10px 30px rgb(15 23 34 / 12%)` light): the toast and the plan drawer under 640px. Nothing at rest carries it.

### Named Rules
**The Hairline Rule.** Separation is a 1px rule, never a box. A container never sits inside another bordered container.

## Shapes

Mostly square. Controls (buttons, search, backlog select, toast) take a gentle 6px corner; the epic frames of the progress view 8px; antipattern chips and the focus ring 4px; the progress bar 3px; plan filters are full pills; ticks are 1px-cornered bars. Rules are 1px solid, except the leader, which is 1px dotted in the strong hairline. Accents are drawn as 1px vertical rules on the left edge: the current row of the plan and of the progress view, the lit passage (inset), the evidence and finding rule, the dry-run epic's story list.

Icons are inline SVG on a 16-unit grid, 1rem, stroke 1.6, round caps and joins, no fill, coloured by `currentColor`: check (pass), triangle (warn), crossed circle (fail), dashed circle (pending), double check (reviewed), ringed dot (issue), chevron, menu, repo, link.

## Components

### Buttons
Compact and decisive; one primary per screen.
- **Shape:** gently rounded (6px), 1px border always present so variants share a footprint.
- **Primary:** cyan fill, on-cyan text, Control type, 0.45rem by 0.95rem. Sits rightmost in the launch bar ("Create N issues"); the story dock's "Mark reviewed" uses the small size, and stays in sight however far the story scrolls.
- **Hover / Focus:** primary fill moves to pale cyan; ghost border moves to cyan; 160ms on the ease-out curve. Focus is the global 2px cyan ring, offset 2px.
- **Ghost:** transparent, ink text, strong-hairline border ("Preview (dry run)", "Unmark reviewed").
- **Disabled:** the primary drops its fill to a strong-hairline outline with faint text, so a disabled Create never looks armed; the ghost fades to 45% opacity.
- **Small:** 0.3rem by 0.7rem, Caption size.

### Chips
- **Filter pills (plan):** transparent, soft ink, full pill, with a mono count; pressed takes the raised tone, ink text and a strong-hairline border.
- **Proposed answers (open questions):** transparent, ink text, strong-hairline border, 6px, Caption size; the chosen one takes an ink border, bold text and a teal check. No fill.
- **Antipattern chips (story header):** 1px coral outline, coral bold 0.75rem text, 4px corner, no fill. Each opens the checklist line it belongs to.

### Inputs / Fields
- **Search:** full width under the filters, ground background, strong-hairline border, 6px, 0.875rem, faint placeholder.
- **Backlog select:** transparent, strong-hairline border, 6px, mono.
- **Answer field:** a two-row textarea under each open question, ground background, strong-hairline border, 6px, the text face; ⌘ or Ctrl + Enter saves.
- **Focus:** the global cyan ring.

### Navigation
- **Tabs:** two text tabs in the top bar (`role="tablist"`), bold soft ink; the open one in cyan ink with a 2px cyan underline. Arrow keys, Home and End move between them. Opening a story (a row, j / k, the agent) opens Review; the epic link of a story opens Progress on its frame, unfolded and focused, clearing the filters if they hide it.
- **Progress rows:** a row per story in its epic frame: verdict icon, id in mono, title with a `TRACER` mono mark, a facts line (covered requirements, the stories it waits on, milestone), the 14-tick strip, the marker, then effort and MoSCoW in mono (must in bold ink, should soft, could and won't faint). The current story takes the cyan wash and a 1px cyan left rule. Filters and search are the plan's; they narrow both views.
- **Flight plan:** sticky tools (filters, search) on the panel tone; milestone headings in Label type with their due date in mono on the right; rows as described in the Build Order Rule. Hover takes the raised tone; the current row takes the cyan wash and a 1px cyan left rule. Keyboard, in Review: j / k move through visible stories, r toggles the review of a ready story.
- **Epic groups:** a fold button per epic (`aria-expanded`); a folded epic that holds the focused story keeps a 1px cyan rule under its head. Focusing a story (j / k, a link, the agent) unfolds its epic. Search ignores the folds.
- **Drawer (under 640px):** the plan fades and drops in over the story column (200ms), with the Float shadow.

### Checklist line (signature)
A list item per check: key (I N V E S T or 1 to 8) in faint mono, name in Title, the dotted leader, the found value in mono coloured by verdict with its drawn icon, and a chevron when there is evidence. The challenge sits under the name in Caption. Opening a line rotates the chevron 90° and expands the body by animating its grid row (260ms): each piece of evidence hangs off a 1px rule (coral for fail, amber for warn), with its source in mono caption, the reason, a bold "Fix" and the correction, then "See in the sheet". The checklist closes with a **sign-off line** in the same geometry: the human review, answered by the sign date, the issue link or where the review stands. The button that signs lives in the story dock.

### Story dock
Sticks to the top of the story column (a negative top equal to the column's padding), ground tone, a hairline under it. Left: the verdict icon, the story id in mono, its state and, for a ready story, where its review stands; then the tick index. Right: "Answer N" (ghost, small, amber icon and count) when the story has open questions, "Drafts N" when only draft answers remain, then the sign-off: "Mark reviewed" (primary, small), "Unmark reviewed" (ghost) once signed, a disabled "Mark reviewed" when the story is not ready, the issue link once published. The findings that hold the story and its antipattern chips sit under it, out of the header.

### Open questions
The last part of the sheet. Each question hangs off a 1px left rule (amber open, strong hairline draft, teal settled): its code in mono, the question in bold, its status in caption on the right, the reason under it, the answer the file already holds. An open or draft question adds its proposed answers, the answer field, Save and Withdraw. Saving writes a draft to `answers.json`; the next correction session writes it into the story file. In the progress view each row with open questions ends with an amber question button and its count (an empty slot keeps the column otherwise); it opens Review on the first question nobody answered, lit and centred past those the file settles, its field focused. A "Questions" filter keeps the stories that still ask.

### Lit passage (signature)
"See in the sheet" scrolls the story sheet to the passage the evidence accuses (the criterion, example or dependency it names, else the whole part), centres it and lights it with the cyan wash and a 1px inset cyan rule. It stays lit until another line is opened or another story focused.

### Progress bar
One 0.55rem bar, 3px corner, raised track, a segment per stage in build order from the last: published in ink, reviewed in teal, ready to review in 45% teal, written in faint ink, held back in amber, refused in coral, to write as a hollow outline. Drawn in SVG units of one story, so no inline style sizes it. The legend under it repeats each stage with its swatch and count; the bar's accessible name reads them all.

### Board and counts
The top bar, each epic head and each epic frame count stories by verdict in mono: icon and number per non-zero verdict, coloured by verdict, the full phrase ("2 en échec") as the accessible name.

### Tick strip and tick index
Fourteen 5 by 9px bars in the plan row (teal pass, amber warn, coral fail at 11px tall, outlined pending), with a gap between INVEST and DoR. In the story dock the same strip grows to 7 by 13px (fail 15px) and each tick is a button that opens its line.

### Launch bar and dry-run plan
The panel-toned bar holds the bold reviewed count, the amber waiting-dependencies readout with each waiting id as a mono link, the amber count of open questions (a link that filters on them) and the draft answers still to fold in with `corrections: true` (the tail drops under 640px), the destination repository in mono, then Preview and Create on the right. A dry run opens a plan above it (max 38vh, scrolling): each epic, its stories under a 1px left rule, each link as a link-icon row, every operation's status right-aligned in caption (teal for created and linked, coral for failed), stories pulled in as dependencies marked in amber.

### Toast
Bottom right above the bar, raised tone, strong-hairline border (coral for errors), 6px, Float shadow; rises 0.5rem, holds, fades over 3.6s.

## Do's and Don'ts

### Do:
- **Do** set every check as name, dotted leader, found value on one baseline, with the challenge on a second row; drop the leader and stack when the story column is under 34rem.
- **Do** put ids, found values, counts, dates and repositories in Fira Code at 0.8125rem with ligatures off.
- **Do** carry a verdict in three places only: the colour of the answer, its drawn stroke icon, its tick.
- **Do** give every colour a dark and a light value through the custom properties and `light-dark()`.
- **Do** keep the story's id line below its title, in mono and faint ink.
- **Do** keep the review of an epic in its frame of the progress view; the story only links to it.
- **Do** use the 260ms ease-out (cubic-bezier(.16, 1, .3, 1)) for expand and light, 160ms for hover, and drop all motion under `prefers-reduced-motion`.
- **Do** self-host Lato and Fira Code (OFL) as soon as the files can be fetched.

### Don't:
- **Don't** show a score badge, a donut or a grid of same-size story cards; the progress view frames epics in one column, at their own height.
- **Don't** fill a shape behind verdict text; chips stay outlined.
- **Don't** use cyan for anything beyond the brand mark, focus, the open tab, the current row, the lit passage, the primary action, the ghost hover border and selection.
- **Don't** use glass, gradients, or a bordered container inside another.
- **Don't** use emoji or text glyphs as icons; draw them as 16-unit stroked SVG.
- **Don't** put a small label above the story title.
- **Don't** shadow anything at rest; the Float shadow is for the toast and the drawer.
