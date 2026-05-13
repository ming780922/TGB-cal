export interface Env {
  DB: D1Database;
  SCRAPER_API_KEY: string;
  GITHUB_TOKEN: string;
}

const GITHUB_REPO = 'ming780922/TGB-cal';

async function dispatchWorkflow(token: string, workflow: string): Promise<void> {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'tgb-worker',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );
  if (!res.ok) {
    throw new Error(`GitHub dispatch failed: ${res.status} ${await res.text()}`);
  }
}

export default {
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const workflowMap: Record<string, string> = {
      '0 19 * * *': 'scrape.yml',
      '0 * * * *': 'results-scrape.yml',
    };
    const workflow = workflowMap[event.cron];
    if (!workflow) throw new Error(`Unknown cron: ${event.cron}`);
    await dispatchWorkflow(env.GITHUB_TOKEN, workflow);
  },

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
