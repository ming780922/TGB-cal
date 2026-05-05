# TGB 籃球聯盟賽程訂閱網站

## 專案概覽

為 TGB 籃球聯盟（tgbleague.com）建立賽程 iCal 訂閱服務，讓使用者可以訂閱球隊賽程到 Apple / Google 行事曆。網站部署在 Cloudflare，支援中英雙語，並針對球隊名稱進行 SEO。

## 技術棧

- **前端/後端**: Next.js（部署於 Cloudflare Pages + Workers）
- **資料庫**: Cloudflare D1（SQLite）
- **iCal feed**: Cloudflare Worker
- **爬蟲**: GitHub Actions（Node.js）
- **網域**: tgb.ming060.com

---

## 目錄結構

```
tgb-calendar/
├── apps/
│   ├── web/                        # Next.js 前端
│   └── worker/                     # Cloudflare Worker（iCal feed）
├── packages/
│   └── scraper/                    # 爬蟲邏輯
├── db/
│   └── migrations/
│       └── 001_initial_schema.sql  # D1 schema
└── .github/
    └── workflows/
        ├── scrape.yml
        └── deploy.yml
```

---

## 資料庫 Schema（Cloudflare D1）

```sql
-- leagues：TGB 聯盟系列（gid）
CREATE TABLE leagues (
  gid          INTEGER PRIMARY KEY,
  name         TEXT    NOT NULL,
  venue_area   TEXT,
  day_of_week  TEXT,
  gender       TEXT,
  league_type  TEXT NOT NULL DEFAULT 'regular'
               CHECK (league_type IN ('regular', 'cup', 'special')),
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- divisions：特定賽季的特定分組（level_id）
CREATE TABLE divisions (
  level_id        INTEGER PRIMARY KEY,
  gid             INTEGER NOT NULL,
  season_label    TEXT    NOT NULL,
  division_label  TEXT,
  full_title      TEXT    NOT NULL,
  first_game_at   INTEGER,
  last_game_at    INTEGER,
  team_count      INTEGER NOT NULL DEFAULT 0,
  last_scraped_at INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (gid) REFERENCES leagues(gid)
);

-- teams：球隊（tid，跨賽季穩定）
CREATE TABLE teams (
  tid                   INTEGER PRIMARY KEY,
  name                  TEXT    NOT NULL,
  name_normalized       TEXT    NOT NULL,
  last_game_at          INTEGER,
  active_division_count INTEGER NOT NULL DEFAULT 0,
  created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at            INTEGER NOT NULL DEFAULT (unixepoch())
);

-- FTS5 全文搜尋
CREATE VIRTUAL TABLE teams_fts USING fts5(
  name,
  content='teams',
  content_rowid='tid',
  tokenize='unicode61'
);

-- team_divisions：球隊 × 分組關係，含積分
CREATE TABLE team_divisions (
  tid        INTEGER NOT NULL,
  level_id   INTEGER NOT NULL,
  wins       INTEGER NOT NULL DEFAULT 0,
  losses     INTEGER NOT NULL DEFAULT 0,
  draws      INTEGER NOT NULL DEFAULT 0,
  rank       INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (tid, level_id),
  FOREIGN KEY (tid)      REFERENCES teams(tid)          ON DELETE CASCADE,
  FOREIGN KEY (level_id) REFERENCES divisions(level_id) ON DELETE CASCADE
);

-- games：比賽場次
CREATE TABLE games (
  game_id            INTEGER PRIMARY KEY,
  level_id           INTEGER NOT NULL,
  home_tid           INTEGER,
  away_tid           INTEGER,
  scheduled_at       INTEGER NOT NULL,
  scheduled_at_local TEXT    NOT NULL,
  venue              TEXT,
  home_score         INTEGER,
  away_score         INTEGER,
  status             TEXT NOT NULL DEFAULT 'scheduled'
                     CHECK (status IN ('scheduled','completed','postponed','cancelled')),
  ical_uid           TEXT    NOT NULL UNIQUE,
  ical_sequence      INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (level_id) REFERENCES divisions(level_id) ON DELETE CASCADE,
  FOREIGN KEY (home_tid) REFERENCES teams(tid),
  FOREIGN KEY (away_tid) REFERENCES teams(tid)
);

-- team_feed_meta：iCal HTTP 快取
CREATE TABLE team_feed_meta (
  tid              INTEGER PRIMARY KEY,
  last_modified_at INTEGER NOT NULL,
  game_count       INTEGER NOT NULL DEFAULT 0,
  etag             TEXT    NOT NULL,
  cached_ical      TEXT,
  generated_at     INTEGER,
  FOREIGN KEY (tid) REFERENCES teams(tid) ON DELETE CASCADE
);

-- scrape_runs：爬蟲執行摘要 log
CREATE TABLE scrape_runs (
  run_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type   TEXT    NOT NULL
                CHECK (target_type IN ('homepage','division','game')),
  target_key    TEXT,
  started_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at   INTEGER,
  status        TEXT    NOT NULL
                CHECK (status IN ('running','success','failed','partial')),
  error_message TEXT,
  rows_inserted INTEGER NOT NULL DEFAULT 0,
  rows_updated  INTEGER NOT NULL DEFAULT 0
);
```

