# Handoff: TGB Calendar — Glass Tech (Style 09)

## Overview
TGB Calendar is a web app that lets users find a sports team and subscribe to its match schedule
via Apple Calendar / Google Calendar / a copyable .ics URL. This handoff covers the
**Glass Tech** visual direction (light, airy, modern-tech) with **multi-language (zh-Hant / en)**
and **Privacy / Terms** legal pages.

## About the Design Files
The file `TGB Glass Full.html` in this bundle is a **design reference prototype** — a single-file
React-in-Babel mock that demonstrates intended look, copy, language switching, and modal flows.
It is **not** production code to copy directly.

Your task is to **recreate this design inside a Next.js codebase** using the project's existing
patterns (App Router, React Server Components where appropriate, Tailwind or the project's chosen
styling layer). All numeric values, copy, and structure below are authoritative; the HTML is the
visual ground truth.

## Fidelity
**High-fidelity (hifi).** Colors, gradients, glass effect, spacing, font stack, radii, and
language-switching behavior are final. Recreate pixel-perfectly inside the Next.js project, but
adapt the file/folder structure to Next conventions (e.g. `app/[lang]/...`, server components,
`next/font`).

---

## Screens / Views

### 1. Home (`/` or `/[lang]`)
**Purpose:** Let a user search teams or pick a popular team to subscribe to.

**Layout (top → bottom inside a 400×720 phone-like frame; on web make it responsive — frame is
just the design reference):**
1. **TopBar** — flex row, `padding: 14px 20px 0`, space-between.
   - Left: empty slot (or future profile/menu).
   - Right: **language pill** — glass card, rounded-full, `padding: 4px 10px`,
     content `中 · EN`. Active side colored `#3b6dff`, inactive `#9ba3b4`.
2. **Hero** — `padding: 28px 20px 0`.
   - Brand chip: glass pill, mono font, copy "TGB · CALENDAR" with a small `#3b6dff` dot.
   - `<h1>`: size 32, weight 700, line-height 1.1, letter-spacing -1.
     - zh: "訂閱賽程,\n同步到行事曆"
     - en: "Subscribe and sync\nevery game"
     - Second line uses gradient text fill: `linear-gradient(135deg, #3b6dff, #7a4dff)` clipped to text.
   - Sub copy: 13px, color `#5b6478`, line-height 1.6.
3. **Search row** — `padding: 20px 20px 0`.
   - Glass card row, `padding: 0 14px`, radius 14.
   - Search icon (lucide `search`), placeholder localized.
   - `⌘K` hint badge on the right (mono, 10px, faint background).
   - Focus state: outer ring `0 0 0 3px rgba(59,109,255,.15)`.
4. **Search results** (only when `q` non-empty) — glass card, divided rows.
   - Each row: 32×32 square with `linear-gradient(135deg, t.color, t.color+'dd')` + 1-letter initial.
   - Team name + league (mono, 10px, `#5b6478`).
   - Arrow `→` in `#3b6dff` on the right.
   - Empty state copy: `找不到「{q}」相符的球隊` / `No teams match "{q}"`.
5. **Popular section** (when search is empty) — `padding: 24px 20px 0`.
   - Header: `POPULAR · 熱門` (mono, 10px, letter-spacing 1.5) + count.
   - Glass card list of top 5 teams, with index `01..05` on the left.
6. **Footer** — mono 10px, `v1.0 · tgb.ming060.com` left, `隱私權 / 使用條款` underlined links right.

### 2. Team Page (`/[lang]/teams/[tid]`)
**Purpose:** Show one team's current seasons + a subscription block.

1. **TopBar** — `← 返回 / Back` on left, `分享 / Share` on right, language pill omitted here
   (it inherits the global state).
2. **Hero header** — `padding: 20px 20px 0`.
   - Status chip: small dot (`#3b6dff` with `box-shadow: 0 0 6px #3b6dff`) + mono text
     `ACTIVE · {tid.toUpperCase()}`.
   - `<h1>`: team name, size 30, weight 700, letter-spacing -0.5.
   - Meta: season name + "跨 {N} 個聯盟 / Across {N} leagues".
