# flaky design system

The source of truth for how flaky looks and sounds. The browsable version, with live component previews, lives in Claude Design: https://claude.ai/artifact/5wWo1hANZzkuymUMKhZRSb

- `tokens.json`: every colour, text style, spacing step, radius, shadow and size, with a usage note on each. Colours are also exposed as Tailwind classes (`bg-terracotta`, `text-ink-2`, `border-line-card`…) via `tailwind.config.ts`.
- `components/*.md`: guidelines for each UI pattern. The implementations currently live inline in `src/app/page.tsx`.

When you change a colour or add a pattern, update `tokens.json` or the matching guide in the same change, and re-sync the Claude Design copy.

flaky lets you secretly flag that you want to cancel a plan. If everyone feels the same, you're all off the hook; if not, nobody ever knows. The whole look serves that promise: warm, soft, low-stakes, a little cheeky, never clinical.

## Content fundamentals

- **The name is always lowercase**: flaky, in copy, titles and the wordmark. The verb is "flake" ("tap flake"), the plan is "penciled in".
- **Talk to "you", about "them"**. "Their number", "Your mobile number", "If they also flag it…". Never "users" or "participants".
- **Sentence case everywhere**, short and warm. Exclamations are rationed to the result moments: "Penciled in!", "It's mutual!".
- **Reassure about the secret** whenever it's at stake: "(nobody knows, unless they cancel too)", "Secret's safe", "your secret stays safe".
- **Cosy, not snarky.** Mutual-cancel lines celebrate staying in without mocking the plan: "The stars aligned for a cosy night. Who are we to argue?", "Two people just chose comfort over FOMO. Respect."
- **Spelling is mixed today**: British "cosy", "pyjamas" beside American "penciled". Pick one before adding more copy.
- **Actions are verbs**: "Send code", "Pencil in", "Copy link" → "Copied!", "Send to group". Loading swaps to "Sending...", "Verifying..." or "...".
- **Legal fine print stays plain and small**: `caption` in `faint`, centred under the button it qualifies.

## Visual foundations

**Color.** A warm paper page (`surface-top` → `surface-bottom` gradient) under one white `card`. `terracotta` is the brand: it fills the primary button, underlines the focused input, marks days with plans and the selected day. `sage` means "all good / you're covered": the Done button, recommit, the mutual status. `danger` is only for deleting an account; flaking is never shown as destructive. Text runs `ink` → `ink-2` → `ink-3` → `muted` → `faint` as it gets less important.

**People are pastels.** Each person gets one of sixteen Japanese-named pastels (`slice-00-sakura` … `slice-15-nadeshiko`), hashed from their number so they keep it on every plan. Pastels only ever fill slices of the `CancelPie`; never use them for text or UI chrome.

**Type.** One family, Inter (`--font-sans`), followed by the emoji fonts so 📝 🤫 🛋️ always render. Bold `wordmark` and `moment-title` for the few headings; everything else is `body`, `label`, `small` or `caption`.

**Layout.** A single 384px column (`column`) centred with a `space-4` gutter; `space-4` vertical rhythm inside the card, `space-6` card padding, `space-8` between the logo, the card and the calendar. One card per screen; the calendar and plan list sit on the gradient below it.

**Shape.** Buttons `radius-xl`, the card `radius-2xl`, calendar cells `radius-lg`, anything round (pills, toggles, the pie) `radius-full`. Inputs have no box at all, only a 2px underline.

**Depth.** One shadow: `shadow-card`. Everything else is flat, separated by `line-card` hairlines or by space.

**States.** Hover darkens a fill one step (`terracotta` → `terracotta-hover` → `terracotta-active`); outline pills gain a tint wash. Disabled is opacity .5. Focus on inputs is the terracotta underline; on buttons use a 2px `terracotta` outline (the app currently relies on browser defaults there).

**Motion.** Colour transitions only (Tailwind `transition-colors`, 150ms). No entrances, no confetti; the emoji does the celebrating.

**Accessibility, as shipped.** Several brand pairs miss WCAG AA and are kept exact here: white on `terracotta` (2.95:1), white on `sage` (2.4:1), `muted` (3.45:1) and `faint` (2.5:1) on `card`, the `whisper` footer link (1.6:1). If you fix them, darken the fills (`terracotta-active`, `sage-ink`) and move helper text up to `ink-3`, rather than inventing new hues.

**Theme.** Light only. The source has no dark mode, so neither does this system.

## Iconography

- **Emoji are the illustrations.** One per result moment, set at 48px: 📝 penciled in, 🤫 secret's safe, 🛋️ mutual, 🌫️ invite not found. Don't use emoji as bullets or decoration anywhere else.
- **Line icons are hand-drawn inline SVG**, 24px grid, `currentColor`, stroke 1.75 (2 for the small chevrons and +), round caps and joins. No icon library. The set lives under Icons: `morning`, `lunch`, `night` for time of day; `add`, `contacts`, `chevron-*` for controls.
- **The logo** is the golden pastry mark (`assets/Logos/flaky-pastry.png`) set 56px tall immediately left of the `wordmark`, with the tagline "cancel plans, guilt-free" under it. Once signed in the mark appears alone, 48px, above the card. It is a raster; don't recolour or redraw it.
