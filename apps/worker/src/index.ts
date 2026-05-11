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

    // Push subscriptions list (scraper-facing, auth required)
    if (path === '/api/push/subscriptions' && request.method === 'GET') {
      const pushModule = await import('./push-api');
      return pushModule.handleListSubscriptions(request, env);
    }

    // Push unsubscribe cleanup (called by notify.js for 410 Gone responses)
    if (path === '/api/push/subscribe' && request.method === 'DELETE') {
      const pushModule = await import('./push-api');
      return pushModule.handleDeleteSubscription(request, env);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
