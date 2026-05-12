# Design: Glass Tech UI Adaptation
**Date:** 2026-05-11 | **Reference:** `design_handoff_tgb_calendar/`

## Overview

Adapt the TGB Calendar "Glass Tech" design handoff into the existing Next.js implementation. The current codebase is functionally complete but entirely unstyled (bare HTML). This design applies the glassmorphism visual system, installs the required tooling, renames the locale, and aligns data shapes with what the UI needs.

## Approach

Full redesign in one pass — replace all pages and components since the current code is minimal stubs with no real styling. Clean diff, consistent result.

---

## Section 1: Infrastructure & i18n

### Dependencies
- `tailwindcss`, `postcss`, `autoprefixer` — styling framework
- `lucide-react` — icons (Search, ArrowRight, Share2, ChevronLeft)
- Fonts via `next/font/google`: Inter, Noto Sans TC, JetBrains Mono

### Tailwind Config (`tailwind.config.ts`)
Custom design tokens matching the handoff spec:
- **Colors:** `ink` (#0d1426), `muted` (#5b6478), `faint` (#9ba3b4), `blue` (#3b6dff), `violet` (#7a4dff), `glass-bg` (rgba(255,255,255,0.65)), `glass-border` (rgba(255,255,255,0.9)), `line` (rgba(13,20,38,0.08)), `bg` (#eef1f7)
- **Radii:** r-6 (6px) through r-999 (9999px)
- **Shadows:** `card` (inset + drop), `frame`, `btn-primary` (blue glow), `dot-glow`
- **Font families:** `sans` (Inter + Noto Sans TC + system), `mono` (JetBrains Mono + ui-monospace)

### Locale Rename
`zh` → `zh-Hant` throughout:
- `i18n/routing.ts` — locales array and defaultLocale
- `i18n/request.ts` — message file path
- `app/[locale]/layout.tsx` — locale guard
- `i18n/messages/` — rename `zh.json` → `zh-Hant.json`

All routes become `/zh-Hant/...` and `/en/...`.

### Color Utility (`lib/teamColor.ts`)
Pure function, no dependencies:
```ts
const PALETTE = ['#3b6dff','#7a4dff','#0ea5e9','#f97316','#f43f5e',
                 '#f59e0b','#10b981','#6366f1','#ec4899','#14b8a6'];
export function getTeamColor(tid: number): string {
  return PALETTE[tid % 10];
}
```
Used wherever a team avatar (colored square + initial) appears. No DB changes required.

---

## Section 2: Shared Components & Layout Shell

### Background Halos (in `[locale]/layout.tsx`)
Three absolutely-positioned 260×260 circles, `pointer-events: none`, `z-index: 0`:
- Top-right: violet radial gradient at 38% alpha, fades to transparent at 70%
- Mid-left: blue at 32% alpha
- Bottom-right: blue at 22% alpha

### `GlassCard` (`components/GlassCard.tsx`)
Reusable `div` wrapper applying the glass recipe:
```css
background: rgba(255,255,255,0.65);
border: 1px solid rgba(255,255,255,0.9);
border-radius: 16px;
backdrop-filter: blur(20px);
box-shadow: 0 1px 0 rgba(255,255,255,0.8) inset, 0 8px 24px rgba(13,20,38,0.06);
```
Accepts `className` for overrides.

### `TopBar` (`components/TopBar.tsx`)
Two variants via `variant` prop:
- `"home"`: left slot empty, right slot = `LangPill`
- `"team"`: left = Back link (`← 返回 / Back`), right = Share button (Web Share API with copy-URL fallback)

### `LangPill` (`components/LangPill.tsx`)
Client component. Glass pill, rounded-full, `padding: 4px 10px`, content `中 · EN`. Clicking navigates to the same path under the alternate locale. Active locale text is `#3b6dff`, inactive is `#9ba3b4`. Reads current locale from `useParams()`.

### `Footer` (`components/Footer.tsx`)
Mono 10px, rendered in layout (appears on every page):
- Left: `v1.0 · tgb.ming060.com`
- Right: `隱私權` and `使用條款` as underlined links to `/[locale]/privacy` and `/[locale]/terms`

### Layout Shell (`app/[locale]/layout.tsx`)
- Sets `<html lang={locale}>`
- Loads fonts via `next/font/google`
- Body: `bg-[#eef1f7]`, `min-h-screen`, `relative overflow-x-hidden`
- Renders halos (behind everything), `<main>` (max-width 400px, centered, relative z-10), `Footer`
- **TopBar is NOT in layout** — each page renders its own `TopBar` variant at the top, since home and team pages need different left/right slots

---

## Section 3: Home Page (`app/[locale]/page.tsx`)

### Hero Block (`padding: 28px 20px 0`)
- Brand chip: `GlassCard` pill, mono font, `TGB · CALENDAR` with a 6px `#3b6dff` dot
- `<h1>` (32px, 700, line-height 1.1, letter-spacing -1px):
  - zh-Hant: `訂閱賽程，同步到行事曆`
  - en: `Subscribe and sync every game`
  - Second line: `bg-gradient-to-br from-blue-500 to-violet-500 bg-clip-text text-transparent`
- Sub copy: 13px, `#5b6478`, line-height 1.6, localized

### Search Row (`padding: 20px 20px 0`)
- `GlassCard` row, radius 14px, `padding: 0 14px`
- Lucide `Search` icon left, localized placeholder, `⌘K` mono badge right (10px, faint bg)
- Focus ring: `ring-2 ring-[#3b6dff]/15`
- Debounce 150ms

### Search Results (query non-empty)
- `GlassCard` with divided rows
- Each row: 32×32 colored square (`getTeamColor(tid)`) with 1-letter initial, team name + `leagueName` (mono, 10px, muted), blue `→` arrow right
- Empty state: `找不到「{q}」相符的球隊` / `No teams match "{q}"`

### Popular Section (query empty, `padding: 24px 20px 0`)
- Header: `POPULAR · 熱門` mono 10px, letter-spacing 1.5, + count badge
- `GlassCard` list of top 5 teams: rank `01`…`05` left, colored avatar + name + league
- DB query JOINs `team_divisions` → `leagues` for `leagueName`; `LIMIT 5` (changed from 8)

---

## Section 4: Team Page (`app/[locale]/team/[tid]/page.tsx`)

### TopBar
`variant="team"`: Back link navigates to `/${locale}`. Share via Web Share API.

### Hero Header (`padding: 20px 20px 0`)
- Status chip: `#3b6dff` glowing dot (box-shadow: 0 0 6px #3b6dff) + mono `ACTIVE · {TID}`
- `<h1>`: team name, 30px, 700, letter-spacing -0.5
- Meta: `{teamDivisions[0].league_name} · {teamDivisions[0].name}` (most recent division, sorted by `updated_at DESC`)

### Stat Strip
`GlassCard`, 3 equal columns separated by 1px `rgba(13,20,38,0.08)` lines:
- `WIN` (label) / sum of wins — color `#3b6dff`
- `LOSS` (label) / sum of losses — color `#0d1426`
- `SCH` (label) / total scheduled count — color `#7a4dff`
- Numerals: mono, 22px, 700

### Season Cards
Each `teamDivision` → `GlassCard` with:
- Left-edge 3px accent bar: `linear-gradient(to bottom, #3b6dff, #7a4dff)`
- League name + division name + `已排 X 場 / X scheduled` meta
- Record badge: gradient bg, white mono text `{wins}W · {losses}L`
- Next-match panel (`rgba(59,109,255,.06)` tint, radius 10): date (mono, blue, 14px) + time (mono, muted, 10px) + `vs {opponent}` + venue. Omitted if no upcoming games.
- All season cards rendered identically regardless of scheduled game count

### Subscribe Footer
`position: sticky; bottom: 0`, glass strip, `padding: 16px`:
- Mono header: `SUBSCRIBE · 訂閱`
- `grid grid-cols-2 gap-2`:
  - Apple Calendar: gradient bg, white text, `shadow-btn-primary`, `href={webcalUrl}`
  - Google Calendar: translucent white, 1px border, ink text, `href={googleCalUrl}`
- Below buttons: `NotifyButton` (existing component, restyled) — full-width, ghost style (translucent white, 1px border), lucide `Bell` icon + `通知我 / Notify me`. Toggles to lucide `BellOff` icon + `已訂閱 / Subscribed` when active.
- Below that: mono ICS URL + `CopyButton` toggling `COPY → ✓ 已複製` for 1500ms

### Completed Games
Data query kept but section not rendered (not in the design).

---

## Section 5: Privacy & Terms

Both pages follow the same structure. Content sourced from the canonical arrays in `TGB Glass Full.html` (`T.zh.privacy_body`, `T.en.privacy_body`, `T.zh.terms_body`, `T.en.terms_body`) — 5 sections each, `[heading, paragraph]` pairs.

- Header: page title + `最後更新：2026 年 5 月 1 日 / Last updated: May 1, 2026` + Back link
- Each heading: 4px `#3b6dff` dot prefix
- Full-page routes only (`/[locale]/privacy`, `/[locale]/terms`) — no intercepting/parallel routes

---

## Section 6: API Changes

### `/api/teams/search` response shape
```ts
{ tid: number; name: string; leagueName: string; color: string }
```
Query joins `team_divisions` and `leagues` (subquery for most recent league per team). Color computed server-side via `getTeamColor(tid)`.

### Home page hot teams query
Same JOIN pattern, `LIMIT 5`, returns `leagueName` and `color`.

---

## Data Gaps & Decisions

| Field | Design Expects | DB Has | Resolution |
|-------|---------------|--------|------------|
| `color` | Per-team hex color | Nothing | Hash from `tid % 10` |
| `enName` | English team name | Nothing | Show zh name in both locales |
| `leagueName` | League per team | Via JOIN | JOIN `team_divisions → leagues` |

## Files Changed

```
apps/web/
  tailwind.config.ts              NEW
  postcss.config.js               NEW
  app/globals.css                 NEW
  lib/teamColor.ts                NEW
  components/GlassCard.tsx        NEW
  components/TopBar.tsx           NEW
  components/LangPill.tsx         NEW
  components/Footer.tsx           NEW
  app/[locale]/layout.tsx         UPDATED (fonts, halos, shell)
  app/[locale]/page.tsx           UPDATED (hero, search, popular)
  app/[locale]/components/
    HotTeams.tsx                  UPDATED (glass design, league, color)
    TeamSearch.tsx                UPDATED (glass design, debounce 150ms)
  app/[locale]/team/[tid]/page.tsx           UPDATED (stat strip, season cards, subscribe footer)
  app/[locale]/team/[tid]/NotifyButton.tsx   UPDATED (restyled to glass design)
  app/[locale]/privacy/page.tsx   UPDATED (full content)
  app/[locale]/terms/page.tsx     UPDATED (full content)
  app/api/teams/search/route.ts   UPDATED (league JOIN, color)
  i18n/routing.ts                 UPDATED (zh → zh-Hant)
  i18n/request.ts                 UPDATED (zh → zh-Hant)
  i18n/messages/zh.json           RENAMED → zh-Hant.json + new keys
  i18n/messages/en.json           UPDATED (new keys)
```
