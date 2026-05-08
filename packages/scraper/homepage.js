import * as cheerio from 'cheerio';

const TGB_BASE_URL = 'https://tgbleague.com';

export async function scrapeHomepage() {
  console.log(`[scrape] GET ${TGB_BASE_URL}`);
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

  const divisions = [];

  $('.menu-mobile > ul > li').each((_, leagueLi) => {
    const leagueName = $(leagueLi).find('> a div').text().trim() || $(leagueLi).find('> a').text().trim();
    if (!leagueName) return;

    $(leagueLi).find('ul li a[href*="division.php"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const ids = parseIds(href);
      const divisionName = $(el).find('div').text().trim() || $(el).text().trim();

      if (ids) {
        divisions.push({
          gid: ids.gid,
          level_id: ids.levelId,
          league_name: leagueName,
          division_name: divisionName,
        });
      }
    });
  });

  return divisions;
}

/**
 * Helper to parse gid/level_id from a URL or string
 */
function parseIds(href) {
  if (!href) return null;
  const match = href.match(/[?&]gid=(\d+).*?[?&]level_id=(\d+)|[?&]level_id=(\d+).*?[?&]gid=(\d+)/);
  if (match) {
    const gid = parseInt(match[1] || match[4], 10);
    const levelId = parseInt(match[2] || match[3], 10);
    return { gid, levelId };
  }
  return null;
};
