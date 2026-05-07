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

  // Build a map of gid → league_name from the dropdown menu structure:
  // <li><a href="#"><div>2025年第二季和平信義週六男子組</div></a>
  //   <ul><li><a href="division.php?gid=180&level_id=...">...</a></li></ul>
  // </li>
  const gidNames = new Map();
  $('a[href*="division.php"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/gid=(\d+)/);
    if (!m || gidNames.has(m[1])) return;
    const sectionLi = $(el).closest('ul').parent();
    const name = sectionLi.children('a[href="#"]').children('div').text().trim()
      || sectionLi.children('a').first().text().trim();
    if (name) gidNames.set(m[1], name);
  });

  const divisions = new Map(); // key: `${gid}-${level_id}`

  $('a[href*="division.php"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/[?&]gid=(\d+).*?[?&]level_id=(\d+)|[?&]level_id=(\d+).*?[?&]gid=(\d+)/);
    if (match) {
      const gid = parseInt(match[1] || match[4], 10);
      const levelId = parseInt(match[2] || match[3], 10);
      if (!isNaN(gid) && !isNaN(levelId)) {
        const key = `${gid}-${levelId}`;
        if (!divisions.has(key)) {
          const leagueName = gidNames.get(String(gid)) ?? null;
          const rawDivisionName = $(el).text().trim() || 'Division';
          
          // Merge logic: If division name is just a suffix (like "C1"), prepend league name
          let mergedName = rawDivisionName;
          if (leagueName && !rawDivisionName.includes(leagueName.substring(0, 4))) {
            const cleanLeague = leagueName.replace(/\s+/g, '');
            const cleanDiv = rawDivisionName.replace(/\s+/g, '');
            let i = 0;
            while (i < cleanDiv.length && cleanLeague.includes(cleanDiv[i])) {
              i++;
            }
            const suffix = cleanDiv.substring(i);
            mergedName = leagueName + (suffix ? suffix : '');
          }

          divisions.set(key, {
            gid,
            level_id: levelId,
            league_name: leagueName,
            division_name: mergedName,
          });
        }
      }
    }
  });

  return Array.from(divisions.values());
}

export { REQUEST_DELAY_MS };
