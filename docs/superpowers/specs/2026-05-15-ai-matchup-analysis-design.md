# Design: AI 對戰分析（測試版）

**Date**: 2026-05-15  
**Status**: Approved  
**Feature**: 賽前 AI 對戰建議，供球員與教練查看

---

## 目標

球員和教練在賽前可透過 AI 分析，了解對手本季表現，取得戰術建議。測試階段以獨立套件實作，不影響現有任何功能。

---

## 使用者與場景

**目標使用者**：球員、教練/隊長  
**使用場景**：賽前查看，了解對手打球風格、弱點、危險球員

**分析內容**（每份報告三個部分）：
1. 對手整體打球風格（如：依賴三分球、快攻為主、防守積極）
2. 具體戰術建議（針對對手弱點，三項可執行建議）
3. 關鍵球員警示（需重點防守的對手球員）

每場比賽生成兩份報告：主隊視角與客隊視角。

---

## 範圍（測試版）

**包含**：
- 獨立 CLI 腳本（本地執行）
- GitHub Actions workflow（手動觸發）
- 爬取對手本季已完賽比賽的 event 頁面數據
- 呼叫 Claude API 生成分析
- 輸出至終端機 + `analysis_output.json`

**不包含**：
- 任何現有程式碼的修改
- 前端 UI
- D1 資料庫寫入
- 自動排程

---

## 架構

### 套件位置

```
packages/ai-analysis/
├── index.js            # 入口：解析參數、串接各模組
├── event-scraper.js    # 爬取單場 event.php?eid=X，回傳結構化統計
├── division-finder.js  # 從 event 頁解析 division，找出兩隊完賽場次清單
├── stats-aggregator.js # 組裝通用數據結構
├── prompt.js           # prompt 模板（易調整，與 provider 無關）
├── ai-client.js        # 統一 AI 客戶端，依 AI_PROVIDER 切換實作
├── providers/
│   ├── anthropic.js    # Anthropic Claude 實作
│   └── openai.js       # OpenAI 實作
├── .env.example        # AI_PROVIDER, ANTHROPIC_API_KEY, OPENAI_API_KEY, MODEL
└── package.json        # 依賴：cheerio, @anthropic-ai/sdk, openai, dotenv
```

### 資料流

```
--game_id=X
    ↓
① event-scraper: 爬 event.php?eid=X
   → 解析 home_tid, away_tid, level_id, gid（從頁面連結自動取得）
    ↓
② division-finder: 爬 division.php?gid=X&level_id=Y
   → 取得兩隊本季所有已完賽比賽的 eid 清單
    ↓
③ event-scraper（批次）: 逐一爬取各完賽 event 頁面
    ↓
④ stats-aggregator: 組裝通用數據結構
    ↓
⑤ claude-client: 呼叫 Claude API（兩次，各一個視角）
    ↓
⑥ 輸出：終端機 + analysis_output.json
```

---

## 數據結構

爬取完成後，組裝為與 TGB 參數無關的通用格式：

```js
{
  matchup: {
    game_id: 19487,
    home: { tid: 789, name: "火箭隊" },
    away: { tid: 101, name: "520" }
  },
  homeTeamGames: [
    {
      game_id: 19200,
      date: "2026-04-12",
      opponent: "閃電隊",
      result: "win",               // "win" | "loss" | null
      teamStats: {
        fgPct: 0.45,
        threePct: 0.32,
        ftPct: 0.78,
        rebounds: 38,
        assists: 12,
        steals: 6,
        turnovers: 8,
        quarterScores: [21, 16, 13, 14]
      },
      topPlayers: [
        { name: "王大明", points: 22, rebounds: 8, assists: 3 }
      ]
    }
    // 更多場次；未來可跨賽季擴充
  ],
  awayTeamGames: [ /* 同格式 */ ]
}
```

此結構不依賴任何 TGB 特定識別碼，AI prompt 可直接消費，未來也可接入其他聯盟數據。

---

## Prompt 設計

`prompt.js` 獨立維護，與 provider 無關，修改 prompt 不需動其他程式：

```js
export function buildPrompt(matchupData, perspective) {
  // perspective: { myTeam: {...}, opponentGames: [...] }
  return `你是一位籃球戰術分析師...（可自由編輯）`;
}
```

AI 呼叫兩次：

1. 以主隊為「我方」，分析客隊對手數據
2. 以客隊為「我方」，分析主隊對手數據

---

## AI Provider 設定

透過環境變數切換，不需修改程式碼：

```bash
# 使用 Anthropic Claude（預設）
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
MODEL=claude-sonnet-4-6

# 使用 OpenAI
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
MODEL=gpt-4o
```

`ai-client.js` 依 `AI_PROVIDER` 動態載入對應 provider：

- `providers/anthropic.js`：使用 `@anthropic-ai/sdk`
- `providers/openai.js`：使用 `openai` SDK

兩個 provider 皆實作相同介面 `async function generate(prompt): Promise<string>`，`ai-client.js` 只呼叫此介面，與具體 SDK 完全解耦。

---

## 輸入與觸發

### CLI

```bash
AI_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-... node packages/ai-analysis/index.js --game_id=19487
AI_PROVIDER=openai OPENAI_API_KEY=sk-... node packages/ai-analysis/index.js --game_id=19487
```

### GitHub Actions（`.github/workflows/ai-analysis.yml`）

```yaml
on:
  workflow_dispatch:
    inputs:
      game_id:
        description: 'TGB game ID (eid) of the upcoming match'
        required: true
```

Secret `AI_PROVIDER`、`ANTHROPIC_API_KEY`（或 `OPENAI_API_KEY`）、`MODEL` 設定於 repo secrets。

---

## 輸出

**終端機**：
```
=== 主隊視角（火箭隊 vs 520）===
【對手風格】...
【戰術建議】...
【關鍵球員】...

=== 客隊視角（520 vs 火箭隊）===
...
```

**`analysis_output.json`**（存於執行目錄）：
```json
{
  "game_id": 19487,
  "generated_at": "2026-05-15T10:00:00Z",
  "home_perspective": "...",
  "away_perspective": "..."
}
```

---

## 關鍵假設

- `event.php?eid=X` 對於尚未出賽的比賽，頁面仍會顯示兩隊名稱及分組連結（用於解析 home_tid、away_tid、level_id、gid）。若頁面結構不同，需改為從 division 頁面反查。
- 爬取多個 event 頁面時，各請求之間加入 1 秒延遲，避免對 TGB 伺服器造成過大負荷（與現有 scraper 一致）。

---

## 錯誤處理

- event 頁面無法爬取：記錄警告，跳過該場，繼續分析（數據不足時 prompt 中說明）
- 完賽場次為零：終止並提示「對手本季尚無完賽數據」
- Claude API 失敗：顯示錯誤訊息，不寫入 JSON

---

## 未來擴充（測試版後）

- 將分析結果存入 D1，前端頁面直接讀取
- 加入自動觸發（現有 scraper 完成後）
- 支援多賽季數據輸入（數據結構已預留）
- 雙語輸出（zh/en）
