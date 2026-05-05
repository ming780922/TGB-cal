export interface Env {
  DB: D1Database;
  SCRAPER_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Route: GET /ical/:tid.ics
    const icalMatch = path.match(/^\/ical\/(\d+)\.ics$/);
    if (icalMatch && request.method === 'GET') {
      const { handleIcalRequest } = await import('./ical-route');
      return handleIcalRequest(request, env, Number(icalMatch[1]));
    }

    // Route: POST /api/scrape/upsert
    if (path === '/api/scrape/upsert' && request.method === 'POST') {
      const { handleScrapeUpsert } = await import('./scrape-api');
      return handleScrapeUpsert(request, env);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
