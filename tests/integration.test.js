import { spawn } from 'child_process';
import { startMockTgbServer, stopMockTgbServer, setScenario } from './mock-tgb-server.js';
import path from 'path';

/**
 * Integration test suite.
 *
 * Scenarios covered:
 *   1. "game-scheduled-to-completed": scrape the C5 division twice.
 *      First pass (0509 snapshot): 05/09 games are scheduled with no scores.
 *      Second pass (0511 snapshot): 05/09 games are now completed with scores.
 *      Verifies that the DB reflects the updated status and ical_sequence is bumped.
 */

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`[test] Running: ${command} ${args.join(' ')}`);
    const proc = spawn(command, args, { stdio: 'inherit', shell: true, ...options });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function spawnWorker(persistPath) {
  return spawn('npx', [
    'wrangler', 'dev',
    '--port', '8787',
    '--persist-to', persistPath,
    '--config', 'apps/worker/wrangler.toml',
  ], { stdio: 'pipe', shell: true });
}

async function waitForWorker(proc) {
  return new Promise((resolve) => {
    proc.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Ready on')) resolve();
      process.stdout.write(`[worker] ${output}`);
    });
  });
}

async function runScraper(extraEnv = {}) {
  await runCommand('node', ['packages/scraper/single-scrape.js'], {
    env: {
      ...process.env,
      TGB_BASE_URL: 'http://localhost:9999',
      WORKER_BASE_URL: 'http://localhost:8787',
      SCRAPER_API_KEY: 'devkey',
      ...extraEnv,
    },
  });
}

async function queryDB(persistPath, sql) {
  return new Promise((resolve) => {
    const proc = spawn('npx', [
      'wrangler', 'd1', 'execute', 'tgb-calendar',
      '--local', '--persist-to', persistPath,
      '--config', 'apps/worker/wrangler.toml',
      '--command', `"${sql}"`,
    ], { stdio: 'pipe', shell: true });

    let out = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.on('close', () => resolve(out));
  });
}

// ─── Scenario: game-scheduled-to-completed ────────────────────────────────────

/**
 * The four 05/09 games in the C5 division (level_id=1157).
 *
 * Pass 1 (0509 snapshot): no scores → scraper generates synthetic game_ids >= 1e9.
 * Pass 2 (0511 snapshot): scores available → scraper sends real eids; the Worker's
 *   promotion logic deletes the synthetic row and re-inserts under the real eid,
 *   inheriting the ical_uid and bumping ical_sequence to 1.
 *
 * Timestamps for 2026-05-09 in UTC (Taiwan time UTC+8, so 16:00 TWN = 08:00 UTC):
 *   start = 1778284800  (2026-05-09 00:00 UTC)
 *   end   = 1778371200  (2026-05-10 00:00 UTC)
 */
const MAY9_START = 1778284800;
const MAY9_END   = 1778371200;

const C5_GAMES_COMPLETED = [
  // real eids from 0511 snapshot, scores confirmed by parsing the HTML
  { eid: 19487, home_tid: 316, away_tid: 107, home_score: 38, away_score: 64 },
  { eid: 19475, home_tid: 671, away_tid: 332, home_score: 54, away_score: 52 },
  { eid: 19466, home_tid: 971, away_tid: 203, home_score: 57, away_score: 74 },
  { eid: 19483, home_tid: 310, away_tid: 327, home_score: 58, away_score: 43 },
];

/**
 * Assert a COUNT(*) query returns exactly `expected`.
 * Throws with the full wrangler output on mismatch.
 */
async function assertCount(persistPath, sql, expected, description) {
  const out = await queryDB(persistPath, sql);
  const match = out.match(/"COUNT\(\*\)":\s*(\d+)/);
  const actual = match ? parseInt(match[1]) : null;
  if (actual !== expected) {
    throw new Error(
      `Assertion failed — ${description}\nExpected COUNT(*)=${expected}, got ${actual}\nQuery: ${sql}\nOutput: ${out}`
    );
  }
  console.log(`  ✅ ${description} (count=${expected})`);
}

