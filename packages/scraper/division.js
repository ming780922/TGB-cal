import * as cheerio from 'cheerio';

const TGB_BASE_URL = process.env.TGB_BASE_URL || 'https://tgbleague.com';

/**
 * Parse a date string from the TGB website (Taiwan time, UTC+8) to a Unix timestamp.
 * Handles formats like "2025/03/15 19:00", "03/15 19:00", or with Chinese characters.
 */
function parseTaiwanDateTime(dateStr) {
  if (!dateStr) return null;
  const now = new Date();
  const year = now.getFullYear();
  // Normalize Chinese date characters
  const clean = dateStr.trim().replace(/[年月]/g, '/').replace(/日/g, '');
  const hasFourDigitYear = /^\d{4}/.test(clean);
  const normalized = hasFourDigitYear ? clean : `${year}/${clean}`;
  const parts = normalized.split(/[\s/]+/);
  const y = parseInt(parts[0]) || year;
  const m = parseInt(parts[1]) || 1;
  const d = parseInt(parts[2]) || 1;
  const timePart = parts[3] || '00:00';
  const [h, min] = timePart.split(':').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d, (h || 0) - 8, min || 0) / 1000);
}

/**
 * Scrape a TGB division page.
 *
 * HTML parsing strategy (defensive, multiple fallbacks):
 * - Title/league info: from <title>, then <h1>/<h2>/<h3>, then any prominent heading
 * - Teams/standings: look for <a href*="tid="> links inside <table> rows; parse
 *   surrounding cells for rank, wins, losses
 * - Games/schedule: look for <a href*="game_id="> links inside <table> rows; parse
 *   surrounding cells for date, venue, team links, and scores
 * - Warnings are logged for unparsed elements; partial data is returned rather than throwing
 *
 * @param {number} gid - League group ID
 * @param {number} levelId - Division level ID
 * @param {string} leagueName - League name (season label)
 * @param {string} divisionName - Full division display name
 * @returns {Promise<object>} Structured division data
 */
export async function scrapeDivision(gid, levelId, leagueName, divisionName) {
  const url = `${TGB_BASE_URL}/division.php?gid=${gid}&level_id=${levelId}`;
  console.log(`[scrape] GET ${url}`);
  const response = await fetch(url, {
    headers: { 'User-Agent': 'TGBCalendarBot/1.0 (+https://tgb.ming060.com)' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch division ${gid}/${levelId}: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // --- Metadata ---
  console.log(`[scrape] Processing division: ${divisionName} (gid=${gid}, level_id=${levelId})`);

  // --- Parse teams and standings ---
  const teams = [];
  const teamDivisions = [];

  $('#section-schedule table tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 4) return;

    const rank = parseInt($(cells[0]).text().trim());
    const teamLink = $(cells[1]).find('a[href*="tid="]');
    const tidMatch = teamLink.attr('href')?.match(/tid=(\d+)/);
    if (!tidMatch) return;

    const tid = parseInt(tidMatch[1]);
    const name = teamLink.text().trim();
    const wins = parseInt($(cells[2]).text().trim()) || 0;
    const losses = parseInt($(cells[3]).text().trim()) || 0;

    if (!tid || !name) return;

    teams.push({ tid, name });

    console.log(`  - Team: [${tid}] ${name} (Rank: ${rank}, W: ${wins}, L: ${losses})`);

    teamDivisions.push({
      tid,
      level_id: parseInt(levelId),
      gid: parseInt(gid),
      wins,
      losses,
      rank: isNaN(rank) ? null : rank,
    });
  });

  // --- Parse games / schedule ---
  const games = [];

  $('#section-work table.divi-Sche-table tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 6) return;

    // Time cell (0): Date and Time in <p> tags
    const timeParas = $(cells[0]).find('p').toArray().map(p => $(p).text().trim());
    const dateStr = timeParas.join(' ');
    const scheduledAt = parseTaiwanDateTime(dateStr);
    if (!scheduledAt) return;

    // Info cell (1): Venue and optional Game Type
    const infoParas = $(cells[1]).find('p').toArray().map(p => $(p).text().trim());
    const venue = infoParas[0] || null;

    // Teams cell (3): Home and Away team links
    const teamLinks = $(cells[3]).find('a[href*="tid="]');
    if (teamLinks.length < 2) return;

    const homeLink = $(teamLinks[0]);
    const awayLink = $(teamLinks[1]);
    const homeTid = parseInt(homeLink.attr('href')?.match(/tid=(\d+)/)?.[1] || '0');
    const awayTid = parseInt(awayLink.attr('href')?.match(/tid=(\d+)/)?.[1] || '0');
    const homeName = homeLink.text().trim();
    const awayName = awayLink.text().trim();

    // Score cell (4): Home and Away scores
    const scoreParas = $(cells[4]).find('p').toArray().map(p => $(p).text().trim());
    let homeScore = scoreParas[0] !== '-' ? parseInt(scoreParas[0]) : null;
    let awayScore = scoreParas[1] !== '-' ? parseInt(scoreParas[1]) : null;
    const status = (homeScore !== null && awayScore !== null) ? 'completed' : 'scheduled';

    // Record cell (5): Game ID (eid)
    const gameLink = $(cells[5]).find('a[href*="eid="]').first();
    let gameId = gameLink.length
      ? parseInt(gameLink.attr('href')?.match(/eid=(\d+)/)?.[1])
      : 1000000000 + (scheduledAt % 100000000) + ((homeTid + awayTid) % 100);

    if (!gameId) return;

    console.log(`  - Game: [${gameId}] ${dateStr} | ${homeName} ${homeScore ?? ''} vs ${awayScore ?? ''} ${awayName} @ ${venue || 'Unknown'}`);
    games.push({
      game_id: gameId,
      level_id: parseInt(levelId),
      home_tid: homeTid,
      away_tid: awayTid,
      scheduled_at: scheduledAt,
      venue,
      home_score: homeScore,
      away_score: awayScore,
      status,
    });
  });

  return {
    league: {
      gid: parseInt(gid),
      name: leagueName,
    },
    division: {
      level_id: parseInt(levelId),
      gid: parseInt(gid),
      name: divisionName,
    },
    teams,
    team_divisions: teamDivisions,
    games,
  };
}
