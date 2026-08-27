import { scrapeDivision } from './division.js';
import { upsertMetadata, upsertDivisionData, queryPendingDivisions } from './db-client.js';
import { sendNotifications } from './notify.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const divisions = queryPendingDivisions();
  console.log(`[results-scraper] ${divisions.length} division(s) with incomplete past games.`);

  if (divisions.length === 0) {
    console.log('[results-scraper] Nothing to do.');
    return;
  }

  const allChangedEvents = [];

  for (let i = 0; i < divisions.length; i++) {
    const { gid, level_id, division_name, league_name } = divisions[i];
    console.log(`[${i + 1}/${divisions.length}] ${league_name} / ${division_name}`);

    try {
      upsertMetadata(
        [{ gid, name: league_name }],
        [{ level_id, gid, name: division_name }],
      );

      const data = await scrapeDivision(gid, level_id, league_name, division_name);
      console.log(`  - scraped ${data.games.length} games`);

      const result = upsertDivisionData(data.teams, data.team_divisions, data.games);
      console.log(`  - updated: games=${result.counts.games_updated}, cancelled=${result.counts.games_deleted}`);

      if (result.changed?.length > 0) {
        allChangedEvents.push(...result.changed);
      }
    } catch (err) {
      console.error(`  - error: ${err.message}`);
    }

    if (i < divisions.length - 1) await sleep(1000);
  }

  if (allChangedEvents.length > 0) {
    console.log(`[results-scraper] Sending notifications for ${allChangedEvents.length} event(s)...`);
    await sendNotifications(allChangedEvents);
  }

  console.log('[results-scraper] Done.');
}

main().catch(err => {
  console.error('[results-scraper] Fatal:', err);
  process.exit(1);
});
