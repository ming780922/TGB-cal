# Glass Tech UI Adaptation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt the TGB Calendar "Glass Tech" design handoff into the existing Next.js implementation, replacing bare unstyled pages with the full glassmorphism visual system.

**Architecture:** Install Tailwind CSS with custom design tokens; create shared glass components (GlassCard, TopBar, LangPill, Footer); rebuild home page (hero + search + popular teams) and team page (stat strip + season cards + sticky subscribe footer); fill in Privacy/Terms content. Locale renamed from `zh` → `zh-Hant` throughout.

**Tech Stack:** Next.js 14 App Router, next-intl, Tailwind CSS v3, lucide-react, next/font/google, Cloudflare D1

---

## File Map

```
apps/web/
  tailwind.config.ts                   NEW  — design tokens
  postcss.config.js                    NEW  — Tailwind PostCSS plugin
  app/globals.css                      NEW  — Tailwind directives + base font vars
  app/layout.tsx                       MOD  — import globals.css
  lib/teamColor.ts                     NEW  — getTeamColor(tid) hash utility
  components/GlassCard.tsx             NEW  — glass card wrapper
  components/LangPill.tsx              NEW  — locale toggle pill (client)
  components/ShareButton.tsx           NEW  — Web Share API button (client)
  components/TopBar.tsx                NEW  — page header (home/team variants)
  components/Footer.tsx                NEW  — footer with privacy/terms links
  i18n/routing.ts                      MOD  — zh → zh-Hant
  i18n/messages/zh.json                REN  → zh-Hant.json (+ new keys)
  i18n/messages/en.json                MOD  — new keys
  app/sitemap.ts                       MOD  — /zh/ → /zh-Hant/
  app/[locale]/layout.tsx              MOD  — fonts, halos, footer, locale guard
  app/[locale]/page.tsx                MOD  — hero, league JOIN query
  app/[locale]/components/HotTeams.tsx MOD  — glass design + league
  app/[locale]/components/TeamSearch.tsx MOD — glass design + league + avatar
  app/[locale]/team/[tid]/page.tsx     MOD  — stat strip, season cards, subscribe footer
  app/[locale]/team/[tid]/LocalDate.tsx MOD — add `part` prop for date/time split
  app/[locale]/team/[tid]/CopyButton.tsx MOD — restyle
  app/[locale]/team/[tid]/NotifyButton.tsx MOD — restyle + lucide icons
  app/[locale]/privacy/page.tsx        MOD  — full canonical content
  app/[locale]/terms/page.tsx          MOD  — full canonical content
  app/api/teams/search/route.ts        MOD  — JOIN leagues for leagueName
```

---

## Task 1: Install Dependencies & Configure Tailwind

**Files:**
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/app/globals.css`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/tsconfig.json`

- [ ] **Step 1: Install packages**

```bash
cd apps/web
npm install lucide-react
npm install -D tailwindcss postcss autoprefixer
```

- [ ] **Step 2: Create `apps/web/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0d1426',
        muted: '#5b6478',
        faint: '#9ba3b4',
        blue: '#3b6dff',
        violet: '#7a4dff',
        'glass-bg': 'rgba(255,255,255,0.65)',
        'glass-border': 'rgba(255,255,255,0.9)',
        'glass-line': 'rgba(13,20,38,0.08)',
        'page-bg': '#eef1f7',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'var(--font-noto)', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      // Custom radii: use rounded-[Npx] arbitrary values in JSX.
      // Do NOT add r-* keys here — they conflict with Tailwind's directional rounded-r-* prefix.
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.8) inset, 0 8px 24px rgba(13,20,38,0.06)',
        frame: '0 30px 80px rgba(13,20,38,0.18), 0 6px 18px rgba(13,20,38,0.08)',
        'btn-primary': '0 6px 18px rgba(59,109,255,0.32)',
        'dot-glow': '0 0 6px #3b6dff',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3: Create `apps/web/postcss.config.js`**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 4: Create `apps/web/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    font-family: var(--font-inter), var(--font-noto), -apple-system, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
}
```

- [ ] **Step 5: Add CSS import to `apps/web/app/layout.tsx`**

```tsx
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Step 6: Fix `@/*` path alias in `apps/web/tsconfig.json`**

The current config has `"@/*": ["./src/*"]` but there is no `src/` directory. Change it to point to the web app root:

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 7: Verify types compile**

```bash
cd apps/web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/tailwind.config.ts apps/web/postcss.config.js apps/web/app/globals.css apps/web/app/layout.tsx apps/web/tsconfig.json apps/web/package.json apps/web/package-lock.json
git commit -m "feat: install Tailwind CSS and lucide-react, fix @/* path alias"
```

---

## Task 2: Rename Locale zh → zh-Hant & Update i18n Messages

**Files:**
- Modify: `apps/web/i18n/routing.ts`
- Modify: `apps/web/i18n/messages/zh.json` → rename to `zh-Hant.json` + new keys
- Modify: `apps/web/i18n/messages/en.json` — new keys
- Modify: `apps/web/app/sitemap.ts`

- [ ] **Step 1: Update `apps/web/i18n/routing.ts`**

```ts
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['zh-Hant', 'en'],
  defaultLocale: 'zh-Hant',
});
```

- [ ] **Step 2: Rename message file and rewrite `apps/web/i18n/messages/zh-Hant.json`**

Delete `apps/web/i18n/messages/zh.json` and create `apps/web/i18n/messages/zh-Hant.json`:

