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
 * @returns {Promise<object>} Structured division data
 */
export async function scrapeDivision(gid, levelId, leagueName) {
  const url = `${TGB_BASE_URL}/division.php?gid=${gid}&level_id=${levelId}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'TGBCalendarBot/1.0 (+https://tgb.ming060.com)' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch division ${gid}/${levelId}: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // --- Parse page title / league & division metadata ---
  const pageTitle =
    $('title').text().trim() ||
    $('h1').first().text().trim() ||
    $('h2').first().text().trim() ||
    $('h3').first().text().trim() ||
    '';
  const fullTitle = pageTitle || `Division ${levelId}`;

  // TGB titles are often like "2025春季聯盟 甲組" or "2025/2026秋冬季 A組"
  const seasonMatch = fullTitle.match(
    /(\d{4}(?:[\/\-]\d{2,4})?[年]?(?:春|夏|秋|冬)?[季]?(?:上半年|下半年)?(?:第[一二三四]季)?)/
  );
  const seasonLabel = seasonMatch ? seasonMatch[1] : String(new Date().getFullYear());
  const divisionLabel = fullTitle.replace(seasonLabel, '').trim() || '';

  // --- Parse teams and standings ---
  const teams = [];
  const teamDivisions = [];
  const seenTids = new Set();

  $('table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 2) return;

    // A standings row must contain at least one team link (team.php?tid=N)
    const tidLinks = $(row).find('a[href*="team.php?tid="], a[href*="tid="]');
    if (!tidLinks.length) return;

    // Use the first tid link as the team for this row
    const firstLink = tidLinks.first();
    const tidMatch = firstLink.attr('href')?.match(/tid=(\d+)/);
    if (!tidMatch) return;

    const tid = parseInt(tidMatch[1]);
    const name = firstLink.text().trim();
    if (!name || !tid) return;

    if (!seenTids.has(tid)) {
      seenTids.add(tid);
      teams.push({ tid, name, name_normalized: normalizeTeamName(name) });

      // Parse rank / wins / losses from cell text values
      // Typical columns: 名次, 隊名, 勝, 負, 和, 積分 (rank, team, W, L, D, pts)
      const cellTexts = cells.toArray().map((c) => $(c).text().trim());
      const numericCells = cellTexts.filter((t) => /^\d+$/.test(t));

      const rank = parseInt(cellTexts[0]) || null;
      // wins/losses are the first two numeric columns after rank
      const wins = numericCells.length > 0 ? parseInt(numericCells[0]) : 0;
      const losses = numericCells.length > 1 ? parseInt(numericCells[1]) : 0;
      const draws = numericCells.length > 2 ? parseInt(numericCells[2]) : 0;

      teamDivisions.push({
        tid,
        level_id: parseInt(levelId),
        wins: isNaN(wins) ? 0 : wins,
        losses: isNaN(losses) ? 0 : losses,
        draws: isNaN(draws) ? 0 : draws,
        rank: isNaN(rank) ? null : rank,
      });
    }
  });

  // --- Parse games / schedule ---
  // TGB uses event.php?eid={N} for game detail links
  const games = [];
  const seenGameIds = new Set();

  $('table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 3) return;

    // A schedule row must contain an event link (eid=)
    const gameLink = $(row).find('a[href*="eid="]').first();
    if (!gameLink.length) return;

    const gameIdMatch = gameLink.attr('href')?.match(/eid=(\d+)/);
    if (!gameIdMatch) return;
    const gameId = parseInt(gameIdMatch[1]);
    if (seenGameIds.has(gameId)) return;
    seenGameIds.add(gameId);

    // Find home/away team links (team.php?tid=N)
    const teamLinks = $(row).find('a[href*="tid="]');
    const homeTid = parseInt($(teamLinks[0]).attr('href')?.match(/tid=(\d+)/)?.[1] || '0') || null;
    const awayTid = parseInt($(teamLinks[1]).attr('href')?.match(/tid=(\d+)/)?.[1] || '0') || null;

    // Date cell: contains "YYYY/MM/DD" pattern; date and time may be in same cell separated by whitespace
    const cellTexts = cells.toArray().map((c) => $(c).text().replace(/\s+/g, ' ').trim());
    const dateCellText = cellTexts.find((t) => /\d{4}\/\d{1,2}\/\d{1,2}/.test(t));
    if (!dateCellText) {
      console.warn(`[scrapeDivision] Game ${gameId}: no date found in row`);
      return;
    }
    // Combine date and time from the same cell (e.g. "2026/03/07 17:00")
    const dateTimeStr = dateCellText.replace(/\s+/g, ' ').trim();
    const scheduledAt = parseTaiwanDateTime(dateTimeStr);
    if (scheduledAt === null) {
      console.warn(`[scrapeDivision] Game ${gameId}: could not parse date "${dateTimeStr}"`);
      return;
    }
    const scheduledAtLocal = toLocalFormat(scheduledAt);

    // Venue: first cell text matching venue keywords; exclude the event-type tag (#...)
    const venue =
      cellTexts
        .flatMap((t) => t.split(/\s+/))
        .find((t) => t.length > 1 && /館|場|球場|體育|育館|运动|運動/.test(t) && !t.startsWith('#'))
        ?.trim() || null;

    // Scores: TGB puts home score and away score in separate <p> elements in one <td>
    // The score cell contains two numeric paragraphs (no separator between them)
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
      name: leagueName ?? fullTitle,
    },
    division: {
      level_id: parseInt(levelId),
      gid: parseInt(gid),
      season_label: seasonLabel,
      division_label: divisionLabel,
      full_title: fullTitle,
      first_game_at: firstGameAt,
      last_game_at: lastGameAt,
      team_count: teams.length,
    },
    teams,
    team_divisions: teamDivisions,
    games,
  };
}
