import { scrapeDivision } from './division.js';
import { upsertMetadata, upsertDivisionData } from './api-client.js';
import { sendNotifications } from './notify.js';
import { readFileSync } from 'fs';

const pendingFile = process.argv[2];
if (!pendingFile) {
  console.error('Usage: node results-scrape.js <pending_divisions.json>');
  process.exit(1);
}

const divisions = JSON.parse(readFileSync(pendingFile, 'utf8'));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
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
      await upsertMetadata(
        [{ gid, name: league_name }],
        [{ level_id, gid, name: division_name }],
      );

      const data = await scrapeDivision(gid, level_id, league_name, division_name);
      console.log(`  - scraped ${data.games.length} games`);

      const result = await upsertDivisionData(data.teams, data.team_divisions, data.games);
      console.log(`  - updated: games=${result.counts.games_updated}`);

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