---

## 爬蟲邏輯（packages/scraper）

### 資料來源

- **TGB 首頁**: `https://tgbleague.com` — 取得所有 `gid+level_id`
- **分組頁面**: `https://tgbleague.com/division.php?gid={gid}&level_id={level_id}` — 取得球隊清單與賽程

### 執行步驟

1. 爬 TGB 首頁，解析導覽列取得所有 `gid+level_id` 組合
2. 對比 D1 `divisions` 表，找出需要爬取的分組：
   - 從未爬過（`last_scraped_at IS NULL`）
   - 有未來場次（`last_game_at > now()`）且距上次爬取超過設定時間
3. 爬各分組頁面，解析球隊清單與賽程資料
4. 寫入 D1（詳見更新邏輯）
5. 輸出 `new_teams` 數量給 GitHub Actions

### 賽程更新邏輯

```
爬到一筆 game 時：

game_id 不存在
└─→ INSERT，ical_sequence = 0

game_id 存在 且 scheduled_at > now()     ← 未來場次
└─→ 比對 scheduled_at / venue / home_tid / away_tid / status
    有差異 → UPDATE + ical_sequence + 1
    無差異 → 跳過

game_id 存在 且 scheduled_at <= now()    ← 已完賽
└─→ home_score IS NULL 且 爬到有比分
    是 → 只更新比分 + ical_sequence + 1
    否 → 跳過
```

### 寫入方式

爬蟲不直接寫 D1，改為呼叫 Cloudflare Worker 的受保護 API endpoint，由 Worker 執行寫入。API 以 `SCRAPER_API_KEY` environment variable 做 Bearer token 驗證。

---

## Cloudflare Worker（apps/worker）

### Endpoints

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/ical/[tid].ics` | 輸出 iCal feed |
| `POST` | `/api/scrape/upsert` | 爬蟲寫入資料（需 Bearer token） |

### iCal feed 規格

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ming060//TGB Calendar//ZH
X-WR-CALNAME:{球隊名稱} 賽程
X-WR-TIMEZONE:Asia/Taipei
BEGIN:VTIMEZONE ... END:VTIMEZONE

BEGIN:VEVENT
UID:game-{game_id}@tgb.ming060.com
SEQUENCE:{ical_sequence}
DTSTAMP:{now utc}
DTSTART;TZID=Asia/Taipei:{scheduled_at_local}
DTEND;TZID=Asia/Taipei:{scheduled_at_local + 1hr}
SUMMARY:{home_name} vs {away_name}                       ← 未完賽
SUMMARY:{home_name} {score} - {score} {away_name}        ← 已完賽
LOCATION:{完整地址} ({venue})
DESCRIPTION:{season} {division}\nhttps://tgbleague.com/division.php?gid={gid}&level_id={level_id}
URL:https://tgbleague.com/division.php?gid={gid}&level_id={level_id}
END:VEVENT

END:VCALENDAR
```

### HTTP 快取

- 支援 `If-None-Match` → 比對 `team_feed_meta.etag`，相符回 `304 Not Modified`
- 支援 `If-Modified-Since` → 比對 `team_feed_meta.last_modified_at`
- Response header 加上 `Cache-Control: public, max-age=3600`

### 場館地址對照表

Worker 內建靜態 map，短名稱對應完整地址：

```typescript
const VENUE_MAP: Record<string, string> = {
  '和平籃球館': '台北市大安區和平東路一段183號',
  '信義國中':   '台北市信義區基隆路一段95號',
  '板橋體育館': '新北市板橋區莊敬路62號',
  '中正體育館': '台北市中正區汀州路三段2號',
  '永和體育館': '新北市永和區永和路二段128號',
};
```

> **注意**：以上地址為參考值，實作前請到 Google 地圖逐一確認正確地址後填入。

---

## Next.js 前端（apps/web）