3. **Stat strip** — glass card, 3 columns separated by 1px lines.
   - `WIN` (color `#3b6dff`), `LOSS` (color `#0d1426`), `SCH` (`scheduled/total`, color `#7a4dff`).
   - Mono numerals, size 22, weight 700.
4. **Active Seasons list** — `padding: 18px 20px 0`, scrollable.
   - Section label: mono 10px, `進行中賽季 · 02 / Active Seasons · 02`.
   - Each season: glass card with a **left-edge accent bar** (3px wide, gradient blue→violet).
     - League name + group + "已排 X/Y" meta.
     - Record badge: gradient background, white text, mono, with violet/blue shadow.
     - Next-match panel: light blue tint `rgba(59,109,255,.06)`, radius 10.
       - Date (mono, `#3b6dff`, 14px) + time (mono, muted, 10px).
       - "vs {opponent}" + venue.
5. **Past Season** (if no active seasons exist — currently always shown after active):
   - Same card shape but **all greyscaled** (use `filter: saturate(0.2) opacity(0.7)` on the glass
     card or use neutral `#5b6478` instead of gradients).
   - Show `已結束 / Ended` chip in place of the gradient record badge.
6. **Subscribe footer** — glass strip pinned to bottom, `padding: 16`.
   - Mono header: `SUBSCRIBE · 訂閱 / SUBSCRIBE`.
   - Two buttons in 1:1 grid, gap 8:
     - **Apple 行事曆 / Apple Calendar** — gradient background, white text,
       shadow `0 6px 18px rgba(59,109,255,.35)`. `href={team.webcalUrl}` (starts with `webcal://`).
     - **Google 日曆 / Google Calendar** — translucent white with 1px line border, ink text.
       `href={team.googleUrl}` (the Google calendar add-by-URL endpoint with the ICS URL encoded
       as `url=` param).
   - Below: a mono row showing the ICS URL with a `COPY → ✓ 已複製` toggle using
     `navigator.clipboard.writeText`. Reset after ~1.5s.

### 3. Privacy / Terms Modal
Both pages are bottom-sheet modals inside the prototype, but in Next.js prefer dedicated routes
(`/[lang]/privacy`, `/[lang]/terms`) **plus** a modal version using parallel routes / intercepting
routes (`@modal/(.)privacy`) so the footer links open inline without losing context.

- Header: title + "最後更新:2026 年 5 月 1 日 / Last updated: May 1, 2026" + glass close button.
- Body: list of `[heading, paragraph]` pairs (5 sections each, see `T.zh.privacy_body`,
  `T.zh.terms_body`, `T.en.privacy_body`, `T.en.terms_body` in the HTML for full copy — these
  are the canonical strings; do **not** rewrite them).
- Each heading has a 4px `#3b6dff` dot prefix.
- Footer CTA: "關閉 / Close" button with gradient background.

---

## Interactions & Behavior

- **Language switch:** toggling `中 ↔ EN` updates every label live. Persist preference in a cookie
  (`tgb_lang`) and/or use Next.js i18n routing. SSR-friendly: read cookie/locale on server, render
  initial language; client toggle re-routes to `/en/...` or `/zh-Hant/...`.
- **Search:**
  - Debounce 150ms.
  - Call `GET /api/teams/search?q={q}` (returns array of team summaries).
  - Match against team name (zh + en), league name, and tid (case-insensitive).
  - Empty `q` → render Popular list instead.
- **Subscribe buttons:**
  - Apple: `href={team.webcalUrl}` — must start with `webcal://`. iOS/macOS Calendar will handle.
  - Google: `https://calendar.google.com/calendar/r/settings/addbyurl?url={encodeURIComponent(icsUrl)}`.
  - Copy: `navigator.clipboard.writeText(icsUrl)`, toggle "已複製 / Copied" for 1500ms.
- **Modal:** scrim is `rgba(13,20,38,.35)` with `backdrop-filter: blur(4px)`. Click scrim or
  ✕ button to close. Trap focus, restore focus on close. Use `<dialog>` or Radix Dialog.

## State Management

- `lang: 'zh' | 'en'` — URL-driven via Next i18n routing; mirrored to a cookie.
- `query: string` — local component state; URL `?q=` for shareable searches.
- `modal: null | 'privacy' | 'terms'` — local state when using bottom-sheet style;
  or a route segment when using intercepting routes.
