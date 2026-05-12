import { scrapeHomepage } from './homepage.js';
import { scrapeDivision } from './division.js';
import { upsertMetadata, upsertDivisionData } from './db-client.js';
import { sendNotifications } from './notify.js';

const REQUEST_DELAY_MS = 1000;

/**
 * Utility to wait between requests to avoid overwhelming the server.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main orchestration function.
 */
async function main() {
  console.log('[scraper] Starting FULL TGB crawl...');

  let successCount = 0;
  let errorCount = 0;
  const allChangedEvents = [];

  try {
    const divisions = await scrapeHomepage();
    console.log(`[scraper] Found ${divisions.length} divisions to scrape.`);

    // 1. Batch Upsert Metadata (Leagues & Divisions)
    const uniqueLeaguesMap = new Map();
    divisions.forEach(d => uniqueLeaguesMap.set(d.gid, { gid: d.gid, name: d.league_name }));
    const leaguesArray = Array.from(uniqueLeaguesMap.values());
    
    const divisionsArray = divisions.map(d => ({ level_id: d.level_id, gid: d.gid, name: d.division_name }));
    
    console.log(`[scraper] Upserting ${leaguesArray.length} leagues and ${divisionsArray.length} divisions...`);
    upsertMetadata(leaguesArray, divisionsArray);

    // 2. Process Per Division
    for (let i = 0; i < divisions.length; i++) {
      console.log(`[scraper] [${i + 1}/${divisions.length}] Processing: ${divisions[i].league_name}, ${divisions[i].division_name}`);
      const { gid, level_id, league_name, division_name } = divisions[i];

      try {
        const data = await scrapeDivision(gid, level_id, league_name, division_name);
        
        console.log(`  - Sending ${data.teams.length} teams, ${data.team_divisions.length} standings, and ${data.games.length} games...`);
        
        const result = upsertDivisionData(data.teams, data.team_divisions, data.games);
        
        console.log(`  - Done: teams=${JSON.stringify(result.counts.teams_inserted + result.counts.teams_updated)}, games=${JSON.stringify(result.counts.games_inserted + result.counts.games_updated)}`);

        if (Array.isArray(result.changed)) {
          allChangedEvents.push(...result.changed);
        }
        successCount++;
      } catch (err) {
        console.error(`  - Error processing division ${gid}/${level_id}:`, err.message);
        errorCount++;
      }

      if (i < divisions.length - 1) {
        await sleep(REQUEST_DELAY_MS);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('[scraper] Crawl complete.');
    console.log(`- Total Divisions: ${divisions.length}`);
    console.log(`- Successfully Processed: ${successCount}`);
    console.log(`- Failed: ${errorCount}`);
    console.log('='.repeat(50));

    if (allChangedEvents.length > 0) {
      console.log(`\n[scraper] ${allChangedEvents.length} change event(s) detected — sending push notifications...`);
      await sendNotifications(allChangedEvents);
    } else {
      console.log('\n[scraper] No game changes — skipping push notifications.');
    }
  } catch (err) {
    console.error('[scraper] Fatal error during crawl:', err);
    process.exit(1);
  }
}

main();