### 路由結構

```
/[locale]/                    首頁（搜尋球隊）
/[locale]/team/[tid]          球隊頁面
/[locale]/privacy             隱私權政策
/[locale]/terms               使用者條款
/sitemap.xml                  自動產生
```

locale 支援 `zh`（繁體中文）和 `en`（英文），使用 `next-intl`。

### 首頁功能

- 球隊名稱搜尋（打字即時搜尋，呼叫 `/api/teams/search?q=`）
- 熱門球隊快速連結

### 球隊頁面功能

- 球隊資訊：名稱、目前賽季、跨聯盟狀態
- 進行中賽季列表：聯盟名稱、分組、戰績、已排定場次數、下一場
- 若無進行中賽季：顯示上一個已結束賽季（灰色標示「已結束」）
- 訂閱區塊：
  - 「加入 Apple 行事曆」→ 導向 `webcal://tgb.ming060.com/ical/{tid}.ics`
  - 「加入 Google 日曆」→ 導向 `https://calendar.google.com/calendar/r/settings/addbyurl?url=https%3A%2F%2Ftgb.ming060.com%2Fical%2F{tid}.ics`
  - 「複製連結」→ 複製 `https://tgb.ming060.com/ical/{tid}.ics`

### SEO

- 每支球隊一個靜態頁面，`generateStaticParams` 在 build time 產生
- `<title>`: `{球隊名稱} 賽程 | TGB iCal 訂閱`
- `<meta name="description">`: 包含球隊名稱、目前賽季、聯盟名稱
- `hreflang` 標記中英文版本
- `sitemap.xml` 涵蓋所有 `/zh/team/[tid]` 與 `/en/team/[tid]`

### 靜態頁面內容重點

**使用者條款**（`/terms`）需包含：
- 本站資料來源為 TGB 官方網站
- 賽程如有異動，以 TGB 官方公告為準
- 因賽程資訊不準確導致的任何損失，本站不負責任
- 禁止商業用途

**隱私權政策**（`/privacy`）需包含：
- 本站不要求登入，不蒐集個人識別資料
- 使用 Cloudflare 服務，Cloudflare 可能記錄基本存取 log
- 連結至 Cloudflare 隱私權政策

---

## GitHub Actions

### scrape.yml

```yaml
on:
  schedule:
    - cron: '0 19 * * *'   # 台灣時間凌晨 03:00
  workflow_dispatch:

jobs:
  scrape:
    runs-on: ubuntu-latest
    outputs:
      new_teams: ${{ steps.scrape.outputs.new_teams }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - name: Run scraper
        id: scrape
        env:
          SCRAPER_API_KEY: ${{ secrets.SCRAPER_API_KEY }}
          WORKER_BASE_URL: https://tgb.ming060.com
        run: node packages/scraper/index.js

  trigger-deploy:
    needs: scrape
    if: needs.scrape.outputs.new_teams != '0'
    runs-on: ubuntu-latest
    steps:
      - name: Trigger deploy workflow
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.actions.createWorkflowDispatch({
              owner: context.repo.owner,
              repo: context.repo.repo,
              workflow_id: 'deploy.yml',
              ref: 'main'
            })
```

### deploy.yml

```yaml
on:
  push:
    branches:
      - main
  workflow_dispatch:
  workflow_call:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
        working-directory: apps/web
        env:
          CLOUDFLARE_D1_URL: ${{ secrets.CLOUDFLARE_D1_URL }}
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: pages deploy apps/web/.next --project-name=tgb-calendar
```

---

## Environment Variables

### Cloudflare Worker

| 變數 | 說明 |
|------|------|
| `SCRAPER_API_KEY` | 爬蟲呼叫 `/api/scrape/upsert` 的 Bearer token |
| `DB` | D1 binding（wrangler.toml 設定） |

### GitHub Actions Secrets

| 變數 | 說明 |
|------|------|
| `SCRAPER_API_KEY` | 同上，爬蟲用 |
| `CLOUDFLARE_API_TOKEN` | Cloudflare 部署用 |
| `WORKER_BASE_URL` | `https://tgb.ming060.com` |

---

## 實作順序建議

1. `db/migrations/001_initial_schema.sql` — 建立 D1 schema
2. `apps/worker` — iCal feed + scrape upsert API
3. `packages/scraper` — 爬蟲邏輯
4. `.github/workflows/scrape.yml` + `deploy.yml`
5. `apps/web` — Next.js 前端
6. DNS：Cloudflare 加 CNAME `tgb` → Cloudflare Pages