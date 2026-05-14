import { scrapeDivision } from './division.js';
import { upsertMetadata, upsertDivisionData } from './db-client.js';

async function main() {
  const task = {
    gid: 211,
    level_id: 1157,
    league_name: '2026年第一季和平信義週六男子組',
    division_name: '和平信義 C5',
  };

  console.log(`[single-scraper] ${task.league_name} / ${task.division_name}`);

  upsertMetadata(
    [{ gid: task.gid, name: task.league_name }],
    [{ level_id: task.level_id, gid: task.gid, name: task.division_name }],
  );

  const data = await scrapeDivision(task.gid, task.level_id, task.league_name, task.division_name);
  console.log(`  - scraped ${data.games.length} games`);

  const result = upsertDivisionData(data.teams, data.team_divisions, data.games);
  console.log(`  - updated: games=${result.counts.games_updated}`);

  console.log('[single-scraper] Done.');
}

main().catch(err => {
  console.error('[single-scraper] Fatal:', err);
  process.exit(1);
});
