import 'dotenv/config';
function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (const arg of args) {
    const [key, val] = arg.replace(/^--/, '').split('=');
    params[key] = val;
  }
  const gameId = parseInt(params.game_id, 10);
  if (!params.game_id || !Number.isInteger(gameId) || gameId <= 0) {
    console.error('Usage: node index.js --game_id=<eid>');
    process.exit(1);
  }
  return { gameId };
}

async function main() {
  const { gameId } = parseArgs();
  console.log(`\n[ai-analysis] Starting analysis for game ${gameId}\n`);
  // TODO: orchestration added in Task 10
  console.log('[ai-analysis] Done (scaffold only)');
}

main().catch(err => {
  console.error('[ai-analysis] Fatal:', err.message);
  process.exit(1);
});
