# AI Matchup Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone CLI tool that takes a TGB game ID, scrapes this season's completed game stats for both teams, and generates pre-game AI analysis reports from each team's perspective.

**Architecture:** New isolated package `packages/ai-analysis/` with no dependencies on existing packages. Scrapes `event.php?eid=X` to discover teams and division, then scrapes `division.php` to find each team's completed games, then scrapes individual event pages for stats. Calls an AI provider (Anthropic or OpenAI) via a unified interface to produce two analysis reports.

**Tech Stack:** Node.js 20+ ESM, cheerio (HTML parsing), @anthropic-ai/sdk, openai SDK, dotenv, node:test (unit tests for pure functions)

---

## File Map

| File | Responsibility |
|---|---|
| `packages/ai-analysis/package.json` | Package definition and dependencies |
| `packages/ai-analysis/.env.example` | Environment variable documentation |
| `packages/ai-analysis/index.js` | CLI entry point — parses args, orchestrates all steps, writes output |
| `packages/ai-analysis/event-scraper.js` | Two exports: `scrapeEventMeta` (team/division lookup) and `scrapeEventStats` (completed game stats) |
| `packages/ai-analysis/division-finder.js` | Scrapes division page to find completed game eids for each team |
| `packages/ai-analysis/stats-aggregator.js` | Pure function: takes raw scraped game arrays, returns normalized `MatchupData` |
| `packages/ai-analysis/prompt.js` | Pure function: takes `MatchupData` + perspective, returns prompt string |
| `packages/ai-analysis/providers/anthropic.js` | Anthropic SDK adapter — exports `generate(prompt)` |
| `packages/ai-analysis/providers/openai.js` | OpenAI SDK adapter — exports `generate(prompt)` |
| `packages/ai-analysis/ai-client.js` | Reads `AI_PROVIDER` env var, loads correct provider, re-exports `generate` |
| `packages/ai-analysis/test/stats-aggregator.test.js` | Unit tests for `buildMatchupData` |
| `packages/ai-analysis/test/prompt.test.js` | Unit tests for `buildPrompt` |
| `.github/workflows/ai-analysis.yml` | GitHub Actions manual dispatch workflow |

---

## Data Structures

These types flow through the system. Every task references them — read this first.

```js
// Output of scrapeEventMeta(gameId)
// Meta = metadata about the target (upcoming) game
{
  gameId: 19487,
  home: { tid: 316, name: "師大公鹿" },
  away: { tid: 107, name: "520" },
  gid: 211,
  levelId: 1157,
}

// Output of scrapeEventStats(eid) — one completed game
// RawGameStats
{
  eid: 19200,
  homeTid: 316,       // which team was home in THIS completed game
  awayTid: 107,
  homeStats: {
    points: 38,
    twoFGM: 10, twoFGA: 23,
    threeFGM: 4, threeFGA: 23,
    ftm: 6, fta: 9,
    offRebounds: 15, defRebounds: 27, rebounds: 42,
    assists: 9, steals: 4, blocks: 0, turnovers: 11, fouls: 0,
    quarterScores: [17, 8, 0, 13],
    players: [
      { name: "陳廷威", points: 15, rebounds: 10, assists: 2, steals: 1, turnovers: 2 }
    ],
  },
  awayStats: { /* same shape */ },
}

// Output of buildMatchupData(meta, homeRawGames, awayRawGames)
// MatchupData — the universal structure passed to prompt and written to JSON
{
  matchup: {
    gameId: 19487,
    home: { tid: 316, name: "師大公鹿" },
    away: { tid: 107, name: "520" },
  },
  homeTeamGames: [
    {
      gameId: 19200,
      date: "2026-04-12",
      opponent: "520",
      result: "loss",   // "win" | "loss" | null
      teamStats: {
        fgPct: 0.435, threePct: 0.174, ftPct: 0.667,
        offRebounds: 15, defRebounds: 27, rebounds: 42,
        assists: 9, steals: 4, blocks: 0, turnovers: 11,
        quarterScores: [17, 8, 0, 13],
        points: 38,
      },
      topPlayers: [
        { name: "陳廷威", points: 15, rebounds: 10, assists: 2, steals: 1, turnovers: 2 }
      ],
    }
    // ... more games
  ],
  awayTeamGames: [ /* same shape */ ],
}
```

---

## Task 1: Package scaffold

**Files:**

- Create: `packages/ai-analysis/package.json`
- Create: `packages/ai-analysis/.env.example`
- Create: `packages/ai-analysis/index.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@tgb-calendar/ai-analysis",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "index.js",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test test/*.test.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.51.0",
    "cheerio": "^1.0.0",
    "dotenv": "^16.4.0",
    "openai": "^4.96.0"
  }
}
```

- [ ] **Step 2: Create .env.example**

```bash
# AI provider: "anthropic" (default) or "openai"
AI_PROVIDER=anthropic

# Anthropic (required when AI_PROVIDER=anthropic)
ANTHROPIC_API_KEY=sk-ant-...
# MODEL defaults to claude-sonnet-4-6 when using anthropic

# OpenAI (required when AI_PROVIDER=openai)
OPENAI_API_KEY=sk-...
# MODEL defaults to gpt-4o when using openai

# Override model for either provider
MODEL=

# Optional: override TGB base URL (for testing)
TGB_BASE_URL=https://tgbleague.com
```

- [ ] **Step 3: Create index.js skeleton**

