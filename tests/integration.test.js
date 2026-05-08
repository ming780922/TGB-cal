import { spawn } from 'child_process';
import { startMockTgbServer, stopMockTgbServer } from './mock-tgb-server.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Orchestrates the full integration test:
 * 1. Resets the database.
 * 2. Starts the Worker (wrangler dev).
 * 3. Starts the Mock TGB Server.
 * 4. Runs the Scraper.
 * 5. Verifies the results.
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

async function main() {
  console.log('=== Starting Integration Test ===');

  let workerProc;
  try {
    // 0. Kill existing worker if any
    try {
      await runCommand('lsof -t -i:8787 | xargs kill -9', []);
    } catch (e) {
      // ignore if no process found
    }

    // 1. Reset Database
    console.log('[test] Resetting database...');
    await runCommand('pnpm', ['db:reset']);

    const persistPath = path.resolve('apps/web/.wrangler/state');
    console.log(`[test] Using persistence path: ${persistPath}`);

    // 2. Start Worker in background
    console.log('[test] Starting Worker...');
    workerProc = spawn('npx', [
      'wrangler', 'dev',
      '--port', '8787',
      '--persist-to', persistPath,
      '--config', 'apps/worker/wrangler.toml'
    ], { stdio: 'pipe', shell: true });

    // Wait for worker to be ready
    await new Promise((resolve) => {
      workerProc.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Ready on')) resolve();
        process.stdout.write(`[worker] ${output}`);
      });
    });

    // 3. Start Mock TGB Server
    await startMockTgbServer();

    // 4. Run Scraper
    // We override TGB_BASE_URL to point to our mock server
    // and WORKER_BASE_URL to point to wrangler dev (default 8787)
    console.log('[test] Running Scraper...');
    await runCommand('node', ['packages/scraper/single-scrape.js'], {
      env: {
        ...process.env,
        TGB_BASE_URL: 'http://localhost:9999',
        WORKER_BASE_URL: 'http://localhost:8787',
        SCRAPER_API_KEY: 'devkey'
      }
    });

    // 5. Verify Database
    console.log('[test] Verifying results...');
    const dbCheck = spawn('npx', [
      'wrangler', 'd1', 'execute', 'tgb-calendar',
      '--local', '--persist-to', persistPath,
      '--config', 'apps/worker/wrangler.toml',
      '--command', '"SELECT COUNT(*) as count FROM games"'
    ], { stdio: 'pipe', shell: true });

    let dbOutput = '';
    dbCheck.stdout.on('data', d => dbOutput += d.toString());
    
    await new Promise(resolve => dbCheck.on('close', resolve));
    console.log(dbOutput);

    if (dbOutput.includes('17')) {
      console.log('✅ Success: Found expected number of games in DB.');
    } else {
      throw new Error('❌ Failure: DB count mismatch.');
    }

  } catch (err) {
    console.error(`[test] FAILED: ${err.message}`);
    process.exit(1);
  } finally {
    console.log('[test] Cleaning up...');
    if (workerProc) {
      workerProc.kill('SIGTERM');
    }
    await stopMockTgbServer();
  }
}

main();