- `copied: boolean` — local, auto-reset.

## Design Tokens

### Colors
```
bg            #eef1f7
ink           #0d1426
muted         #5b6478
faint         #9ba3b4
line          rgba(13,20,38,0.08)
glassBg       rgba(255,255,255,0.65)
glassBorder   rgba(255,255,255,0.9)
blue          #3b6dff
violet        #7a4dff
gradient      linear-gradient(135deg, #3b6dff, #7a4dff)
```

### Typography
- Sans: `Inter, "Noto Sans TC", -apple-system, system-ui, sans-serif` — body, headings.
- Mono: `"JetBrains Mono", ui-monospace, monospace` — metadata, dates, codes, badges.
- Sizes: 9 / 10 / 11 / 12 / 13 (body) / 14 / 16 / 22 / 30 / 32. Weight 400/500/600/700.

### Spacing
Multiples of 4 (4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28).

### Radii
`6 / 8 / 10 / 12 / 14 / 16 / 20 / 28 / 999`.

### Shadows
```
card        0 1px 0 rgba(255,255,255,0.8) inset, 0 8px 24px rgba(13,20,38,0.06)
frame       0 30px 80px rgba(13,20,38,.18), 0 6px 18px rgba(13,20,38,.08)
btn-primary 0 6px 18px rgba(59,109,255,.32)
team-tile   0 4px 10px {team.color}33
dot-glow    0 0 6–8px {accentColor}
```

### Glass card recipe
```css
background: rgba(255,255,255,0.65);
border: 1px solid rgba(255,255,255,0.9);
border-radius: 16px;
backdrop-filter: blur(20px);
-webkit-backdrop-filter: blur(20px);
box-shadow: 0 1px 0 rgba(255,255,255,0.8) inset, 0 8px 24px rgba(13,20,38,0.06);
```

### Background halos
Three absolutely-positioned 260×260 circles with radial gradients:
- `top: -80; right: -60` — violet at 38% alpha, fades to transparent at 70%.
- `top: 220; left: -80` — blue at 32% alpha.
- `bottom: -110; right: -60` — blue at 22% alpha.
Layer behind everything; `pointer-events: none`.

## API Contracts (existing — for reference)

- `GET /api/teams/search?q={q}` → `Array<{ tid, name, enName, league, enLeague, members, color }>`
- `GET /api/teams/{tid}` → see `TEAM` shape in HTML (includes `seasons[]`, `pastSeason`, ICS URLs).
- ICS endpoints are public:
  - HTTPS: `https://tgb.ming060.com/ical/{tid}.ics`
  - webcal: `webcal://tgb.ming060.com/ical/{tid}.ics`
  - Google add-by-URL: `https://calendar.google.com/calendar/r/settings/addbyurl?url={encoded}`

## Copy (Source of Truth)

All zh-Hant and en strings live in the `T` dictionary at the top of `TGB Glass Full.html`.
Treat it as the canonical i18n source — copy it into `messages/zh-Hant.json` and `messages/en.json`
(or your i18n format of choice). Privacy/Terms bodies are arrays of `[heading, paragraph]`.

## Assets
- No external images. All visuals are pure CSS gradients + SVG icons (use `lucide-react`).
- Fonts via `next/font/google` for Inter, Noto Sans TC, JetBrains Mono.

## Files in this bundle
- `TGB Glass Full.html` — the visual reference. Open in a browser to interact.
- `README.md` — this file.

## Suggested Next.js Structure
```
app/
  [lang]/
    layout.tsx              # font setup + halo background + footer
    page.tsx                # Home (search + popular)
    teams/[tid]/page.tsx    # Team detail
    privacy/page.tsx        # full Privacy route
    terms/page.tsx          # full Terms route
    @modal/
      (.)privacy/page.tsx   # intercepted modal version
      (.)terms/page.tsx
components/
  GlassCard.tsx
  LangPill.tsx
  TopBar.tsx
  Footer.tsx
  SearchInput.tsx
  TeamRow.tsx
  SeasonCard.tsx
  SubscribeBlock.tsx
  LegalModal.tsx
lib/
  i18n.ts                   # T dictionary
  api.ts                    # teams.search, teams.get
styles/
  tokens.css                # CSS vars for the color/shadow/radius scale above
```