```json
{
  "home": {
    "brandChip": "TGB · 行事曆",
    "taglineA": "訂閱賽程，",
    "taglineB": "同步到行事曆",
    "subHero": "一鍵連動 Apple、Google，自動隨賽季更新。",
    "searchPlaceholder": "搜尋球隊",
    "noResults": "找不到「{q}」相符的球隊",
    "popularHeader": "熱門球隊"
  },
  "team": {
    "back": "返回",
    "share": "分享",
    "active": "進行中",
    "win": "勝",
    "loss": "負",
    "sched": "已排",
    "seasons": "賽季",
    "scheduledOf": "已排 {s} / {t}",
    "nextMatch": "下一場",
    "vs": "vs",
    "subscribeHeader": "訂閱賽程",
    "apple": "Apple 行事曆",
    "google": "Google 日曆",
    "copyLink": "複製連結",
    "copied": "已複製",
    "notifyMe": "通知我",
    "notifyActive": "已訂閱"
  },
  "nav": {
    "home": "首頁",
    "terms": "使用條款",
    "privacy": "隱私權"
  },
  "meta": {
    "siteTitle": "TGB iCal 訂閱",
    "teamPageTitle": "{teamName} 賽程 | TGB iCal",
    "teamPageDescription": "{teamName} 的 TGB 籃球聯盟賽程，目前參加 {season} {division}。訂閱 iCal 即時取得比賽通知。"
  }
}
```

- [ ] **Step 3: Rewrite `apps/web/i18n/messages/en.json`**

```json
{
  "home": {
    "brandChip": "TGB · CALENDAR",
    "taglineA": "Subscribe and sync",
    "taglineB": "every game",
    "subHero": "One-tap into Apple Calendar or Google Calendar — schedules update automatically.",
    "searchPlaceholder": "Search teams",
    "noResults": "No teams match \"{q}\"",
    "popularHeader": "Popular teams"
  },
  "team": {
    "back": "Back",
    "share": "Share",
    "active": "Active",
    "win": "Win",
    "loss": "Loss",
    "sched": "Sched",
    "seasons": "Seasons",
    "scheduledOf": "{s} of {t} scheduled",
    "nextMatch": "Next match",
    "vs": "vs",
    "subscribeHeader": "Subscribe",
    "apple": "Apple Calendar",
    "google": "Google Calendar",
    "copyLink": "Copy link",
    "copied": "Copied",
    "notifyMe": "Notify me",
    "notifyActive": "Subscribed"
  },
  "nav": {
    "home": "Home",
    "terms": "Terms",
    "privacy": "Privacy"
  },
  "meta": {
    "siteTitle": "TGB iCal",
    "teamPageTitle": "{teamName} Schedule | TGB iCal",
    "teamPageDescription": "{teamName} TGB Basketball League schedule. Subscribe via iCal for game notifications."
  }
}
```

- [ ] **Step 4: Update `apps/web/app/sitemap.ts`** — replace `/zh/` with `/zh-Hant/`

```ts
export const runtime = 'edge';

import type { MetadataRoute } from 'next';
import { getRequestContext } from '@cloudflare/next-on-pages';

const BASE_URL = 'https://tgb.ming060.com';

interface TeamRow {
  tid: string;
  updated_at: number;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rootPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/zh-Hant`, lastModified: new Date() },
    { url: `${BASE_URL}/en`, lastModified: new Date() },
  ];

  try {
    const { env } = getRequestContext();
    const db = (env as { DB: D1Database }).DB;
    const result = await db.prepare('SELECT tid, updated_at FROM teams').all<TeamRow>();
    const teams = result.results ?? [];
    return [
      ...rootPages,
      ...teams.flatMap((team) => [
        { url: `${BASE_URL}/zh-Hant/team/${team.tid}`, lastModified: new Date(team.updated_at * 1000) },
        { url: `${BASE_URL}/en/team/${team.tid}`, lastModified: new Date(team.updated_at * 1000) },
      ]),
    ];
  } catch {
    return rootPages;
  }
}
```

- [ ] **Step 5: Verify types**

```bash
cd apps/web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/i18n/routing.ts apps/web/i18n/messages/ apps/web/app/sitemap.ts
git commit -m "feat: rename locale zh → zh-Hant and update i18n messages"
```

---

## Task 3: Create Team Color Utility

**Files:**
- Create: `apps/web/lib/teamColor.ts`

- [ ] **Step 1: Create `apps/web/lib/teamColor.ts`**

```ts
const PALETTE = [
  '#3b6dff',
  '#7a4dff',
  '#0ea5e9',
  '#f97316',
  '#f43f5e',
  '#f59e0b',
  '#10b981',
  '#6366f1',
  '#ec4899',
  '#14b8a6',
];

export function getTeamColor(tid: number): string {
  return PALETTE[Math.abs(tid) % PALETTE.length];
}
```

- [ ] **Step 2: Verify types**

```bash
cd apps/web
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/teamColor.ts
git commit -m "feat: add team color hash utility"
```

---

## Task 4: Update Search API to Return League Name

**Files:**
- Modify: `apps/web/app/api/teams/search/route.ts`

- [ ] **Step 1: Rewrite `apps/web/app/api/teams/search/route.ts`**

```ts
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

type Env = { DB: D1Database };

interface TeamRow {
  tid: number;
  name: string;
  league_name: string | null;
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (q === null) {
    return Response.json({ error: 'q param required' }, { status: 400 });
  }

  const { env } = getRequestContext() as { env: Env };
  const db = env.DB;

  const leagueSubquery = `(
    SELECT l.name FROM team_divisions td
    JOIN leagues l ON l.gid = td.gid
    WHERE td.tid = t.tid
    ORDER BY td.updated_at DESC LIMIT 1
  ) as league_name`;

