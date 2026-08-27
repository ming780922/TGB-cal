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
  const failures = [];
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
        
        console.log(`  - Done: teams=${result.counts.teams_inserted + result.counts.teams_updated}, games=${result.counts.games_inserted + result.counts.games_updated}, cancelled=${result.counts.games_deleted}`);

        if (Array.isArray(result.changed)) {
          allChangedEvents.push(...result.changed);
        }
        successCount++;
      } catch (err) {
        console.error(`  - Error processing division ${gid}/${level_id}:`, err.message);
        failures.push({ gid, level_id, league_name, division_name, message: err.message });
      }

      if (i < divisions.length - 1) {
        await sleep(REQUEST_DELAY_MS);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('[scraper] Crawl complete.');
    console.log(`- Total Divisions: ${divisions.length}`);
    console.log(`- Successfully Processed: ${successCount}`);
    console.log(`- Failed: ${failures.length}`);
    for (const f of failures) {
      console.log(`  ✗ ${f.gid}/${f.level_id} — ${f.league_name}, ${f.division_name}: ${f.message}`);
    }
    console.log('='.repeat(50));

    if (allChangedEvents.length > 0) {
      console.log(`\n[scraper] ${allChangedEvents.length} change event(s) detected — sending push notifications...`);
      await sendNotifications(allChangedEvents);
    } else {
      console.log('\n[scraper] No game changes — skipping push notifications.');
    }

    // Notifications are sent first so a partial run still reaches subscribers, but the job
    // must go red: a division that silently rolls back is how a whole new season went missing.
    if (failures.length > 0) {
      console.error(`\n[scraper] ${failures.length} division(s) failed to persist — failing the run.`);
      process.exit(1);
    }
  } catch (err) {
    console.error('[scraper] Fatal error during crawl:', err);
    process.exit(1);
  }
}

main();
