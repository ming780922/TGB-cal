import * as cheerio from 'cheerio';
import { scrapeDivision } from './division.js';
import { upsertDivisionData } from './api-client.js';

const TGB_BASE_URL = 'https://tgbleague.com';
const REQUEST_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('[scraper] Starting FULL TGB crawl from homepage...');

  try {
    const response = await fetch(TGB_BASE_URL, {
      headers: { 'User-Agent': 'TGBCalendarBot/1.0 (+https://tgb.ming060.com)' },
    });

    if (!response.ok) throw new Error(`Failed to fetch homepage: ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);
    const tasks = [];

    console.log(`[debug] URL: ${TGB_BASE_URL} | Category Selector: 'li'`);

    // 1. Find all league categories in the navigation menu
    $('li').each((_, li) => {
      const categoryLink = $(li).children('a[href="#"]');
      const categoryName = categoryLink.find('div').text().trim() || categoryLink.text().trim();
      
      if (!categoryName) return;

      console.log(`[debug] Category found: ${categoryName} | Division Links Selector: 'ul li a[href*="division.php"]'`);
      const subLinks = $(li).find('ul li a[href*="division.php"]');
      if (subLinks.length > 0) {
        console.log(`[scraper] Found category: ${categoryName} (${subLinks.length} divisions)`);
      }

      subLinks.each((_, a) => {
        const href = $(a).attr('href') || '';
        const divisionLabel = $(a).text().trim();
        const match = href.match(/[?&]gid=(\d+).*?[?&]level_id=(\d+)|[?&]level_id=(\d+).*?[?&]gid=(\d+)/);
        
        if (match && divisionLabel) {
          const gid = parseInt(match[1] || match[4], 10);
          const levelId = parseInt(match[2] || match[3], 10);
          
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
        
        console.log(`  - Done: inserted=${JSON.stringify(result.inserted)}, updated=${JSON.stringify(result.updated)}`);
        
        successCount++;
      } catch (err) {
        console.error(`  - Error processing division ${task.gid}/${task.levelId}:`, err.message);
      }

      // Rate limiting
      if (i < uniqueTasks.length - 1) await sleep(REQUEST_DELAY_MS);
    }

    console.log(`\n[scraper] Crawl complete. Successfully processed ${successCount}/${uniqueTasks.length} divisions.`);
  } catch (err) {
    console.error('[scraper] Fatal error during crawl:', err);
    process.exit(1);
  }
}

main();
