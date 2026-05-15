import * as cheerio from 'cheerio';

const BASE_URL = process.env.TGB_BASE_URL || 'https://tgbleague.com';

export async function fetchHtml(url) {
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

  // The TGB event page lists home team first, away team second in the score header.
  // DOM order of team.php links matches this order (verified against live pages).
  const levelId = teamLinks[0].levelId;
  const home = { tid: teamLinks[0].tid, name: teamLinks[0].name };
  const away = { tid: teamLinks[1].tid, name: teamLinks[1].name };

  if (teamLinks.length > 2) {
    console.warn(`[meta] WARNING: found ${teamLinks.length} team links on event ${gameId}, expected 2. Using first two.`);
  }

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

/**
 * Scrape stats from a completed game event page.
 *
 * The page has two player stat tables (home team then away team).
 * Each table's last row is the team totals. Column indices are <td>-only
 * (the player name is in a <th> and excluded from find('td')):
 *   0: points  1: 2FGM  2: 2FGA  3: 2FG%  4: 3FGM  5: 3FGA
 *   6: 3FG%   7: FTM   8: FTA   9: FT%  10: offReb 11: defReb
 *  12: totalReb  13: assists  14: steals  15: blocks  16: turnovers
 *  17: fouls  18: eff  19: +/-  20: time
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
    // cells[0] = team label, cells[last] = Total; everything between is period scores
    const periodCount = cells.length - 2;
    const quarters = Array.from({ length: periodCount }, (_, i) =>
      parseInt($(cells[i + 1]).text().trim()) || 0
    );
    if (i === 1) homeQuarters = quarters;
    if (i === 2) awayQuarters = quarters;
  });

  if (!homeQuarters) {
    console.warn(`[stats] WARNING: eid=${eid} could not parse quarter scores from first table`);
  }

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

    // The player name is in a <th>, so find('td') returns only the 21 stat columns.
    // Actual td column mapping (0-based, player name excluded):
    //   0: points  1: 2FGM  2: 2FGA  3: 2FG%  4: 3FGM  5: 3FGA  6: 3FG%
    //   7: FTM     8: FTA   9: FT%  10: offReb 11: defReb 12: totalReb
    //  13: assists 14: steals 15: blocks 16: turnovers 17: fouls 18: eff
    //  19: +/-    20: time
    const twoFGM = parseN(tc[1]);
    const twoFGA = parseN(tc[2]);
    const threeFGM = parseN(tc[4]);
    const threeFGA = parseN(tc[5]);
    const ftm = parseN(tc[7]);
    const fta = parseN(tc[8]);

    const teamStats = {
      points: parseN(tc[0]),
      twoFGM, twoFGA,
      threeFGM, threeFGA,
      ftm, fta,
      fgPct: twoFGA > 0 ? twoFGM / twoFGA : null,
      threePct: threeFGA > 0 ? threeFGM / threeFGA : null,
      ftPct: fta > 0 ? ftm / fta : null,
      offRebounds: parseN(tc[10]),
      defRebounds: parseN(tc[11]),
      rebounds: parseN(tc[12]),
      assists: parseN(tc[13]),
      steals: parseN(tc[14]),
      blocks: parseN(tc[15]),
      turnovers: parseN(tc[16]),
      fouls: parseN(tc[17]),
    };

    // Player rows — skip totals and rows without player links
    // Player name is in a <th> element (not <td>), so look for a link in <th>
    const players = rows.slice(0, -1).flatMap(row => {
      const playerLink = $(row).find('th a');
      if (!playerLink.length) return [];
      const name = playerLink.text().trim();
      if (!name) return [];
      const cells = $(row).find('td');
      return [{
        name,
        points: parseN(cells[0]),
        rebounds: parseN(cells[12]),
        assists: parseN(cells[13]),
        steals: parseN(cells[14]),
        turnovers: parseN(cells[16]),
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
