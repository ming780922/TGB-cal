import * as cheerio from 'cheerio';
import { fetchHtml } from './event-scraper.js';

const BASE_URL = process.env.TGB_BASE_URL || 'https://tgbleague.com';

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

