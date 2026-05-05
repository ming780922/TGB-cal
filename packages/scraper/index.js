import { scrapeHomepage, REQUEST_DELAY_MS } from './homepage.js';
import { scrapeDivision } from './division.js';
import { upsertDivisionData } from './api-client.js';
import { appendFileSync } from 'fs';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function outputToGitHubActions(key, value) {
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    appendFileSync(githubOutput, `${key}=${value}\n`);
  }
  console.log(`[output] ${key}=${value}`);
}

async function main() {
  console.log('[scraper] Starting TGB schedule scrape...');

  let totalNewTeams = 0;
  let divisionsScraped = 0;
  let divisionsErrored = 0;

  // Step 1: Get all divisions from homepage
  console.log('[scraper] Fetching TGB homepage...');
  const divisions = await scrapeHomepage();
  console.log(`[scraper] Found ${divisions.length} divisions to process`);

  // Step 2: Scrape each division and upsert
  for (let i = 0; i < divisions.length; i++) {
    const { gid, level_id, league_name } = divisions[i];
    try {
      console.log(`[scraper] Scraping division gid=${gid} level_id=${level_id}...`);
      const data = await scrapeDivision(gid, level_id, league_name);

      console.log(`[scraper] Upserting: ${data.teams.length} teams, ${data.games.length} games`);
      const result = await upsertDivisionData(data);

      totalNewTeams += result.new_teams || 0;
      divisionsScraped++;

      console.log(`[scraper] Division done: inserted=${JSON.stringify(result.inserted)}, updated=${JSON.stringify(result.updated)}, new_teams=${result.new_teams}`);
    } catch (err) {
      console.error(`[scraper] Error processing division gid=${gid} level_id=${level_id}:`, err.message);
      divisionsErrored++;
    }

    // Rate limiting: wait between requests
    if (i < divisions.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.log(`[scraper] Complete: ${divisionsScraped} scraped, ${divisionsErrored} errored, ${totalNewTeams} new teams`);

  // Output for GitHub Actions
  outputToGitHubActions('new_teams', String(totalNewTeams));
}

main().catch(err => {
  console.error('[scraper] Fatal error:', err);
  process.exit(1);
});
