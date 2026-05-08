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

    // API Scraper Routes
    if (path.startsWith('/api/scrape/') && request.method === 'POST') {
      const apiModule = await import('./scrape-api');
      if (path === '/api/scrape/metadata') return apiModule.handleMetadataUpsert(request, env);
      if (path === '/api/scrape/division') return apiModule.handleDivisionUpsert(request, env);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