```js
import 'dotenv/config';
import { writeFileSync } from 'node:fs';

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (const arg of args) {
    const [key, val] = arg.replace(/^--/, '').split('=');
    params[key] = val;
  }
  if (!params.game_id) {
    console.error('Usage: node index.js --game_id=<eid>');
    process.exit(1);
  }
  return { gameId: parseInt(params.game_id) };
}

async function main() {
  const { gameId } = parseArgs();
  console.log(`\n[ai-analysis] Starting analysis for game ${gameId}\n`);
  // TODO: orchestration added in Task 10
  console.log('[ai-analysis] Done (scaffold only)');
}

main().catch(err => {
  console.error('[ai-analysis] Fatal:', err.message);
  process.exit(1);
});
```

- [ ] **Step 4: Install dependencies**

```bash
cd packages/ai-analysis && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 5: Smoke-test CLI skeleton**

```bash
node packages/ai-analysis/index.js --game_id=19487
```

Expected output:
```
[ai-analysis] Starting analysis for game 19487
[ai-analysis] Done (scaffold only)
```

- [ ] **Step 6: Commit**

```bash
git add packages/ai-analysis/
git commit -m "feat(ai-analysis): scaffold package with CLI arg parsing"
```

---

## Task 2: Event scraper — metadata extraction

Scrapes `event.php?eid=X` to identify the two teams and their division. Works on both upcoming and completed games (team links always present).

**Files:**

- Create: `packages/ai-analysis/event-scraper.js`

- [ ] **Step 1: Create event-scraper.js with scrapeEventMeta**

```js
import * as cheerio from 'cheerio';

const BASE_URL = process.env.TGB_BASE_URL || 'https://tgbleague.com';

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TGBAnalysisBot/1.0 (+https://tgb.ming060.com)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Scrape team and division metadata from an event page.
 * Works for upcoming games (no stats yet) and completed games.
 *
 * @param {number} gameId - The eid of the target game
 * @returns {{ gameId, home: {tid, name}, away: {tid, name}, gid, levelId }}
 */
export async function scrapeEventMeta(gameId) {
  const url = `${BASE_URL}/event.php?eid=${gameId}`;
  console.log(`[meta] GET ${url}`);
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  // team.php links contain both tid= and level_id= — one per team
  const teamLinks = [];
  $('a[href*="team.php"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const tidMatch = href.match(/tid=(\d+)/);
    const levelMatch = href.match(/level_id=(\d+)/);
    if (tidMatch && levelMatch) {
      const tid = parseInt(tidMatch[1]);
      const levelId = parseInt(levelMatch[1]);
      const name = $(el).text().trim();
      if (name && !teamLinks.find(t => t.tid === tid)) {
        teamLinks.push({ tid, name, levelId });
      }
    }
  });

  if (teamLinks.length < 2) {
    throw new Error(
      `Expected 2 team links on event page ${gameId}, found ${teamLinks.length}. ` +
      `The game may not exist or page structure changed.`
    );
  }

  const levelId = teamLinks[0].levelId;
  const home = { tid: teamLinks[0].tid, name: teamLinks[0].name };
  const away = { tid: teamLinks[1].tid, name: teamLinks[1].name };

  // Find gid: scan all division.php links for one matching our levelId
  let gid = null;
  $('a[href*="division.php"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const gidMatch = href.match(/gid=(\d+)/);
    const levelMatch = href.match(/level_id=(\d+)/);
    if (gidMatch && levelMatch && parseInt(levelMatch[1]) === levelId) {
      gid = parseInt(gidMatch[1]);
      return false; // break each loop
    }
  });

  if (!gid) {
    throw new Error(
      `Could not find gid for level_id=${levelId} on event page ${gameId}. ` +
      `No division.php link matched.`
    );
  }

  return { gameId, home, away, gid, levelId };
}
```

- [ ] **Step 2: Manual smoke test**

Add a temporary test call at the bottom of the file:

```js
// Temporary — remove after verification
const meta = await scrapeEventMeta(19487);
console.log(JSON.stringify(meta, null, 2));
```

Run:

```bash
node packages/ai-analysis/event-scraper.js
```

Expected output (exact tids/gid may vary):
```json
{
  "gameId": 19487,
  "home": { "tid": 316, "name": "師大公鹿" },
  "away": { "tid": 107, "name": "520" },
  "gid": 211,
  "levelId": 1157
}
```

If you see two teams, gid, and levelId — it works. If parsing fails, check that the page still uses `team.php?tid=X&level_id=Y` and `division.php?gid=X&level_id=Y` link patterns.

- [ ] **Step 3: Remove the temporary test call from event-scraper.js**

- [ ] **Step 4: Commit**

```bash
git add packages/ai-analysis/event-scraper.js
git commit -m "feat(ai-analysis): scrapeEventMeta — extract team and division from event page"
```

---

## Task 3: Division finder — completed game discovery

Scrapes `division.php?gid=X&level_id=Y` to find all completed games for each team this season.

**Files:**

- Create: `packages/ai-analysis/division-finder.js`

- [ ] **Step 1: Create division-finder.js**

```js
import * as cheerio from 'cheerio';
import { sleep } from './event-scraper.js';

