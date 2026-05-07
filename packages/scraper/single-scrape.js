import * as cheerio from 'cheerio';
import { scrapeDivision } from './division.js';
import { upsertDivisionData } from './api-client.js';

const TGB_BASE_URL = 'https://tgbleague.com';

async function main() {
  const tid = 316; // 師大公鹿
  console.log(`[scraper] Finding all divisions for team tid=${tid}...`);

  try {
    const response = await fetch(`${TGB_BASE_URL}/team.php?tid=${tid}`, {
      headers: { 'User-Agent': 'TGBCalendarBot/1.0 (+https://tgb.ming060.com)' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch team page: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const divisions = [];
    const seen = new Set();

    // Look for links to division.php in the team page (usually in a dropdown or history list)
    $('a[href*="division.php"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/[?&]gid=(\d+).*?[?&]level_id=(\d+)|[?&]level_id=(\d+).*?[?&]gid=(\d+)/);
      if (match) {
        const gid = parseInt(match[1] || match[4], 10);
        const levelId = parseInt(match[2] || match[3], 10);
        if (!isNaN(gid) && !isNaN(levelId)) {
          const key = `${gid}-${levelId}`;
          if (!seen.has(key)) {
            seen.add(key);
            
            // leagueName: The general category (e.g., "2025年第二季和平信義週六男子組")
            // leagueName: The general category (e.g., "2025年第二季和平信義週六男子組")
            const leagueName = $(el).closest('ul').parent().children('a[href="#"]').text().trim() 
              || $(el).closest('ul').prevAll('.team-title, h4, h3').first().text().trim()
              || null;

            // divisionName: The specific division (e.g., "和平信義 C7")
            const rawDivisionName = $(el).text().trim() || 'Division';

            // Merge logic for better descriptive titles
            let mergedDivisionName = rawDivisionName;
            // Only merge if we have a leagueName and the raw name doesn't look like a full title already
            // (Full titles usually start with a 4-digit year)
            const looksLikeFullTitle = /^\d{4}/.test(rawDivisionName);

            if (leagueName && !looksLikeFullTitle && !rawDivisionName.includes(leagueName.substring(0, 4))) {
              const cleanLeague = leagueName.replace(/\s+/g, '');
              const cleanDiv = rawDivisionName.replace(/\s+/g, '');
              let i = 0;
              while (i < cleanDiv.length && cleanLeague.includes(cleanDiv[i])) {
                i++;
              }
              const suffix = cleanDiv.substring(i);
              mergedDivisionName = leagueName + (suffix ? suffix : '');
            }

            divisions.push({ gid, levelId, leagueName: leagueName || rawDivisionName, divisionName: mergedDivisionName });
          }
        }
      }
    });

    console.log(`[scraper] Found ${divisions.length} divisions to process`);

    for (let i = 0; i < divisions.length; i++) {
      const { gid, levelId, leagueName, divisionName } = divisions[i];
      console.log(`[scraper] [${i + 1}/${divisions.length}] Scraping gid=${gid} level_id=${levelId} (${divisionName})...`);
      
      try {
        const data = await scrapeDivision(gid, levelId, leagueName, divisionName);
        console.log(`[scraper] Found ${data.teams.length} teams and ${data.games.length} games. Upserting...`);
        
        const result = await upsertDivisionData(data);
        console.log(`[scraper] Success: inserted=${JSON.stringify(result.inserted)}, updated=${JSON.stringify(result.updated)}`);
      } catch (err) {
        console.error(`[scraper] Error scraping division ${gid}/${levelId}:`, err.message);
      }

      // Small delay between divisions to be polite
      if (i < divisions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('[scraper] Finished processing all divisions for team 316');
  } catch (err) {
    console.error('[scraper] Fatal error:', err.message);
    process.exit(1);
  }
}

main();
