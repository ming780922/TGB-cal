import * as cheerio from 'cheerio';
import { scrapeDivision } from './division.js';
import { upsertDivisionData } from './api-client.js';

import { appendFileSync } from 'fs';

const TGB_BASE_URL = 'https://tgbleague.com';
const REQUEST_DELAY_MS = 1000;

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
  console.log('[scraper] Starting FULL TGB crawl from homepage...');

  let totalNewTeams = 0;
  try {
    const response = await fetch(TGB_BASE_URL, {
      headers: { 'User-Agent': 'TGBCalendarBot/1.0 (+https://tgb.ming060.com)' },
    });

    if (!response.ok) throw new Error(`Failed to fetch homepage: ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);
    const tasks = [];

    // 1. Find all league categories in the navigation menu
    // The structure is typically: <li> <a href="#"><div>Category</div></a> <ul> <li><a href="division.php...">
    $('li').each((_, li) => {
      const categoryLink = $(li).children('a[href="#"]');
      const categoryName = categoryLink.find('div').text().trim() || categoryLink.text().trim();
      
      if (!categoryName) return;

      const subLinks = $(li).find('ul li a[href*="division.php"]');
      subLinks.each((_, a) => {
        const href = $(a).attr('href') || '';
        const divisionLabel = $(a).text().trim();
        const match = href.match(/[?&]gid=(\d+).*?[?&]level_id=(\d+)|[?&]level_id=(\d+).*?[?&]gid=(\d+)/);
        
        if (match && divisionLabel) {
          const gid = parseInt(match[1] || match[4], 10);
          const levelId = parseInt(match[2] || match[3], 10);
          
          // Construct the full requested name: "LeagueCategory DivisionLabel"
          const fullDisplayName = `${categoryName} ${divisionLabel}`;
          
          tasks.push({
            gid,
            levelId,
            leagueName: categoryName,
            fullDisplayName
          });
        }
      });
    });

    // Remove duplicates (same gid-levelId)
    const uniqueTasks = Array.from(new Map(tasks.map(t => [`${t.gid}-${t.levelId}`, t])).values());
    console.log(`[scraper] Found ${uniqueTasks.length} unique divisions to scrape.`);

    let successCount = 0;
    for (let i = 0; i < uniqueTasks.length; i++) {
      const task = uniqueTasks[i];
      console.log(`[scraper] [${i + 1}/${uniqueTasks.length}] Processing: ${task.fullDisplayName}`);

      try {
        // Scrape the division page with our constructed names
        const data = await scrapeDivision(task.gid, task.levelId, task.leagueName, task.fullDisplayName);
        
        console.log(`  - Found ${data.teams.length} teams, ${data.games.length} games. Upserting...`);
        const result = await upsertDivisionData(data);
        
        totalNewTeams += result.new_teams || 0;
        console.log(`  - Done: inserted=${JSON.stringify(result.inserted)}, updated=${JSON.stringify(result.updated)}, new_teams=${result.new_teams || 0}`);
        
        successCount++;
      } catch (err) {
        console.error(`  - Error processing division ${task.gid}/${task.levelId}:`, err.message);
      }

      // Rate limiting
      if (i < uniqueTasks.length - 1) await sleep(REQUEST_DELAY_MS);
    }

    console.log(`\n[scraper] Crawl complete. Successfully processed ${successCount}/${uniqueTasks.length} divisions. Total new teams: ${totalNewTeams}`);
    
    // Output for GitHub Actions
    outputToGitHubActions('new_teams', String(totalNewTeams));
  } catch (err) {
    console.error('[scraper] Fatal error during crawl:', err);
    process.exit(1);
  }
}

main();
