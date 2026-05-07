import * as cheerio from 'cheerio';

const TGB_BASE_URL = 'https://tgbleague.com';

function normalizeTeamName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

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
 * Convert a Unix timestamp to YYYYMMDDTHHmmSS in Asia/Taipei (UTC+8), no Z suffix.
 */
function toLocalFormat(scheduledAt) {
  const d = new Date((scheduledAt + 8 * 3600) * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
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
  const seasonLabel = leagueName;
  const divisionLabel = divisionName.replace(leagueName, '').trim();

  console.log(`[scrape] Processing division: ${divisionName}`);
  console.log(`[debug] URL: ${url} | Standings Rows Selector: 'table tr'`);

  // --- Parse teams and standings ---
  const teams = [];
  const teamDivisions = [];
  const seenTids = new Set();

  $('table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 2) return;

    // Extract cell texts once per row
    const cellTexts = cells.toArray().map((c) => $(c).text().replace(/\s+/g, ' ').trim());

    // A standings row must contain at least one team link (team.php?tid=N)
    const tidLinks = $(row).find('a[href*="team.php?tid="], a[href*="tid="]');
    if (!tidLinks.length) return;

    const firstLink = tidLinks.first();
    const tidMatch = firstLink.attr('href')?.match(/tid=(\d+)/);
    if (!tidMatch) return;

    const tid = parseInt(tidMatch[1]);
    const name = firstLink.text().trim();
    if (!name || !tid) return;

    if (!seenTids.has(tid)) {
      seenTids.add(tid);
      teams.push({ tid, name, name_normalized: normalizeTeamName(name) });

      const rank = parseInt(cellTexts[0]) || null;
      const wins = parseInt(cellTexts[2]) || 0;
      const losses = parseInt(cellTexts[3]) || 0;

      console.log(`  - Team: [${tid}] ${name} (Rank: ${rank}, W: ${wins}, L: ${losses})`);

      teamDivisions.push({
        tid,
        level_id: parseInt(levelId),
        wins,
        losses,
        rank: isNaN(rank) ? null : rank,
      });
    }
  });

  console.log(`[debug] URL: ${url} | Schedule Rows Selector: 'table tr' | Team Link Selector: 'a[href*="tid="]' | Score Selector: 'td p'`);

  // --- Parse games / schedule ---
  const games = [];
  const seenGameIds = new Set();

  $('table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 3) return;

    // Extract cell texts once per row
    const cellTexts = cells.toArray().map((c) => $(c).text().replace(/\s+/g, ' ').trim());

    // A schedule row usually contains an event link (eid=)
    const gameLink = $(row).find('a[href*="eid="]').first();
    let gameId;

    if (gameLink.length) {
      const gameIdMatch = gameLink.attr('href')?.match(/eid=(\d+)/);
      if (gameIdMatch) {
        gameId = parseInt(gameIdMatch[1]);
      }
    }

    // Find home/away team links (team.php?tid=N)
    const teamLinks = $(row).find('a[href*="tid="]');
    if (teamLinks.length < 2 && !gameId) return; // Need at least two teams or a game ID

    const homeTid = parseInt($(teamLinks[0]).attr('href')?.match(/tid=(\d+)/)?.[1] || '0') || null;
    const awayTid = parseInt($(teamLinks[1]).attr('href')?.match(/tid=(\d+)/)?.[1] || '0') || null;

    // Date cell: contains "YYYY/MM/DD" pattern
    const dateCellText = cellTexts.find((t) => /\d{4}\/\d{1,2}\/\d{1,2}/.test(t));
    if (!dateCellText) return;

    const scheduledAt = parseTaiwanDateTime(dateCellText);
    if (scheduledAt === null) return;

    // If no gameId from link, generate a stable synthetic one
    if (!gameId && homeTid && awayTid) {
      gameId = 1000000000 + (scheduledAt % 100000000) + ((homeTid + awayTid) % 100);
    }

    if (!gameId || seenGameIds.has(gameId)) return;
    seenGameIds.add(gameId);

    const scheduledAtLocal = toLocalFormat(scheduledAt);

    const venue =
      cellTexts
        .flatMap((t) => t.split(/\s+/))
        .find((t) => t.length > 1 && /館|場|球場|體育|育館|运动|運動/.test(t) && !t.startsWith('#')) || null;

    let homeScore = null;
    let awayScore = null;
    let status = 'scheduled';

    cells.toArray().forEach((cell) => {
      const paras = $(cell).find('p').toArray().map((p) => $(p).text().trim());
      const nums = paras.filter((t) => /^\d+$/.test(t)).map(Number);
      if (nums.length >= 2) {
        homeScore = nums[0];
        awayScore = nums[1];
        status = 'completed';
      }
    });

    const homeName = $(teamLinks[0]).text().trim() || 'Home';
    const awayName = $(teamLinks[1]).text().trim() || 'Away';

    console.log(`  - Game: [${gameId}] ${dateCellText} | ${homeName} ${homeScore ?? ''} vs ${awayScore ?? ''} ${awayName} @ ${venue || 'Unknown'}`);

    games.push({
      game_id: gameId,
      level_id: levelId,
      home_tid: homeTid,
      away_tid: awayTid,
      scheduled_at: scheduledAt,
      scheduled_at_local: scheduledAtLocal,
      venue,
      home_score: homeScore,
      away_score: awayScore,
      status,
    });
  });

  // --- Calculate first/last game timestamps ---
  const gameTimes = games.map((g) => g.scheduled_at).filter(Boolean);
  const firstGameAt = gameTimes.length ? Math.min(...gameTimes) : null;
  const lastGameAt = gameTimes.length ? Math.max(...gameTimes) : null;

  return {
    league: {
      gid: parseInt(gid),
      name: leagueName,
    },
    division: {
      level_id: parseInt(levelId),
      gid: parseInt(gid),
      season_label: seasonLabel,
      division_label: divisionLabel,
      full_title: divisionName,
      first_game_at: firstGameAt,
      last_game_at: lastGameAt,
      team_count: teams.length,
    },
    teams,
    team_divisions: teamDivisions,
    games,
  };
}
