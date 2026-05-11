import http from 'http';
import fs from 'fs/promises';
import path from 'path';

const PORT = 9999;
const FIXTURES_DIR = path.resolve('tests/fixtures');

/**
 * Scenario route rule. Rules are evaluated in order; first match wins.
 *
 * Matching criteria (all specified fields must match):
 *   path     - exact pathname match (e.g. '/index.php')
 *   contains - pathname must contain this substring (e.g. 'division.php')
 *   params   - all listed query params must equal the given values
 *
 * fixture - filename inside tests/fixtures/ to serve when this rule matches
 */

/** @type {Record<string, Array<{path?: string, contains?: string, params?: Record<string,string>, fixture: string}>>} */
const SCENARIOS = {
  /**
   * default: original behaviour - any division page → division_scheduled.html
   */
  default: [
    { path: '/',          fixture: 'homepage.html' },
    { path: '/index.php', fixture: 'homepage.html' },
    { contains: 'division.php', fixture: 'division_scheduled.html' },
  ],

  /**
   * c5-scheduled: C5 division (gid=211, level_id=1157) snapshot from 2026-05-09.
   * The four 05/09 games have no scores yet (status will be "scheduled").
   * All other division pages fall back to division_scheduled.html.
   */
  'c5-scheduled': [
    { path: '/',          fixture: 'homepage.html' },
    { path: '/index.php', fixture: 'homepage.html' },
    { contains: 'division.php', params: { gid: '211', level_id: '1157' }, fixture: 'division_c5_scheduled.html' },
    { contains: 'division.php', fixture: 'division_scheduled.html' },
  ],

  /**
   * c5-completed: C5 division (gid=211, level_id=1157) snapshot from 2026-05-11.
   * The four 05/09 games now have scores (status will be "completed").
   * Use after c5-scheduled to test the scheduled→completed transition.
   */
  'c5-completed': [
    { path: '/',          fixture: 'homepage.html' },
    { path: '/index.php', fixture: 'homepage.html' },
    { contains: 'division.php', params: { gid: '211', level_id: '1157' }, fixture: 'division_c5_completed.html' },
    { contains: 'division.php', fixture: 'division_scheduled.html' },
  ],
};

let activeScenario = 'default';

/**
 * Switch to a named scenario. Throws if the scenario does not exist.
 * @param {string} name - key from SCENARIOS
 */
export function setScenario(name) {
  if (!SCENARIOS[name]) throw new Error(`Unknown scenario: "${name}". Available: ${Object.keys(SCENARIOS).join(', ')}`);
  activeScenario = name;
  console.log(`[mock-tgb] Scenario set to: ${name}`);
}

/**
 * Return the currently active scenario name.
 */
export function getScenario() {
  return activeScenario;
}

/** Match a rule against a parsed URL. */
function matchRule(rule, urlObj) {
  if (rule.path !== undefined && urlObj.pathname !== rule.path) return false;
  if (rule.contains !== undefined && !urlObj.pathname.includes(rule.contains)) return false;
  if (rule.params) {
    for (const [k, v] of Object.entries(rule.params)) {
      if (urlObj.searchParams.get(k) !== v) return false;
    }
  }
  return true;
}

/** Resolve which fixture to serve for a given URL string. Returns null if no rule matches. */
function resolveFixture(rawUrl) {
  const urlObj = new URL(rawUrl, `http://localhost:${PORT}`);
  const rules = SCENARIOS[activeScenario] ?? [];
  for (const rule of rules) {
    if (matchRule(rule, urlObj)) return rule.fixture;
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  console.log(`[mock-tgb] (scenario=${activeScenario}) ${req.method} ${req.url}`);

  // Control endpoint: POST /__set-scenario  body: { scenario: "<name>" }
  if (req.method === 'POST' && req.url === '/__set-scenario') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { scenario } = JSON.parse(body);
        setScenario(scenario);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, scenario: activeScenario }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Control endpoint: GET /__scenario  → return current scenario name
  if (req.url === '/__scenario') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ scenario: activeScenario }));
  }

  const fixtureName = resolveFixture(req.url);

  if (!fixtureName) {
    res.writeHead(404);
    return res.end('Not Found');
  }

  try {
    const data = await fs.readFile(path.join(FIXTURES_DIR, fixtureName));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  } catch (err) {
    console.error(`[mock-tgb] Error reading fixture "${fixtureName}": ${err.message}`);
    res.writeHead(500);
    res.end(err.message);
  }
});

export function startMockTgbServer(scenario = 'default') {
  activeScenario = scenario;
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`[mock-tgb] Mock server running at http://localhost:${PORT} (scenario=${activeScenario})`);
      resolve(server);
    });
  });
}

export function stopMockTgbServer() {
  return new Promise((resolve) => {
    server.close(resolve);
  });
}
