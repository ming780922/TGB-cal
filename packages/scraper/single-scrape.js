import { scrapeDivision } from './division.js';
import { upsertMetadata, upsertDivisionData } from './api-client.js';

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
  console.log('[scraper] Starting SINGLE division scrape...');

  try {
    const task = {
      gid: 211,
      level_id: 1157,
      league_name: '2026年第一季和平信義週六男子組',
      division_name: '和平信義 C5',
    };

    // 1. Sync Metadata
    console.log(`[scraper] Syncing metadata for league: ${task.league_name}`);
    await upsertMetadata(
      [{ gid: task.gid, name: task.league_name }],
      [{ level_id: task.level_id, gid: task.gid, name: task.division_name }]
    );

    // 2. Sync Division Data
    console.log(`[scraper] Processing: ${task.division_name} (gid=${task.gid}, level_id=${task.level_id})`);
    const data = await scrapeDivision(task.gid, task.level_id, task.league_name, task.division_name);
    
    console.log(`  - Found ${data.teams.length} teams, ${data.games.length} games. Upserting...`);
    const result = await upsertDivisionData(data.teams, data.team_divisions, data.games);
    
    console.log(`  - Done: teams=${JSON.stringify(result.counts.teams_inserted + result.counts.teams_updated)}, games=${JSON.stringify(result.counts.games_inserted + result.counts.games_updated)}`);

    console.log('\n' + '='.repeat(50));
    console.log('[scraper] Scrape complete.');
    console.log('='.repeat(50));
  } catch (err) {
    console.error('[scraper] Fatal error:', err);
    process.exit(1);
  }
}

main();