const BASE_URL = process.env.TGB_BASE_URL || 'https://tgbleague.com';

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TGBAnalysisBot/1.0 (+https://tgb.ming060.com)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

/**
 * Scrape the division page to find completed game eids for each team.
 *
 * A game is "completed" when it has a real eid link AND scores in both cells.
 *
 * @param {number} gid
 * @param {number} levelId
 * @param {number} homeTid  - the home team of the target upcoming game
 * @param {number} awayTid  - the away team of the target upcoming game
 * @returns {{ homeEids: number[], awayEids: number[] }}
 */
export async function findCompletedGameEids(gid, levelId, homeTid, awayTid) {
  const url = `${BASE_URL}/division.php?gid=${gid}&level_id=${levelId}`;
  console.log(`[division] GET ${url}`);
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const homeEids = [];
  const awayEids = [];

  // Game rows are in the schedule table — same structure as existing scraper
  $('#section-work table.divi-Sche-table tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 6) return;

    // Score cell (index 4): two <p> tags with scores; '-' means not played
    const scoreParas = $(cells[4]).find('p').toArray().map(p => $(p).text().trim());
    const hasScores = scoreParas.length >= 2 && scoreParas[0] !== '-' && scoreParas[1] !== '-';
    if (!hasScores) return; // upcoming or postponed

    // Game eid link in cell 5
    const gameLink = $(cells[5]).find('a[href*="eid="]').first();
    if (!gameLink.length) return; // no real eid
    const eidMatch = gameLink.attr('href')?.match(/eid=(\d+)/);
    if (!eidMatch) return;
    const eid = parseInt(eidMatch[1]);

    // Team links in cell 3
    const teamLinks = $(cells[3]).find('a[href*="tid="]');
    if (teamLinks.length < 2) return;
    const t1 = parseInt($(teamLinks[0]).attr('href')?.match(/tid=(\d+)/)?.[1] || '0');
    const t2 = parseInt($(teamLinks[1]).attr('href')?.match(/tid=(\d+)/)?.[1] || '0');

    // Collect eid if either target team played in this game
    if (t1 === homeTid || t2 === homeTid) homeEids.push(eid);
    if (t1 === awayTid || t2 === awayTid) awayEids.push(eid);
  });

  console.log(`[division] Found ${homeEids.length} completed game(s) for home team (tid=${homeTid})`);
  console.log(`[division] Found ${awayEids.length} completed game(s) for away team (tid=${awayTid})`);

  return { homeEids, awayEids };
}
```

- [ ] **Step 2: Manual smoke test — add temporary call**

```js
// Temporary — remove after test
import { scrapeEventMeta } from './event-scraper.js';
const meta = await scrapeEventMeta(19487);
const eids = await findCompletedGameEids(meta.gid, meta.levelId, meta.home.tid, meta.away.tid);
console.log(JSON.stringify(eids, null, 2));
```

Run:

```bash
node packages/ai-analysis/division-finder.js
```

Expected: two arrays of eids. If both arrays are empty, the game may be the first of the season — confirm by visiting `division.php?gid=211&level_id=1157` manually.

- [ ] **Step 3: Remove temporary test block**

- [ ] **Step 4: Commit**

```bash
git add packages/ai-analysis/division-finder.js
git commit -m "feat(ai-analysis): findCompletedGameEids — discover season games from division page"
```

---

## Task 4: Event scraper — game stats extraction

Adds `scrapeEventStats` to the existing `event-scraper.js`. Parses the player stat table to produce structured per-game stats.

**Files:**

- Modify: `packages/ai-analysis/event-scraper.js`

- [ ] **Step 1: Add scrapeEventStats to event-scraper.js**

Add after the existing `scrapeEventMeta` export:

```js
/**
 * Scrape stats from a completed game event page.
 *
 * The page has two player stat tables (home team then away team).
 * Each table's last row is the team totals. Column order:
 *   0: player  1: points  2: 2FGM  3: 2FGA  4: 2FG%  5: 3FGM  6: 3FGA
 *   7: 3FG%   8: FTM     9: FTA  10: FT%  11: offReb 12: defReb
 *  13: totalReb  14: assists  15: steals  16: blocks  17: turnovers
 *  18: fouls  19: eff  20: +/-  21: time
 *
 * @param {number} eid - event page ID of the completed game
 * @returns {RawGameStats | null} null if page can't be parsed
 */
