const WORKER_BASE_URL = process.env.WORKER_BASE_URL;
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

if (!WORKER_BASE_URL) throw new Error('WORKER_BASE_URL environment variable is required');
if (!SCRAPER_API_KEY) throw new Error('SCRAPER_API_KEY environment variable is required');

export async function upsertDivisionData(data) {
  const url = `${WORKER_BASE_URL}/api/scrape/upsert`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SCRAPER_API_KEY}`,
    },
    body: JSON.stringify(data),
  });

  if (response.status === 401) {
    throw new Error('Authentication failed: invalid SCRAPER_API_KEY');
  }

  if (response.status === 400) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Bad request: ${body.error || response.statusText}`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Scrape API error ${response.status}: ${body.slice(0, 200)}`);
  }

  return response.json();
}
