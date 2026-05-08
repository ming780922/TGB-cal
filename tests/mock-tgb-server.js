import http from 'http';
import fs from 'fs/promises';
import path from 'path';

const PORT = 9999;
const FIXTURES_DIR = path.resolve('tests/fixtures');

/**
 * A simple HTTP server that serves mock TGB responses.
 * You can control which fixture it returns by setting a 'state' via a header or just by URL mapping.
 */
const server = http.createServer(async (req, res) => {
  console.log(`[mock-tgb] Request: ${req.url}`);

  try {
    if (req.url === '/' || req.url === '/index.php') {
      const data = await fs.readFile(path.join(FIXTURES_DIR, 'homepage.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(data);
    }

    if (req.url.includes('division.php')) {
      // Logic to pick fixture based on a custom cookie or just a default
      // For now, let's use a simple query param ?fixture=...
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const fixtureName = url.searchParams.get('fixture') || 'division_scheduled.html';
      
      const data = await fs.readFile(path.join(FIXTURES_DIR, fixtureName));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(data);
    }

    res.writeHead(404);
    res.end('Not Found');
  } catch (err) {
    console.error(`[mock-tgb] Error: ${err.message}`);
    res.writeHead(500);
    res.end(err.message);
  }
});

export function startMockTgbServer() {
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`[mock-tgb] Mock server running at http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

export function stopMockTgbServer() {
  return new Promise((resolve) => {
    server.close(resolve);
  });
}