  try {
    let rows: TeamRow[];

    if (q.length >= 2) {
      const result = await db
        .prepare(
          `SELECT t.tid, t.name, ${leagueSubquery}
           FROM teams t
           JOIN teams_fts f ON f.rowid = t.tid
           WHERE teams_fts MATCH ?
           ORDER BY rank
           LIMIT 20`
        )
        .bind(q + '*')
        .all<TeamRow>();
      rows = result.results;
    } else {
      const result = await db
        .prepare(
          `SELECT t.tid, t.name, ${leagueSubquery}
           FROM teams t
           WHERE t.name LIKE ?
           LIMIT 20`
        )
        .bind('%' + q + '%')
        .all<TeamRow>();
      rows = result.results;
    }

    return Response.json({
      results: rows.map(r => ({
        tid: r.tid,
        name: r.name,
        leagueName: r.league_name ?? '',
      })),
    });
  } catch (err) {
    console.error('[api/teams/search] error:', err);
    return Response.json({ results: [] }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify types**

```bash
cd apps/web
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/teams/search/route.ts
git commit -m "feat: extend search API to return league name"
```

---

## Task 5: Create Shared Components

**Files:**
- Create: `apps/web/components/GlassCard.tsx`
- Create: `apps/web/components/LangPill.tsx`
- Create: `apps/web/components/ShareButton.tsx`
- Create: `apps/web/components/TopBar.tsx`
- Create: `apps/web/components/Footer.tsx`

- [ ] **Step 1: Create `apps/web/components/GlassCard.tsx`**

```tsx
interface GlassCardProps {
  className?: string;
  children: React.ReactNode;
}

export function GlassCard({ className = '', children }: GlassCardProps) {
  return (
    <div
      className={`bg-[rgba(255,255,255,0.65)] border border-[rgba(255,255,255,0.9)] rounded-2xl backdrop-blur-xl shadow-card ${className}`}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/components/LangPill.tsx`**

```tsx
'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';

export function LangPill() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale;
  const pathname = usePathname();
  const router = useRouter();

  const toggle = () => {
    const next = locale === 'zh-Hant' ? 'en' : 'zh-Hant';
    const newPath = pathname.replace(`/${locale}`, `/${next}`);
    router.push(newPath);
  };

  return (
    <button
      onClick={toggle}
      type="button"
      className="bg-[rgba(255,255,255,0.65)] border border-[rgba(255,255,255,0.9)] rounded-full px-[10px] py-1 font-mono text-[10px] backdrop-blur-xl leading-none"
    >
      <span className={locale === 'zh-Hant' ? 'text-[#3b6dff]' : 'text-[#9ba3b4]'}>中</span>
      <span className="text-[#9ba3b4]"> · </span>
      <span className={locale === 'en' ? 'text-[#3b6dff]' : 'text-[#9ba3b4]'}>EN</span>
    </button>
  );
}
```

- [ ] **Step 3: Create `apps/web/components/ShareButton.tsx`**

```tsx
'use client';

import { Share2 } from 'lucide-react';

interface ShareButtonProps {
  label: string;
}

export function ShareButton({ label }: ShareButtonProps) {
  const handleShare = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ url: window.location.href });
      } catch {
        // user cancelled or not supported
      }
    } else {
      await navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
  };

  return (
    <button
      onClick={handleShare}
      type="button"
      className="font-mono text-[11px] text-[#5b6478] flex items-center gap-1"
    >
      <Share2 size={13} />
      {label}
    </button>
  );
}
```

- [ ] **Step 4: Create `apps/web/components/TopBar.tsx`**

```tsx
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { LangPill } from './LangPill';
import { ShareButton } from './ShareButton';

interface TopBarHomeProps {
  variant: 'home';
}

interface TopBarTeamProps {
  variant: 'team';
  locale: string;
  backLabel: string;
  shareLabel: string;
}

type TopBarProps = TopBarHomeProps | TopBarTeamProps;

export function TopBar(props: TopBarProps) {
  return (
    <div className="flex items-center justify-between px-5 pt-[14px]">
      <div>
        {props.variant === 'team' && (
          <Link
            href={`/${props.locale}`}
            className="font-mono text-[11px] text-[#5b6478] flex items-center gap-0.5"
          >
            <ChevronLeft size={14} />
            {props.backLabel}
          </Link>
        )}
      </div>
      <div>
        {props.variant === 'home' ? (
          <LangPill />
        ) : (
          <ShareButton label={props.shareLabel} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `apps/web/components/Footer.tsx`**

```tsx
import Link from 'next/link';

interface FooterProps {
  locale: string;
}

export function Footer({ locale }: FooterProps) {
  const isZh = locale === 'zh-Hant';
  return (
    <footer className="flex items-center justify-between px-5 py-4 font-mono text-[10px] text-[#9ba3b4]">
      <span>v1.0 · tgb.ming060.com</span>
      <div className="flex gap-3">
        <Link href={`/${locale}/privacy`} className="underline underline-offset-2">
          {isZh ? '隱私權' : 'Privacy'}
        </Link>
        <Link href={`/${locale}/terms`} className="underline underline-offset-2">
          {isZh ? '使用條款' : 'Terms'}
        </Link>
      </div>
    </footer>
  );
}
```

- [ ] **Step 6: Verify types**

```bash
cd apps/web
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/
git commit -m "feat: add shared glass components (GlassCard, TopBar, LangPill, Footer)"
```

---

## Task 6: Update Layout Shell

**Files:**
- Modify: `apps/web/app/[locale]/layout.tsx`

- [ ] **Step 1: Rewrite `apps/web/app/[locale]/layout.tsx`**

```tsx
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Inter, Noto_Sans_TC, JetBrains_Mono } from 'next/font/google';
import { Footer } from '@/components/Footer';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const notoSansTC = Noto_Sans_TC({
  subsets: ['chinese-traditional'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

const locales = ['zh-Hant', 'en'];

interface Props {
  children: React.ReactNode;
  params: { locale: string };
}

export default async function LocaleLayout({ children, params: { locale } }: Props) {
  if (!locales.includes(locale)) notFound();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${notoSansTC.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-[#eef1f7] min-h-screen relative overflow-x-hidden font-sans text-[#0d1426]">
        {/* Background halos */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="absolute w-[260px] h-[260px] rounded-full"
            style={{ top: -80, right: -60, background: 'radial-gradient(circle, rgba(122,77,255,0.38), transparent 70%)' }}
          />
          <div
            className="absolute w-[260px] h-[260px] rounded-full"
            style={{ top: 220, left: -80, background: 'radial-gradient(circle, rgba(59,109,255,0.32), transparent 70%)' }}
          />
          <div
            className="absolute w-[260px] h-[260px] rounded-full"
            style={{ bottom: -110, right: -60, background: 'radial-gradient(circle, rgba(59,109,255,0.22), transparent 70%)' }}
          />
        </div>

        <NextIntlClientProvider messages={messages}>
          <div className="relative z-10 max-w-[400px] mx-auto min-h-screen flex flex-col">
            <main className="flex-1">
              {children}
            </main>
            <Footer locale={locale} />
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify types**

```bash
cd apps/web
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/[locale]/layout.tsx
git commit -m "feat: update locale layout with fonts, halos, and footer"
```

---

## Task 7: Rebuild Home Page

**Files:**
- Modify: `apps/web/app/[locale]/page.tsx`
- Modify: `apps/web/app/[locale]/components/HotTeams.tsx`
- Modify: `apps/web/app/[locale]/components/TeamSearch.tsx`

- [ ] **Step 1: Rewrite `apps/web/app/[locale]/page.tsx`**

```tsx
export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getTranslations } from 'next-intl/server';
import { HotTeams } from './components/HotTeams';
import { TeamSearch } from './components/TeamSearch';
import { TopBar } from '@/components/TopBar';

type Props = { params: { locale: string } };

export async function generateMetadata({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('siteTitle') };
}

interface HotTeamRow {
  tid: number;
  name: string;
  league_name: string | null;
}

export default async function HomePage({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'home' });

  let hotTeams: Array<{ tid: number; name: string; leagueName: string }> = [];
  try {
    const { env } = getRequestContext();
    const result = await env.DB.prepare(`
      SELECT t.tid, t.name,
             (SELECT l.name FROM team_divisions td
              JOIN leagues l ON l.gid = td.gid
              WHERE td.tid = t.tid
              ORDER BY td.updated_at DESC LIMIT 1) as league_name
      FROM teams t
      ORDER BY t.updated_at DESC
      LIMIT 5
    `).all<HotTeamRow>();
    hotTeams = (result.results ?? []).map((r, i) => ({
      tid: r.tid,
      name: r.name,
      leagueName: r.league_name ?? '',
    }));
  } catch {
    hotTeams = [];
  }

  return (
    <div>
      <TopBar variant="home" />

      {/* Hero */}
      <div className="px-5 pt-7">
        <div className="inline-flex items-center gap-1.5 bg-[rgba(255,255,255,0.65)] border border-[rgba(255,255,255,0.9)] rounded-full px-3 py-1 font-mono text-[10px] text-[#5b6478] backdrop-blur-xl mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3b6dff]" />
          {t('brandChip')}
        </div>

        <h1 className="text-[32px] font-bold leading-[1.1] tracking-[-0.04em] text-[#0d1426] mb-3">
          <span className="block">{t('taglineA')}</span>
          <span className="block bg-gradient-to-br from-[#3b6dff] to-[#7a4dff] bg-clip-text text-transparent">
            {t('taglineB')}
          </span>
        </h1>

        <p className="text-[13px] text-[#5b6478] leading-[1.6]">{t('subHero')}</p>
      </div>

      {/* Search */}
      <div className="px-5 pt-5">
        <TeamSearch locale={locale} />
      </div>

      {/* Popular teams */}
      <div className="px-5 pt-6 pb-6">
        <HotTeams teams={hotTeams} locale={locale} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `apps/web/app/[locale]/components/HotTeams.tsx`**

```tsx
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { GlassCard } from '@/components/GlassCard';
import { getTeamColor } from '@/lib/teamColor';

type Props = {
  teams: Array<{ tid: number; name: string; leagueName: string }>;
  locale: string;
};

export async function HotTeams({ teams, locale }: Props) {
  if (teams.length === 0) return null;

  const t = await getTranslations({ locale, namespace: 'home' });

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="font-mono text-[10px] text-[#5b6478] tracking-[1.5px] uppercase">
          {t('popularHeader')}
        </span>
        <span className="font-mono text-[10px] text-[#9ba3b4]">
          {String(teams.length).padStart(2, '0')}
        </span>
      </div>

      <GlassCard>
        {teams.map((team, index) => {
          const color = getTeamColor(team.tid);
          const initial = team.name[0] ?? '?';
          const isLast = index === teams.length - 1;

          return (
            <Link
              key={team.tid}
              href={`/${locale}/team/${team.tid}`}
              className={`flex items-center gap-3 px-4 py-3 hover:bg-[rgba(59,109,255,0.04)] transition-colors ${!isLast ? 'border-b border-[rgba(13,20,38,0.06)]' : ''}`}
            >
              <span className="font-mono text-[10px] text-[#9ba3b4] w-5 shrink-0">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span
                className="w-7 h-7 rounded-[9px] flex items-center justify-center text-white font-bold text-[12px] shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${color}, ${color}dd)`,
                  boxShadow: `0 3px 8px ${color}33`,
                }}
              >
                {initial}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium text-[#0d1426] truncate">{team.name}</div>
                {team.leagueName && (
                  <div className="font-mono text-[10px] text-[#5b6478] truncate">{team.leagueName}</div>
                )}
              </div>
              <span className="text-[#3b6dff] text-[14px] shrink-0">→</span>
            </Link>
          );
        })}
      </GlassCard>
    </section>
  );
}
```

- [ ] **Step 3: Rewrite `apps/web/app/[locale]/components/TeamSearch.tsx`**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { GlassCard } from '@/components/GlassCard';
import { getTeamColor } from '@/lib/teamColor';

type TeamResult = {
  tid: number;
  name: string;
  leagueName: string;
};

type Props = { locale: string };

export function TeamSearch({ locale }: Props) {
  const t = useTranslations('home');
  const [inputValue, setInputValue] = useState('');
  const [results, setResults] = useState<TeamResult[] | null>(null);

  useEffect(() => {
    if (!inputValue) {
      setResults(null);
      return;
    }

    const timer = setTimeout(() => {
      fetch(`/api/teams/search?q=${encodeURIComponent(inputValue)}`)
        .then((res) => res.json() as Promise<{ results: TeamResult[] }>)
        .then((data) => setResults(data.results))
        .catch(() => setResults([]));
    }, 150);

    return () => clearTimeout(timer);
  }, [inputValue]);

  return (
    <div>
      {/* Search input */}
      <div className="bg-[rgba(255,255,255,0.65)] border border-[rgba(255,255,255,0.9)] rounded-[14px] backdrop-blur-xl shadow-card flex items-center px-[14px] gap-2 focus-within:ring-2 focus-within:ring-[rgba(59,109,255,0.15)] transition-shadow">
        <Search size={16} className="text-[#9ba3b4] shrink-0" />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="flex-1 bg-transparent py-3 text-[14px] text-[#0d1426] placeholder:text-[#9ba3b4] outline-none font-sans"
        />
        <span className="font-mono text-[10px] text-[#9ba3b4] bg-[rgba(13,20,38,0.05)] px-1.5 py-0.5 rounded shrink-0">
          ⌘K
        </span>
      </div>

      {/* Results */}
      {inputValue && results !== null && (
        <div className="mt-2">
          {results.length === 0 ? (
            <GlassCard className="px-4 py-3">
              <p className="text-[13px] text-[#5b6478]">
                {t('noResults', { q: inputValue })}
              </p>
            </GlassCard>
          ) : (
            <GlassCard>
              {results.map((team, index) => {
                const color = getTeamColor(team.tid);
                const initial = team.name[0] ?? '?';
                const isLast = index === results.length - 1;

                return (
                  <Link
                    key={team.tid}
                    href={`/${locale}/team/${team.tid}`}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-[rgba(59,109,255,0.04)] transition-colors ${!isLast ? 'border-b border-[rgba(13,20,38,0.06)]' : ''}`}
                  >
                    <span
                      className="w-8 h-8 rounded-[10px] flex items-center justify-center text-white font-bold text-[13px] shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${color}, ${color}dd)`,
                        boxShadow: `0 4px 10px ${color}33`,
                      }}
                    >
                      {initial}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium text-[#0d1426] truncate">{team.name}</div>
                      {team.leagueName && (
                        <div className="font-mono text-[10px] text-[#5b6478] truncate">{team.leagueName}</div>
                      )}
                    </div>
                    <span className="text-[#3b6dff] text-[14px] shrink-0">→</span>
                  </Link>
                );
              })}
            </GlassCard>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify types**

```bash
cd apps/web
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/[locale]/page.tsx apps/web/app/[locale]/components/
git commit -m "feat: rebuild home page with glass design (hero, search, popular teams)"
```

---

## Task 8: Rebuild Team Page

**Files:**
- Modify: `apps/web/app/[locale]/team/[tid]/page.tsx`
- Modify: `apps/web/app/[locale]/team/[tid]/LocalDate.tsx`
- Modify: `apps/web/app/[locale]/team/[tid]/CopyButton.tsx`
- Modify: `apps/web/app/[locale]/team/[tid]/NotifyButton.tsx`

- [ ] **Step 1: Update `apps/web/app/[locale]/team/[tid]/LocalDate.tsx`** — add `part` prop

```tsx
'use client';

import { useEffect, useState } from 'react';

interface Props {
  timestamp: number;
  part?: 'date' | 'time';
}

export default function LocalDate({ timestamp, part }: Props) {
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    const d = new Date(timestamp * 1000);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    setDate(`${m}/${day}`);
    setTime(`${hh}:${mm}`);
  }, [timestamp]);

  if (!date) return <span aria-hidden="true">&nbsp;</span>;

  if (part === 'date') return <span>{date}</span>;
  if (part === 'time') return <span>{time}</span>;
  return <span>{date} {time}</span>;
}
```

- [ ] **Step 2: Restyle `apps/web/app/[locale]/team/[tid]/CopyButton.tsx`**

```tsx
'use client';

import { useState } from 'react';

interface CopyButtonProps {
  url: string;
  label: string;
  copiedLabel: string;
}

export default function CopyButton({ url, label, copiedLabel }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="flex-1 font-mono text-[10px] text-[#9ba3b4] truncate">{url}</span>
      <button
        onClick={handleCopy}
        type="button"
        className="font-mono text-[10px] font-semibold shrink-0 transition-colors"
        style={{ color: copied ? '#3b6dff' : '#5b6478' }}
      >
        {copied ? `✓ ${copiedLabel}` : label.toUpperCase()}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Restyle `apps/web/app/[locale]/team/[tid]/NotifyButton.tsx`**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';

interface NotifyButtonProps {
  tid: number;
  label: string;
  activeLabel: string;
}

const storageKey = (tid: number) => `push_sub_${tid}`;

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

export default function NotifyButton({ tid, label, activeLabel }: NotifyButtonProps) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if ('PushManager' in window && 'serviceWorker' in navigator) {
      setSupported(true);
      setSubscribed(localStorage.getItem(storageKey(tid)) === 'true');
    }
  }, [tid]);

  if (!supported) return null;

  const handleSubscribe = async () => {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
    const pushSub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    const subJson = pushSub.toJSON();
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        tid,
        endpoint: subJson.endpoint,
        p256dh: subJson.keys!.p256dh,
        auth: subJson.keys!.auth,
      }),
    });
    localStorage.setItem(storageKey(tid), 'true');
    setSubscribed(true);
  };

  const handleUnsubscribe = async () => {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (reg) {
      const pushSub = await reg.pushManager.getSubscription();
      if (pushSub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tid, endpoint: pushSub.endpoint }),
        });
        await pushSub.unsubscribe();
      }
    }
    localStorage.removeItem(storageKey(tid));
    setSubscribed(false);
  };

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      if (subscribed) await handleUnsubscribe();
      else await handleSubscribe();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        type="button"
        className="w-full flex items-center justify-center gap-2 py-[11px] px-4 rounded-[12px] font-medium text-[13px] bg-[rgba(255,255,255,0.85)] border border-[rgba(13,20,38,0.08)] text-[#0d1426] disabled:opacity-60 transition-opacity"
      >
        {loading ? (
          <span className="font-mono text-[11px] text-[#9ba3b4]">···</span>
        ) : subscribed ? (
          <>
            <BellOff size={15} className="text-[#5b6478]" />
            {activeLabel}
          </>
        ) : (
          <>
            <Bell size={15} className="text-[#3b6dff]" />
            {label}
          </>
        )}
      </button>
      {error && (
        <p className="mt-1 font-mono text-[10px] text-[#f43f5e]">{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `apps/web/app/[locale]/team/[tid]/page.tsx`**

```tsx
import { getTranslations } from 'next-intl/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { notFound } from 'next/navigation';
import CopyButton from './CopyButton';
import LocalDate from './LocalDate';
import NotifyButton from './NotifyButton';
import { TopBar } from '@/components/TopBar';
import { GlassCard } from '@/components/GlassCard';

interface Props {
  params: { locale: string; tid: string };
}

interface DivisionRow {
  wins: number;
  losses: number;
  rank: number | null;
  level_id: number;
  gid: number;
  name: string | null;
  league_name: string;
  scheduled_count: number;
  total_count: number;
}

interface UpcomingGameRow {
  game_id: number;
  scheduled_at: number;
  venue: string;
  status: string;
  home_tid: number;
  away_tid: number;
  home_name: string;
  away_name: string;
  level_id?: number;
}

export const runtime = 'edge';

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props) {
  const { locale, tid } = params;
  if (isNaN(parseInt(tid))) return {};
  const t = await getTranslations({ locale, namespace: 'meta' });
  try {
    const { env } = getRequestContext();
    const team = await env.DB.prepare('SELECT name FROM teams WHERE tid = ?')
      .bind(tid)
      .first<{ name: string }>();
    if (!team?.name) return { title: t('siteTitle') };
    return { title: t('teamPageTitle', { teamName: team.name }) };
  } catch {
    return { title: t('siteTitle') };
  }
}