export async function scrapeEventStats(eid) {
  const url = `${BASE_URL}/event.php?eid=${eid}`;
  console.log(`[stats] GET ${url}`);
  let html;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    console.warn(`[stats] WARNING: could not fetch eid=${eid}: ${err.message}`);
    return null;
  }
  const $ = cheerio.load(html);

  // Identify the two team tids (home first, away second) from team links
  const teamTids = [];
  $('a[href*="team.php"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const tidMatch = href.match(/tid=(\d+)/);
    if (tidMatch) {
      const tid = parseInt(tidMatch[1]);
      if (!teamTids.includes(tid)) teamTids.push(tid);
    }
  });

  // Parse quarter scores from the first table (EVENT/TEAM/Q1/Q2/Q3/Q4/Total)
  let homeQuarters = null;
  let awayQuarters = null;
  $('table').first().find('tr').each((i, row) => {
    if (i === 0) return; // header
    const cells = $(row).find('td');
    if (cells.length < 5) return;
    const quarters = [1, 2, 3, 4].map(q => parseInt($(cells[q]).text().trim()) || 0);
    if (i === 1) homeQuarters = quarters;
    if (i === 2) awayQuarters = quarters;
  });

  // Parse player stat tables — find tables that have "得分" in headers
  const teamStatsBlocks = [];
  $('table').each((_, table) => {
    const headerText = $(table).find('th').map((_, th) => $(th).text().trim()).get().join(' ');
    if (!headerText.includes('得分')) return;

    const rows = $(table).find('tbody tr').toArray();
    if (rows.length === 0) return;

    // Last row = team totals
    const totalsRow = rows[rows.length - 1];
    const tc = $(totalsRow).find('td');

    const parseN = (el) => { const n = parseFloat($(el).text().trim()); return isNaN(n) ? 0 : n; };

    const twoFGM = parseN(tc[2]);
    const twoFGA = parseN(tc[3]);
    const threeFGM = parseN(tc[5]);
    const threeFGA = parseN(tc[6]);
    const ftm = parseN(tc[8]);
    const fta = parseN(tc[9]);

    const teamStats = {
      points: parseN(tc[1]),
      twoFGM, twoFGA,
      threeFGM, threeFGA,
      ftm, fta,
      fgPct: twoFGA > 0 ? twoFGM / twoFGA : null,
      threePct: threeFGA > 0 ? threeFGM / threeFGA : null,
      ftPct: fta > 0 ? ftm / fta : null,
      offRebounds: parseN(tc[11]),
      defRebounds: parseN(tc[12]),
      rebounds: parseN(tc[13]),
      assists: parseN(tc[14]),
      steals: parseN(tc[15]),
      blocks: parseN(tc[16]),
      turnovers: parseN(tc[17]),
      fouls: parseN(tc[18]),
    };

    // Player rows — skip totals and rows without player links
    const players = rows.slice(0, -1).flatMap(row => {
      const cells = $(row).find('td');
      const playerLink = $(cells[0]).find('a');
      if (!playerLink.length) return [];
      const name = playerLink.text().trim();
      if (!name) return [];
      return [{
        name,
        points: parseN(cells[1]),
        rebounds: parseN(cells[13]),
        assists: parseN(cells[14]),
        steals: parseN(cells[15]),
        turnovers: parseN(cells[17]),
      }];
    });

    teamStatsBlocks.push({ teamStats, players });
  });

  if (teamStatsBlocks.length < 2) {
    console.warn(`[stats] WARNING: eid=${eid} has fewer than 2 stat tables — skipping`);
    return null;
  }

  const homeBlock = teamStatsBlocks[0];
  const awayBlock = teamStatsBlocks[1];

  homeBlock.teamStats.quarterScores = homeQuarters;
  awayBlock.teamStats.quarterScores = awayQuarters;

  const homePoints = homeBlock.teamStats.points;
  const awayPoints = awayBlock.teamStats.points;

  return {
    eid,
    homeTid: teamTids[0] ?? null,
    awayTid: teamTids[1] ?? null,
    homeStats: homeBlock.teamStats,
    homePlayers: homeBlock.players,
    awayStats: awayBlock.teamStats,
    awayPlayers: awayBlock.players,
    homeScore: homePoints,
    awayScore: awayPoints,
  };
}
```

- [ ] **Step 2: Manual smoke test**

Add temporarily at the bottom of the file:

```js
// Temporary — remove after test
const stats = await scrapeEventStats(19487);
console.log(JSON.stringify(stats, null, 2));
```

Run:

```bash
node packages/ai-analysis/event-scraper.js
```

Expected: JSON with `homeStats`, `awayStats`, `homePlayers`, `awayPlayers`. Check that `points`, `rebounds`, `assists` have reasonable numbers (not 0 or NaN everywhere).

- [ ] **Step 3: Remove temporary test block**

- [ ] **Step 4: Commit**

```bash
git add packages/ai-analysis/event-scraper.js
git commit -m "feat(ai-analysis): scrapeEventStats — parse player and team stats from completed game"
```

---

## Task 5: Stats aggregator

Pure function — takes raw scraped game arrays and returns the `MatchupData` structure.

**Files:**

- Create: `packages/ai-analysis/stats-aggregator.js`
- Create: `packages/ai-analysis/test/stats-aggregator.test.js`

- [ ] **Step 1: Write failing tests**

Create `packages/ai-analysis/test/stats-aggregator.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMatchupData } from '../stats-aggregator.js';

const meta = {
  gameId: 99,
  home: { tid: 1, name: "Alpha" },
  away: { tid: 2, name: "Beta" },
};

const makeRawGame = (eid, homeTid, awayTid, homeScore, awayScore) => ({
  eid,
  homeTid, awayTid,
  homeScore, awayScore,
  homeStats: {
    points: homeScore, twoFGM: 10, twoFGA: 20, threeFGM: 2, threeFGA: 6,
    ftm: 4, fta: 5, fgPct: 0.50, threePct: 0.33, ftPct: 0.80,
    offRebounds: 5, defRebounds: 20, rebounds: 25, assists: 8,
    steals: 3, blocks: 1, turnovers: 5, fouls: 10,
    quarterScores: [10, 12, 8, homeScore - 30],
  },
  homePlayers: [{ name: "Alice", points: 20, rebounds: 8, assists: 3, steals: 1, turnovers: 2 }],
  awayStats: {
    points: awayScore, twoFGM: 8, twoFGA: 18, threeFGM: 3, threeFGA: 9,
    ftm: 2, fta: 4, fgPct: 0.44, threePct: 0.33, ftPct: 0.50,
    offRebounds: 4, defRebounds: 18, rebounds: 22, assists: 6,
    steals: 2, blocks: 0, turnovers: 7, fouls: 12,
    quarterScores: [8, 10, 10, awayScore - 28],
  },
  awayPlayers: [{ name: "Bob", points: 18, rebounds: 7, assists: 2, steals: 2, turnovers: 3 }],
});