async function testScheduledToCompleted(persistPath) {
  console.log('\n[test] === Scenario: game-scheduled-to-completed ===');

  // ── Pass 1: 0509 snapshot – all 05/09 games are scheduled (no scores, no eids) ──
  setScenario('c5-scheduled');
  console.log('[test] Pass 1: scraping with c5-scheduled scenario (0509 snapshot)...');
  await runScraper();

  console.log('[test] Verifying pass 1...');

  await assertCount(persistPath,
    `SELECT COUNT(*) FROM games WHERE status='scheduled' AND level_id=1157 AND scheduled_at BETWEEN ${MAY9_START} AND ${MAY9_END}`,
    4, '4 games on 05/09 inserted with status=scheduled'
  );

  await assertCount(persistPath,
    `SELECT COUNT(*) FROM games WHERE game_id >= 1000000000 AND level_id=1157 AND scheduled_at BETWEEN ${MAY9_START} AND ${MAY9_END}`,
    4, 'all 4 games carry synthetic game_ids (no eid in HTML yet)'
  );

  await assertCount(persistPath,
    `SELECT COUNT(*) FROM games WHERE level_id=1157 AND home_score IS NULL AND away_score IS NULL AND scheduled_at BETWEEN ${MAY9_START} AND ${MAY9_END}`,
    4, 'all 4 games have null scores'
  );

  // ── Pass 2: 0511 snapshot – 05/09 games now have scores and real eids ──
  setScenario('c5-completed');
  console.log('[test] Pass 2: scraping with c5-completed scenario (0511 snapshot)...');
  await runScraper();

  console.log('[test] Verifying pass 2...');

  // Synthetic rows must be gone (replaced by real eids)
  await assertCount(persistPath,
    `SELECT COUNT(*) FROM games WHERE game_id >= 1000000000 AND level_id=1157 AND scheduled_at BETWEEN ${MAY9_START} AND ${MAY9_END}`,
    0, 'synthetic game rows removed after promotion to real eids'
  );

  // Each real eid must have correct scores and status
  for (const g of C5_GAMES_COMPLETED) {
    await assertCount(persistPath,
      `SELECT COUNT(*) FROM games WHERE game_id=${g.eid} AND home_tid=${g.home_tid} AND away_tid=${g.away_tid} AND home_score=${g.home_score} AND away_score=${g.away_score} AND status='completed'`,
      1, `game eid=${g.eid}: home=${g.home_score} away=${g.away_score} status=completed`
    );

    // ical_sequence promoted from 0 → 1 via the inheritance path
    await assertCount(persistPath,
      `SELECT COUNT(*) FROM game_sync WHERE game_id=${g.eid} AND ical_sequence=1`,
      1, `game eid=${g.eid}: ical_sequence=1 (inherited from synthetic + bumped)`
    );
  }

  await assertCount(persistPath,
    `SELECT COUNT(*) FROM games WHERE status='completed' AND level_id=1157 AND scheduled_at BETWEEN ${MAY9_START} AND ${MAY9_END}`,
    4, 'all 4 games on 05/09 are now completed'
  );
}

// ─── Original smoke test (preserved) ─────────────────────────────────────────

async function testDefaultScrape(persistPath) {
  console.log('\n[test] === Scenario: default scrape ===');
  setScenario('default');
  await runScraper();
  await assertCount(persistPath, 'SELECT COUNT(*) FROM games', 17, 'default scrape inserts 17 games');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Starting Integration Tests ===');

  const persistPath = path.resolve('apps/web/.wrangler/state');
  let workerProc;

  try {
    // Kill any stale worker
    try { await runCommand('lsof -t -i:8787 | xargs kill -9', []); } catch { /* ok */ }

    // Reset DB
    console.log('[test] Resetting database...');
    await runCommand('pnpm', ['db:reset']);

    // Start worker
    console.log('[test] Starting Worker...');
    workerProc = spawnWorker(persistPath);
    await waitForWorker(workerProc);

    // Start mock TGB server (initially in 'default' scenario)
    await startMockTgbServer('default');

    // Run scenarios
    await testDefaultScrape(persistPath);

    // Reset DB between scenarios
    await runCommand('pnpm', ['db:reset']);

    await testScheduledToCompleted(persistPath);

    console.log('\n=== All integration tests passed ✅ ===');
  } catch (err) {
    console.error(`\n[test] FAILED: ${err.message}`);
    process.exit(1);
  } finally {
    console.log('[test] Cleaning up...');
    if (workerProc) workerProc.kill('SIGTERM');
    await stopMockTgbServer();
  }
}

main();
