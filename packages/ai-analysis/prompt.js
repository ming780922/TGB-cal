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
  const opponentGamesJson = JSON.stringify(opponentGames, null, 2);
  const myGamesJson = JSON.stringify(myGames, null, 2);

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

## 原始數據（供參考）
對手數據 JSON：
${opponentGamesJson}

我方數據 JSON：
${myGamesJson}

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