export default async function TeamPage({ params }: Props) {
  const { locale, tid } = params;
  if (isNaN(parseInt(tid))) notFound();

  const t = await getTranslations({ locale, namespace: 'team' });

  let team: { tid: string; name: string } | null = null;
  try {
    const { env } = getRequestContext();
    team = await env.DB.prepare('SELECT tid, name FROM teams WHERE tid = ?')
      .bind(tid)
      .first<{ tid: string; name: string }>();
  } catch {
    notFound();
  }
  if (!team) notFound();

  let teamDivisions: DivisionRow[] = [];
  let upcomingGames: UpcomingGameRow[] = [];

  try {
    const { env } = getRequestContext();
    const now = Math.floor(Date.now() / 1000);

    const divResult = await env.DB.prepare(`
      SELECT td.wins, td.losses, td.rank,
             d.level_id, d.gid, d.name,
             l.name as league_name,
             (SELECT COUNT(*) FROM games g
              WHERE g.level_id = d.level_id
              AND (g.home_tid = td.tid OR g.away_tid = td.tid)
              AND g.status = 'scheduled'
              AND g.scheduled_at > ?) as scheduled_count,
             (SELECT COUNT(*) FROM games g
              WHERE g.level_id = d.level_id
              AND (g.home_tid = td.tid OR g.away_tid = td.tid)) as total_count
      FROM team_divisions td
      JOIN divisions d ON d.level_id = td.level_id
      JOIN leagues l ON l.gid = d.gid
      WHERE td.tid = ?
      ORDER BY d.updated_at DESC
    `).bind(now, Number(tid)).all<DivisionRow>();
    teamDivisions = divResult.results ?? [];

    const upcomingResult = await env.DB.prepare(`
      SELECT g.game_id, g.level_id, g.scheduled_at, g.venue, g.status,
             g.home_tid, g.away_tid,
             ht.name as home_name, at.name as away_name
      FROM games g
      JOIN teams ht ON ht.tid = g.home_tid
      JOIN teams at ON at.tid = g.away_tid
      WHERE (g.home_tid = ? OR g.away_tid = ?) AND g.status = 'scheduled'
      ORDER BY g.scheduled_at ASC
      LIMIT 10
    `).bind(Number(tid), Number(tid)).all<UpcomingGameRow>();
    upcomingGames = upcomingResult.results ?? [];
  } catch {
    // defaults to empty arrays
  }

  const icalUrl = `https://tgb.ming060.com/ical/${tid}.ics`;
  const webcalUrl = `webcal://tgb.ming060.com/ical/${tid}.ics`;
  const googleCalUrl = `https://calendar.google.com/calendar/r/settings/addbyurl?url=${encodeURIComponent(icalUrl)}`;

  const totalWins = teamDivisions.reduce((s, d) => s + d.wins, 0);
  const totalLosses = teamDivisions.reduce((s, d) => s + d.losses, 0);
  const totalScheduled = teamDivisions.reduce((s, d) => s + d.scheduled_count, 0);

  const latestDiv = teamDivisions[0];

  return (
    <div className="pb-[140px]">
      <TopBar
        variant="team"
        locale={locale}
        backLabel={t('back')}
        shareLabel={t('share')}
      />

      {/* Hero header */}
      <div className="px-5 pt-5">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="w-1.5 h-1.5 rounded-full bg-[#3b6dff]"
            style={{ boxShadow: '0 0 6px #3b6dff' }}
          />
          <span className="font-mono text-[10px] text-[#5b6478] tracking-[1.5px]">
            {t('active').toUpperCase()} · {tid.toUpperCase()}
          </span>
        </div>

        <h1 className="text-[30px] font-bold tracking-[-0.02em] text-[#0d1426] mb-1">
          {team.name}
        </h1>

        {latestDiv && (
          <p className="text-[12px] text-[#5b6478]">
            {latestDiv.league_name}
            {latestDiv.name ? ` · ${latestDiv.name}` : ''}
          </p>
        )}
      </div>

      {/* Stat strip */}
      <div className="px-5 pt-4">
        <GlassCard className="flex divide-x divide-[rgba(13,20,38,0.08)]">
          {[
            { label: t('win'), value: totalWins, color: '#3b6dff' },
            { label: t('loss'), value: totalLosses, color: '#0d1426' },
            { label: t('sched'), value: totalScheduled, color: '#7a4dff' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex-1 flex flex-col items-center py-4 gap-1">
              <span
                className="font-mono text-[22px] font-bold leading-none"
                style={{ color }}
              >
                {value}
              </span>
              <span className="font-mono text-[9px] tracking-[1.5px] text-[#9ba3b4] uppercase">
                {label}
              </span>
            </div>
          ))}
        </GlassCard>
      </div>

      {/* Season cards */}
      {teamDivisions.length > 0 && (
        <div className="px-5 pt-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-[10px] text-[#5b6478] tracking-[1.5px] uppercase">
              {t('seasons')} · {String(teamDivisions.length).padStart(2, '0')}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {teamDivisions.map((div) => {
              const nextGame = upcomingGames.find((g) => g.level_id === div.level_id);
              const opponent = nextGame
                ? nextGame.home_tid === Number(tid)
                  ? nextGame.away_name
                  : nextGame.home_name
                : null;
              const displayTitle = div.name || div.league_name;

              return (
                <div key={div.level_id} className="relative">
                  <GlassCard className="pl-4 pr-4 py-4 relative overflow-hidden">
                    {/* Left accent bar */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-[3px]"
                      style={{ background: 'linear-gradient(to bottom, #3b6dff, #7a4dff)' }}
                    />

                    <div className="flex items-start justify-between gap-2 ml-1">
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-semibold text-[#0d1426] truncate">
                          {div.league_name}
                        </div>
                        <div className="font-mono text-[11px] text-[#5b6478] mt-0.5">
                          {displayTitle !== div.league_name ? `${displayTitle} · ` : ''}
                          {t('scheduledOf', { s: div.scheduled_count, t: div.total_count })}
                        </div>
                      </div>

                      <span
                        className="font-mono text-[11px] font-semibold text-white px-[9px] py-[3px] rounded-[6px] whitespace-nowrap shrink-0"
                        style={{
                          background: 'linear-gradient(135deg, #3b6dff, #7a4dff)',
                          boxShadow: '0 4px 10px rgba(59,109,255,0.3)',
                        }}
                      >
                        {div.wins}W · {div.losses}L
                      </span>
                    </div>

                    {nextGame && opponent && (
                      <div
                        className="mt-[10px] ml-1 p-[10px] rounded-[10px] flex items-center gap-[10px]"
                        style={{ background: 'rgba(59,109,255,0.06)' }}
                      >
                        <div className="shrink-0">
                          <div className="font-mono text-[9px] text-[#9ba3b4] tracking-[1px] uppercase mb-0.5">
                            {t('nextMatch')}
                          </div>
                          <div className="font-mono text-[14px] font-semibold text-[#3b6dff]">
                            <LocalDate timestamp={nextGame.scheduled_at} part="date" />
                          </div>
                          <div className="font-mono text-[10px] text-[#9ba3b4]">
                            <LocalDate timestamp={nextGame.scheduled_at} part="time" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-[#0d1426]">
                            {t('vs')} {opponent}
                          </div>
                          {nextGame.venue && (
                            <div className="font-mono text-[10px] text-[#5b6478] truncate mt-0.5">
                              {nextGame.venue}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </GlassCard>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Subscribe footer — sticky */}
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[400px] px-4 pb-4 pt-3 z-20"
        style={{
          background: 'rgba(255,255,255,0.85)',
          borderTop: '1px solid rgba(255,255,255,0.9)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <p className="font-mono text-[10px] text-[#9ba3b4] tracking-[1.5px] uppercase mb-2">
          {t('subscribeHeader')}
        </p>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <a
            href={webcalUrl}
            className="flex items-center justify-center py-[11px] px-3 rounded-[12px] text-[13px] font-semibold text-white text-center"
            style={{
              background: 'linear-gradient(135deg, #3b6dff, #7a4dff)',
              boxShadow: '0 6px 18px rgba(59,109,255,0.35)',
            }}
          >
            {t('apple')}
          </a>
          <a
            href={googleCalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center py-[11px] px-3 rounded-[12px] text-[13px] font-semibold text-[#0d1426] bg-[rgba(255,255,255,0.85)] border border-[rgba(13,20,38,0.08)] text-center"
          >
            {t('google')}
          </a>
        </div>

        <NotifyButton
          tid={Number(tid)}
          label={t('notifyMe')}
          activeLabel={t('notifyActive')}
        />

        <CopyButton
          url={icalUrl}
          label={t('copyLink')}
          copiedLabel={t('copied')}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify types**

```bash
cd apps/web
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/[locale]/team/[tid]/
git commit -m "feat: rebuild team page with glass design (stat strip, season cards, subscribe footer)"
```

---

## Task 9: Update Privacy & Terms Pages

**Files:**
- Modify: `apps/web/app/[locale]/privacy/page.tsx`
- Modify: `apps/web/app/[locale]/terms/page.tsx`

- [ ] **Step 1: Rewrite `apps/web/app/[locale]/privacy/page.tsx`**

```tsx
export const runtime = 'edge';

import Link from 'next/link';
import { GlassCard } from '@/components/GlassCard';

type Props = { params: { locale: string } };

export async function generateMetadata({ params: { locale } }: Props) {
  return {
    title: locale === 'zh-Hant' ? '隱私權政策 | TGB iCal' : 'Privacy Policy | TGB iCal',
  };
}

const ZH_BODY: [string, string][] = [
  ['我們收集的資料', 'TGB 行事曆只儲存球隊、聯盟與賽程等公開資訊。我們不會在沒有你同意的情況下儲存個人識別資料。'],
  ['訂閱機制', '當你訂閱球隊賽程時，我們提供一個 .ics 連結。你的行事曆 App 會定期向 tgb.ming060.com 拉取最新資料，我們會記錄基本的存取紀錄（IP、時間）以維持服務品質。'],
  ['Cookies', '我們僅使用功能性 Cookies（例如語言偏好設定），不使用追蹤或廣告 Cookies。'],
  ['資料分享', '我們不會向第三方販售或分享你的資料。'],
  ['聯絡我們', '若有任何隱私權相關問題，請聯絡 privacy@tgb.ming060.com。'],
];

const EN_BODY: [string, string][] = [
  ['What we collect', 'TGB Calendar stores only public information about teams, leagues, and schedules. We do not store personal data without consent.'],
  ['Subscription mechanics', 'When you subscribe, we provide a .ics URL. Your calendar app periodically fetches updates from tgb.ming060.com — we keep basic access logs (IP, timestamp) to ensure service quality.'],
  ['Cookies', 'We only use functional cookies (e.g. language preference). No tracking or advertising cookies.'],
  ['Data sharing', 'We do not sell or share your data with third parties.'],
  ['Contact', 'For privacy questions, please contact privacy@tgb.ming060.com.'],
];

export default function PrivacyPage({ params: { locale } }: Props) {
  const isZh = locale === 'zh-Hant';
  const body = isZh ? ZH_BODY : EN_BODY;
  const title = isZh ? '隱私權政策' : 'Privacy Policy';
  const updated = isZh ? '最後更新：2026 年 5 月 1 日' : 'Last updated: May 1, 2026';
  const backLabel = isZh ? '返回首頁' : 'Back to home';

  return (
    <div className="px-5 pt-5 pb-8">
      <Link
        href={`/${locale}`}
        className="font-mono text-[11px] text-[#5b6478] mb-5 inline-block"
      >
        ← {backLabel}
      </Link>

      <h1 className="text-[24px] font-bold text-[#0d1426] mb-1">{title}</h1>
      <p className="font-mono text-[10px] text-[#9ba3b4] mb-6">{updated}</p>

      <div className="flex flex-col gap-4">
        {body.map(([heading, paragraph]) => (
          <GlassCard key={heading} className="px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1 h-4 rounded-full bg-[#3b6dff] shrink-0" />
              <h2 className="text-[14px] font-semibold text-[#0d1426]">{heading}</h2>
            </div>
            <p className="text-[13px] text-[#5b6478] leading-[1.6]">{paragraph}</p>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `apps/web/app/[locale]/terms/page.tsx`**

```tsx
export const runtime = 'edge';

import Link from 'next/link';
import { GlassCard } from '@/components/GlassCard';

type Props = { params: { locale: string } };

export async function generateMetadata({ params: { locale } }: Props) {
  return {
    title: locale === 'zh-Hant' ? '使用條款 | TGB iCal' : 'Terms of Use | TGB iCal',
  };
}

const ZH_BODY: [string, string][] = [
  ['服務範圍', 'TGB 行事曆提供球隊賽程查詢與訂閱服務。所有賽程資訊由各聯盟主辦方提供，我們盡力確保正確，但不保證完全無誤。'],
  ['使用規範', '請勿利用本服務進行任何違法、騷擾或破壞性的行為。我們保留隨時暫停服務的權利。'],
  ['訂閱連結', '訂閱用的 .ics 連結為公開連結。請自行斟酌分享對象。'],
  ['免責聲明', '比賽時間、地點等資訊可能臨時調整，請以聯盟官方公告為準。'],
  ['條款變更', '我們可能不定期更新本條款，變更後將在此頁公告。持續使用即視為同意新條款。'],
];

const EN_BODY: [string, string][] = [
  ['Scope', 'TGB Calendar provides team schedule lookup and subscription. Schedule data is supplied by leagues; we strive for accuracy but make no warranty.'],
  ['Acceptable use', 'Do not use the service for unlawful, harassing, or disruptive activity. We may suspend service at any time.'],
  ['Subscription URLs', '.ics URLs are public links. Share at your own discretion.'],
  ['Disclaimer', 'Game times and venues may change. The league\'s official announcement prevails.'],
  ['Changes', 'We may update these terms occasionally. Continued use constitutes acceptance.'],
];

export default function TermsPage({ params: { locale } }: Props) {
  const isZh = locale === 'zh-Hant';
  const body = isZh ? ZH_BODY : EN_BODY;
  const title = isZh ? '使用條款' : 'Terms of Use';
  const updated = isZh ? '最後更新：2026 年 5 月 1 日' : 'Last updated: May 1, 2026';
  const backLabel = isZh ? '返回首頁' : 'Back to home';

  return (
    <div className="px-5 pt-5 pb-8">
      <Link
        href={`/${locale}`}
        className="font-mono text-[11px] text-[#5b6478] mb-5 inline-block"
      >
        ← {backLabel}
      </Link>

      <h1 className="text-[24px] font-bold text-[#0d1426] mb-1">{title}</h1>
      <p className="font-mono text-[10px] text-[#9ba3b4] mb-6">{updated}</p>

      <div className="flex flex-col gap-4">
        {body.map(([heading, paragraph]) => (
          <GlassCard key={heading} className="px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1 h-4 rounded-full bg-[#3b6dff] shrink-0" />
              <h2 className="text-[14px] font-semibold text-[#0d1426]">{heading}</h2>
            </div>
            <p className="text-[13px] text-[#5b6478] leading-[1.6]">{paragraph}</p>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify types**

```bash
cd apps/web
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/[locale]/privacy/page.tsx apps/web/app/[locale]/terms/page.tsx
git commit -m "feat: fill in privacy and terms pages with canonical content"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Full type check**

```bash
cd apps/web
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Start dev server and manually verify**

```bash
cd apps/web
npm run dev
```

Open `http://localhost:3000/zh-Hant` and check:
- Background halos visible behind the glass cards
- TopBar with lang pill (中 · EN) on home page
- Hero with gradient text on second line
- Search input with Search icon and ⌘K badge
- Popular teams list with colored avatars and rank numbers (01–05)
- Clicking a team opens the team page
- Team page: stat strip (WIN/LOSS/SCHED), season cards with left accent bar and next-match panel
- Sticky subscribe footer with Apple/Google buttons and notify button (Bell icon)
- Copy URL row at bottom of footer
- Footer links open /zh-Hant/privacy and /zh-Hant/terms with full content
- Lang pill switches to /en/... correctly

- [ ] **Step 3: Commit (if any final fixes needed)**

```bash
git add -p
git commit -m "fix: final adjustments after visual verification"
```
