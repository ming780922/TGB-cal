import { scrapeDivision } from './division.js';
import { upsertDivisionData } from './api-client.js';

async function main() {
  const gid = 211;
  const level_id = 1157;
  const league_name = 'Manual Single Scrape';

  console.log(`[scraper] Scraping targeted division gid=${gid} level_id=${level_id}...`);
  
  try {
    const data = await scrapeDivision(gid, level_id, league_name);
    console.log(`[scraper] Found ${data.teams.length} teams and ${data.games.length} games. Upserting to API...`);
    
    const result = await upsertDivisionData(data);
    console.log('[scraper] Success:', result);
  } catch (err) {
    console.error('[scraper] Error:', err.message);
    process.exit(1);
  }
}

main();
