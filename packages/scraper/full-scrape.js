import { scrapeHomepage } from './homepage.js';
import { scrapeDivision } from './division.js';
import { upsertDivisionData } from './api-client.js';
import { appendFileSync } from 'fs';

const REQUEST_DELAY_MS = 1000;

/**
 * Utility to wait between requests to avoid overwhelming the server.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Handles the scrape-and-upsert lifecycle for a single division.
 * @returns {Promise<{ newTeams: number, success: boolean }>}
 */
async function processDivisionTask(task) {
  const { gid, level_id, league_name, division_name } = task;
  console.log(`[scraper] Processing: ${division_name} (gid=${gid}, level_id=${level_id})`);

  try {
    const data = await scrapeDivision(gid, level_id, league_name, division_name);
    console.log(`  - Found ${data.teams.length} teams, ${data.games.length} games. Upserting...`);
    
    const result = await upsertDivisionData(data);
    const newTeams = result.new_teams || 0;
    
    console.log(`  - Done: inserted=${JSON.stringify(result.inserted)}, updated=${JSON.stringify(result.updated)}, new_teams=${newTeams}`);
    return { newTeams, success: true };
  } catch (err) {
    console.error(`  - Error processing division ${gid}/${level_id}:`, err.message);
    return { newTeams: 0, success: false };
  }
}

/**
 * Main orchestration function.
 */
async function main() {
  console.log('[scraper] Starting FULL TGB crawl...');

  let totalNewTeams = 0;
  let successCount = 0;
  let errorCount = 0;

  try {
    const divisions = await scrapeHomepage();
    console.log(`[scraper] Found ${divisions.length} divisions to scrape.`);

    for (let i = 0; i < divisions.length; i++) {
      const { gid, level_id, league_name, division_name } = divisions[i];
      console.log(`[scraper] Processing: ${league_name}, ${division_name} (gid=${gid}, level_id=${level_id})`);
    }

    for (let i = 0; i < divisions.length; i++) {
      console.log(`[scraper] [${i + 1}/${divisions.length}]`);

      const { gid, level_id, league_name, division_name } = divisions[i];
      console.log(`[scraper] Processing: ${league_name}, ${division_name} (gid=${gid}, level_id=${level_id})`);

      const result = await processDivisionTask(divisions[i]);
      
      totalNewTeams += result.newTeams;
      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }

      // Rate limiting: sleep between requests, except after the last one
      if (i < divisions.length - 1) {
        await sleep(REQUEST_DELAY_MS);
      }
    }

    // 3. Final Summary
    console.log('\n' + '='.repeat(50));
    console.log('[scraper] Crawl complete.');
    console.log(`- Total Divisions: ${divisions.length}`);
    console.log(`- Successfully Processed: ${successCount}`);
    console.log(`- Failed: ${errorCount}`);
    console.log(`- Total New Teams: ${totalNewTeams}`);
    console.log('='.repeat(50));
  } catch (err) {
    console.error('[scraper] Fatal error during crawl:', err);
    process.exit(1);
  }
}

main();
