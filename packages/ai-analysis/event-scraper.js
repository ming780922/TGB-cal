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