describe('buildMatchupData', () => {
  it('returns correct matchup metadata', () => {
    const result = buildMatchupData(meta, [], []);
    assert.deepEqual(result.matchup, {
      gameId: 99,
      home: { tid: 1, name: "Alpha" },
      away: { tid: 2, name: "Beta" },
    });
  });

  it('maps home team wins correctly when home team won', () => {
    // Alpha (tid=1) played as home, won 50-40
    const rawGame = makeRawGame(100, 1, 2, 50, 40);
    const result = buildMatchupData(meta, [rawGame], []);
    assert.equal(result.homeTeamGames[0].result, 'win');
  });

  it('maps home team loss correctly when home team played as away and lost', () => {
    // Alpha (tid=1) played as away (awayTid=1), lost 30-50
    const rawGame = makeRawGame(101, 2, 1, 50, 30);
    const result = buildMatchupData(meta, [rawGame], []);
    assert.equal(result.homeTeamGames[0].result, 'loss');
  });

  it('includes topPlayers sorted by points descending', () => {
    const rawGame = makeRawGame(100, 1, 2, 50, 40);
    rawGame.homePlayers = [
      { name: "Alice", points: 20, rebounds: 8, assists: 3, steals: 1, turnovers: 2 },
      { name: "Bob", points: 30, rebounds: 4, assists: 1, steals: 0, turnovers: 1 },
    ];
    const result = buildMatchupData(meta, [rawGame], []);
    assert.equal(result.homeTeamGames[0].topPlayers[0].name, 'Bob');
  });

  it('returns empty arrays when no games provided', () => {
    const result = buildMatchupData(meta, [], []);
    assert.deepEqual(result.homeTeamGames, []);
    assert.deepEqual(result.awayTeamGames, []);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd packages/ai-analysis && npm test
```

Expected: `Error: Cannot find module '../stats-aggregator.js'`

- [ ] **Step 3: Create stats-aggregator.js**

```js
/**
 * Convert a Unix timestamp (seconds) or date-like value to YYYY-MM-DD string.
 * The event scraper doesn't return a date field from the event page, so we use
 * a placeholder — the division-finder can be enhanced to pass dates later.
 */
function toDateStr(val) {
  if (!val) return null;
  const d = typeof val === 'number' ? new Date(val * 1000) : new Date(val);
  return d.toISOString().slice(0, 10);
}

/**
 * Given a raw game and the perspective team's tid, determine win/loss/null.
 */
function getResult(rawGame, teamTid) {
  const isHome = rawGame.homeTid === teamTid;
  const homeWon = rawGame.homeScore > rawGame.awayScore;
  if (rawGame.homeScore === null || rawGame.awayScore === null) return null;
  if (isHome) return homeWon ? 'win' : 'loss';
  return homeWon ? 'loss' : 'win';
}

/**
 * Given a raw game and the perspective team's tid, return that team's stats block.
 */
function getTeamStats(rawGame, teamTid) {
  const isHome = rawGame.homeTid === teamTid;
  return {
    stats: isHome ? rawGame.homeStats : rawGame.awayStats,
    players: isHome ? rawGame.homePlayers : rawGame.awayPlayers,
    opponentTid: isHome ? rawGame.awayTid : rawGame.homeTid,
  };
}

/**
 * Convert a raw scraped game into a normalized game entry from a team's perspective.
 *
 * @param {object} rawGame - RawGameStats from scrapeEventStats
 * @param {number} teamTid - The perspective team
 * @param {string} opponentName - Display name of the opponent (pass "" if unknown)
 * @returns {object} normalized game entry
 */
function normalizeGame(rawGame, teamTid, opponentName) {
  const { stats, players } = getTeamStats(rawGame, teamTid);
  const topPlayers = [...players]
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    .slice(0, 5);

  return {
    gameId: rawGame.eid,
    date: null,       // event page doesn't expose date; can be enhanced later
    opponent: opponentName,
    result: getResult(rawGame, teamTid),
    teamStats: {
      points: stats.points,
      fgPct: stats.fgPct,
      threePct: stats.threePct,
      ftPct: stats.ftPct,
      offRebounds: stats.offRebounds,
      defRebounds: stats.defRebounds,
      rebounds: stats.rebounds,
      assists: stats.assists,
      steals: stats.steals,
      blocks: stats.blocks,
      turnovers: stats.turnovers,
      quarterScores: stats.quarterScores,
    },
    topPlayers,
  };
}

/**
 * Build the universal MatchupData from scrape results.
 *
 * @param {{ gameId, home: {tid, name}, away: {tid, name} }} meta
 * @param {object[]} homeRawGames - RawGameStats[] for home team's completed games
 * @param {object[]} awayRawGames - RawGameStats[] for away team's completed games
 * @returns {MatchupData}
 */
export function buildMatchupData(meta, homeRawGames, awayRawGames) {
  const homeTeamGames = homeRawGames.map(g => {
    const opponentTid = g.homeTid === meta.home.tid ? g.awayTid : g.homeTid;
    const opponentName = opponentTid === meta.away.tid ? meta.away.name : String(opponentTid);
    return normalizeGame(g, meta.home.tid, opponentName);
  });

  const awayTeamGames = awayRawGames.map(g => {
    const opponentTid = g.homeTid === meta.away.tid ? g.awayTid : g.homeTid;
    const opponentName = opponentTid === meta.home.tid ? meta.home.name : String(opponentTid);
    return normalizeGame(g, meta.away.tid, opponentName);
  });

  return {
    matchup: {
      gameId: meta.gameId,
      home: meta.home,
      away: meta.away,
    },
    homeTeamGames,
    awayTeamGames,
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd packages/ai-analysis && npm test
```

Expected:
```
✓ returns correct matchup metadata
✓ maps home team wins correctly when home team won
✓ maps home team loss correctly when home team played as away and lost
✓ includes topPlayers sorted by points descending
✓ returns empty arrays when no games provided
```

- [ ] **Step 5: Commit**

```bash
git add packages/ai-analysis/stats-aggregator.js packages/ai-analysis/test/
git commit -m "feat(ai-analysis): buildMatchupData — normalize raw game stats into MatchupData"
```

---

## Task 6: Prompt builder

Pure function. Structures the analysis request for the AI. Easily editable without touching other files.

**Files:**

- Create: `packages/ai-analysis/prompt.js`
- Create: `packages/ai-analysis/test/prompt.test.js`

- [ ] **Step 1: Write failing tests**

Create `packages/ai-analysis/test/prompt.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../prompt.js';

const sampleMatchup = {
  matchup: { gameId: 99, home: { tid: 1, name: "Alpha" }, away: { tid: 2, name: "Beta" } },
  homeTeamGames: [
    {
      gameId: 100, date: null, opponent: "Beta", result: "win",
      teamStats: { points: 60, fgPct: 0.50, threePct: 0.33, ftPct: 0.80,
        rebounds: 30, assists: 10, steals: 5, turnovers: 8, quarterScores: [15,15,15,15] },
      topPlayers: [{ name: "Alice", points: 20, rebounds: 8, assists: 3, steals: 1, turnovers: 2 }],
    },
  ],
  awayTeamGames: [],
};

describe('buildPrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = buildPrompt(sampleMatchup, 'home');
    assert.ok(typeof prompt === 'string' && prompt.length > 50);
  });

  it('home perspective includes home team name as "我方"', () => {
    const prompt = buildPrompt(sampleMatchup, 'home');
    assert.ok(prompt.includes('Alpha'));
  });

  it('away perspective includes away team name as "我方"', () => {
    const prompt = buildPrompt(sampleMatchup, 'away');
    assert.ok(prompt.includes('Beta'));
  });

  it('includes game data in JSON form', () => {
    const prompt = buildPrompt(sampleMatchup, 'home');
    assert.ok(prompt.includes('"fgPct"') || prompt.includes('fgPct'));
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd packages/ai-analysis && npm test
```

Expected: `Error: Cannot find module '../prompt.js'`

- [ ] **Step 3: Create prompt.js**

```js
/**
 * Build the AI analysis prompt for a given perspective.
 *
 * Edit this file freely to tune the analysis output.
 * The function signature and return type must stay the same.
 *
 * @param {MatchupData} matchupData
 * @param {'home' | 'away'} perspective - which team is "我方"
 * @returns {string} prompt text
 */
export function buildPrompt(matchupData, perspective) {
  const isHome = perspective === 'home';
  const myTeam = isHome ? matchupData.matchup.home : matchupData.matchup.away;
  const opponentTeam = isHome ? matchupData.matchup.away : matchupData.matchup.home;
  const opponentGames = isHome ? matchupData.awayTeamGames : matchupData.homeTeamGames;
  const myGames = isHome ? matchupData.homeTeamGames : matchupData.awayTeamGames;

  const wins = opponentGames.filter(g => g.result === 'win').length;
  const losses = opponentGames.filter(g => g.result === 'loss').length;

  // ── Adjustable section ───────────────────────────────────────────────────
  // Change the persona, the analysis depth, the output format, or the
  // language here without touching any other file.
  return `你是一位資深籃球戰術分析師，擅長從統計數據中提煉出具體可執行的賽前建議。

## 本場賽事
我方球隊：${myTeam.name}
對手球隊：${opponentTeam.name}

## 對手本季數據（${opponentGames.length} 場已完賽）
戰績：${wins} 勝 ${losses} 負

${opponentGames.length === 0 ? '（本季尚無完賽數據）' : opponentGames.map((g, i) => `
### 第 ${i + 1} 場 vs ${g.opponent ?? '未知'} — ${g.result === 'win' ? '勝' : g.result === 'loss' ? '負' : '?'}
得分：${g.teamStats.points ?? '?'}
投籃命中率：${g.teamStats.fgPct != null ? (g.teamStats.fgPct * 100).toFixed(1) + '%' : '?'}
三分命中率：${g.teamStats.threePct != null ? (g.teamStats.threePct * 100).toFixed(1) + '%' : '?'}
罰球命中率：${g.teamStats.ftPct != null ? (g.teamStats.ftPct * 100).toFixed(1) + '%' : '?'}
籃板：${g.teamStats.rebounds ?? '?'} | 助攻：${g.teamStats.assists ?? '?'} | 抄截：${g.teamStats.steals ?? '?'} | 失誤：${g.teamStats.turnovers ?? '?'}
各節得分：${g.teamStats.quarterScores ? g.teamStats.quarterScores.join(' / ') : '?'}
主要球員：${g.topPlayers.slice(0, 3).map(p => `${p.name} ${p.points}分/${p.rebounds}板/${p.assists}助`).join('、') || '無數據'}
`).join('')}

## 我方本季參考（${myGames.length} 場）
${myGames.length === 0 ? '（尚無數據）' : `最近 ${Math.min(myGames.length, 3)} 場平均得分：${(myGames.slice(-3).reduce((s, g) => s + (g.teamStats.points ?? 0), 0) / Math.min(myGames.length, 3)).toFixed(0)} 分`}

## 請根據以上對手數據，提供以下三個部分的分析：

### 一、對手整體打球風格
（100字以內，描述對手的進攻風格、防守特點、比賽節奏）

### 二、具體戰術建議
（針對對手弱點，提供三項具體可執行的戰術建議，每項 50 字以內）

1.
2.
3.

### 三、關鍵球員警示
（列出 1–3 位需要重點防守的對手球員，說明原因）
`;
  // ── End adjustable section ───────────────────────────────────────────────
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd packages/ai-analysis && npm test
```

Expected: all 4 prompt tests + all 5 stats-aggregator tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ai-analysis/prompt.js packages/ai-analysis/test/prompt.test.js
git commit -m "feat(ai-analysis): buildPrompt — structured analysis prompt with adjustable template"
```

---

## Task 7: AI providers

Two adapters implementing the same `generate(prompt): Promise<string>` interface.

**Files:**

- Create: `packages/ai-analysis/providers/anthropic.js`
- Create: `packages/ai-analysis/providers/openai.js`

- [ ] **Step 1: Create providers/anthropic.js**

```js
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.MODEL || 'claude-sonnet-4-6';

/**
 * Generate analysis text using Anthropic Claude.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export async function generate(prompt) {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].type === 'text' ? msg.content[0].text : '';
}
```

- [ ] **Step 2: Create providers/openai.js**

```js
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.MODEL || 'gpt-4o';

/**
 * Generate analysis text using OpenAI.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export async function generate(prompt) {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.choices[0]?.message?.content ?? '';
}
```

- [ ] **Step 3: Manual smoke test (requires valid API key)**

Set up a `.env` file from `.env.example` and run:

```bash
cd packages/ai-analysis
cp .env.example .env
# Edit .env: set AI_PROVIDER and the correct API key
node -e "
import('./providers/anthropic.js').then(m => m.generate('Say hello in one sentence.')).then(console.log)
"
```

Expected: a one-sentence greeting from Claude. If you get an auth error, check `ANTHROPIC_API_KEY` in `.env`.

- [ ] **Step 4: Commit**

```bash
git add packages/ai-analysis/providers/
git commit -m "feat(ai-analysis): anthropic and openai provider adapters"
```

---

## Task 8: AI client — provider dispatcher

Reads `AI_PROVIDER` and loads the correct adapter.

**Files:**

- Create: `packages/ai-analysis/ai-client.js`

- [ ] **Step 1: Create ai-client.js**

```js
const provider = process.env.AI_PROVIDER || 'anthropic';

const supported = ['anthropic', 'openai'];
if (!supported.includes(provider)) {
  throw new Error(`Unsupported AI_PROVIDER="${provider}". Choose: ${supported.join(', ')}`);
}

// Dynamic import so only the chosen SDK is loaded
const { generate } = await import(`./providers/${provider}.js`);

export { generate };
```

- [ ] **Step 2: Manual test**

```bash
# With anthropic configured in .env
node -e "import('./ai-client.js').then(m => m.generate('Say hi in one word.')).then(console.log)"
```

Expected: a one-word greeting. No import errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ai-analysis/ai-client.js
git commit -m "feat(ai-analysis): ai-client dispatcher — select provider via AI_PROVIDER env var"
```

---

## Task 9: Main orchestrator

Wires all modules together in `index.js`. Outputs analysis to terminal and writes `analysis_output.json`.

**Files:**

- Modify: `packages/ai-analysis/index.js`

- [ ] **Step 1: Replace index.js with full orchestration**

```js
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { scrapeEventMeta, scrapeEventStats, sleep } from './event-scraper.js';
import { findCompletedGameEids } from './division-finder.js';
import { buildMatchupData } from './stats-aggregator.js';
import { buildPrompt } from './prompt.js';
import { generate } from './ai-client.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (const arg of args) {
    const [key, val] = arg.replace(/^--/, '').split('=');
    params[key] = val;
  }
  if (!params.game_id) {
    console.error('Usage: node index.js --game_id=<eid>');
    process.exit(1);
  }
  return { gameId: parseInt(params.game_id) };
}

async function scrapeTeamGames(eids, label) {
  const results = [];
  for (let i = 0; i < eids.length; i++) {
    const eid = eids[i];
    console.log(`[${label}] Scraping game ${i + 1}/${eids.length} (eid=${eid})`);
    const stats = await scrapeEventStats(eid);
    if (stats) results.push(stats);
    if (i < eids.length - 1) await sleep(1000);
  }
  return results;
}

async function main() {
  const { gameId } = parseArgs();
  console.log(`\n[ai-analysis] Analyzing game ${gameId}\n`);

  // Step 1: Identify teams and division from the target game's event page
  console.log('Step 1/5: Looking up game metadata...');
  const meta = await scrapeEventMeta(gameId);
  console.log(`  Home: ${meta.home.name} (tid=${meta.home.tid})`);
  console.log(`  Away: ${meta.away.name} (tid=${meta.away.tid})`);
  console.log(`  Division: gid=${meta.gid}, level_id=${meta.levelId}\n`);

  // Step 2: Find completed game eids for each team
  console.log('Step 2/5: Finding completed games this season...');
  await sleep(1000);
  const { homeEids, awayEids } = await findCompletedGameEids(
    meta.gid, meta.levelId, meta.home.tid, meta.away.tid
  );

  if (homeEids.length === 0 && awayEids.length === 0) {
    console.error('\nNo completed games found for either team. Cannot generate analysis.');
    process.exit(1);
  }
  console.log();

  // Step 3: Scrape stats for each team's completed games
  console.log('Step 3/5: Scraping completed game stats...');
  await sleep(1000);
  const homeRawGames = await scrapeTeamGames(homeEids, meta.home.name);
  const awayRawGames = await scrapeTeamGames(awayEids, meta.away.name);
  console.log();

  // Step 4: Normalize into MatchupData
  console.log('Step 4/5: Aggregating stats...');
  const matchupData = buildMatchupData(meta, homeRawGames, awayRawGames);
  console.log(`  Home team: ${matchupData.homeTeamGames.length} game(s) aggregated`);
  console.log(`  Away team: ${matchupData.awayTeamGames.length} game(s) aggregated\n`);

  // Step 5: Generate AI analysis for both perspectives
  console.log('Step 5/5: Generating AI analysis...');
  const provider = process.env.AI_PROVIDER || 'anthropic';
  console.log(`  Using provider: ${provider}`);

  const homePrompt = buildPrompt(matchupData, 'home');
  console.log(`  Generating analysis for ${meta.home.name} perspective...`);
  const homePerspective = await generate(homePrompt);

  await sleep(500);

  const awayPrompt = buildPrompt(matchupData, 'away');
  console.log(`  Generating analysis for ${meta.away.name} perspective...`);
  const awayPerspective = await generate(awayPrompt);

  // Output to terminal
  const separator = '═'.repeat(60);
  console.log(`\n${separator}`);
  console.log(`  主隊視角：${meta.home.name} 對陣 ${meta.away.name}`);
  console.log(separator);
  console.log(homePerspective);

  console.log(`\n${separator}`);
  console.log(`  客隊視角：${meta.away.name} 對陣 ${meta.home.name}`);
  console.log(separator);
  console.log(awayPerspective);

  // Write JSON output
  const output = {
    game_id: gameId,
    generated_at: new Date().toISOString(),
    home: meta.home,
    away: meta.away,
    home_games_analyzed: matchupData.homeTeamGames.length,
    away_games_analyzed: matchupData.awayTeamGames.length,
    home_perspective: homePerspective,
    away_perspective: awayPerspective,
  };

  const outPath = new URL('./analysis_output.json', import.meta.url).pathname;
  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n[ai-analysis] Output written to ${outPath}`);
}

main().catch(err => {
  console.error('[ai-analysis] Fatal:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: End-to-end test with a real game**

Ensure `.env` has valid `AI_PROVIDER` and API key set. Run:

```bash
node packages/ai-analysis/index.js --game_id=19487
```

Watch the output progress through all 5 steps. Expected final output:
- Two analysis sections in the terminal (主隊視角 and 客隊視角)
- `packages/ai-analysis/analysis_output.json` created with both reports

If Step 1 fails: check that game 19487 is accessible and has team links.
If Step 2 returns 0 eids for both teams: the division page may use different selectors — inspect `division.php?gid=211&level_id=1157` manually.
If Step 5 fails with auth error: verify API key in `.env`.

- [ ] **Step 3: Run unit tests to confirm nothing broke**

```bash
cd packages/ai-analysis && npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/ai-analysis/index.js
git commit -m "feat(ai-analysis): orchestrate full pipeline — scrape, aggregate, generate, output"
```

---

## Task 10: GitHub Actions workflow

Enables manual `workflow_dispatch` trigger from the GitHub UI.

**Files:**

- Create: `.github/workflows/ai-analysis.yml`

- [ ] **Step 1: Create workflow file**

```yaml
name: AI Matchup Analysis

on:
  workflow_dispatch:
    inputs:
      game_id:
        description: 'TGB game ID (eid) of the target match'
        required: true
        type: string
      ai_provider:
        description: 'AI provider to use'
        required: false
        default: 'anthropic'
        type: choice
        options:
          - anthropic
          - openai

jobs:
  analyze:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: packages/ai-analysis

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Run AI analysis
        run: node index.js --game_id=${{ inputs.game_id }}
        env:
          AI_PROVIDER: ${{ inputs.ai_provider }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          MODEL: ${{ secrets.AI_MODEL }}

      - name: Upload analysis output
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: analysis-${{ inputs.game_id }}
          path: packages/ai-analysis/analysis_output.json
          if-no-files-found: warn
```

- [ ] **Step 2: Configure repo secrets**

In GitHub → repo Settings → Secrets and variables → Actions, add:

- `ANTHROPIC_API_KEY` — your Anthropic API key (if using anthropic provider)
- `OPENAI_API_KEY` — your OpenAI API key (if using openai provider)
- `AI_MODEL` — optional model override (e.g., `claude-sonnet-4-6` or `gpt-4o`); leave blank to use defaults

- [ ] **Step 3: Commit workflow**

```bash
git add .github/workflows/ai-analysis.yml
git commit -m "feat(ai-analysis): GitHub Actions manual dispatch workflow"
```

- [ ] **Step 4: Trigger from GitHub UI**

1. Go to repo → Actions tab → "AI Matchup Analysis" workflow
2. Click "Run workflow"
3. Enter a `game_id` (e.g., `19487`) and choose provider
4. Click "Run workflow"
5. Wait for completion, then download the `analysis-19487` artifact to review output

Expected: workflow completes successfully, artifact contains both analysis reports.

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| 獨立 CLI 腳本（本地執行）| Task 1, 9 |
| GitHub Actions workflow_dispatch | Task 10 |
| 爬取對手本季已完賽比賽 event 頁面 | Task 2, 3, 4 |
| 呼叫 AI 生成分析 | Task 7, 8, 9 |
| 輸出至終端機 + analysis_output.json | Task 9 |
| 兩份報告（主隊視角 + 客隊視角）| Task 6, 9 |
| AI provider 可切換（Anthropic/OpenAI）| Task 7, 8, 9 |
| prompt 易調整 | Task 6 (`prompt.js` is standalone) |
| 輸入只需 game_id | Task 1, 2, 3 |
| 不動現有任何程式碼 | All tasks create new files only |

**No spec gaps found.**

**Type consistency check:**

- `scrapeEventMeta` returns `{ gameId, home: {tid, name}, away: {tid, name}, gid, levelId }` — consumed by `findCompletedGameEids(gid, levelId, homeTid, awayTid)` ✓
- `scrapeEventStats` returns `{ eid, homeTid, awayTid, homeStats, homePlayers, awayStats, awayPlayers, homeScore, awayScore }` — consumed by `buildMatchupData` via `getTeamStats` and `getResult` ✓
- `buildMatchupData` returns `MatchupData` with `matchup`, `homeTeamGames`, `awayTeamGames` — consumed by `buildPrompt` ✓
- `buildPrompt` returns `string` — consumed by `generate` ✓
- `generate` returns `Promise<string>` — consumed by `main` in index.js ✓
