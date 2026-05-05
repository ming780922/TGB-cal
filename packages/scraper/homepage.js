import * as cheerio from 'cheerio';

const TGB_BASE_URL = 'https://tgbleague.com';
const REQUEST_DELAY_MS = 1000;

export async function scrapeHomepage() {
  const response = await fetch(TGB_BASE_URL, {
    headers: {
      'User-Agent': 'TGBCalendarBot/1.0 (+https://tgb.ming060.com)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch TGB homepage: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const divisions = new Map(); // key: `${gid}-${level_id}`, value: {gid, level_id}

  // Parse all anchor tags for division links
  $('a[href*="division.php"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/[?&]gid=(\d+).*?[?&]level_id=(\d+)|[?&]level_id=(\d+).*?[?&]gid=(\d+)/);
    if (match) {
      const gid = parseInt(match[1] || match[4], 10);
      const levelId = parseInt(match[2] || match[3], 10);
      if (!isNaN(gid) && !isNaN(levelId)) {
        const key = `${gid}-${levelId}`;
        if (!divisions.has(key)) {
          divisions.set(key, { gid, level_id: levelId });
        }
      }
    }
  });

  return Array.from(divisions.values());
}

export { REQUEST_DELAY_MS };
