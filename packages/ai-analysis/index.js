import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scrapeEventMeta, scrapeEventStats, sleep } from './event-scraper.js';
import { findCompletedGameEids } from './division-finder.js';
import { buildMatchupData } from './stats-aggregator.js';
import { buildPrompt } from './prompt.js';
import { generate } from './ai-client.js';

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

async function scrapeTeamGames(eids, label) {
  const results = [];
  for (let i = 0; i < eids.length; i++) {
    const eid = eids[i];
    console.log(`[${label}] Scraping game ${i + 1}/${eids.length} (eid=${eid})`);
    const stats = await scrapeEventStats(eid);
    if (stats) results.push(stats);
    if (i < eids.length - 1) await sleep(1000);
  }
  return results;
}

async function main() {
  const { gameId } = parseArgs();
  console.log(`\n[ai-analysis] Analyzing game ${gameId}\n`);

  // Step 1: Identify teams and division from the target game's event page
  console.log('Step 1/5: Looking up game metadata...');
  const meta = await scrapeEventMeta(gameId);
  console.log(`  Home: ${meta.home.name} (tid=${meta.home.tid})`);
  console.log(`  Away: ${meta.away.name} (tid=${meta.away.tid})`);
  console.log(`  Division: gid=${meta.gid}, level_id=${meta.levelId}\n`);

  // Step 2: Find completed game eids for each team
  console.log('Step 2/5: Finding completed games this season...');
  await sleep(1000);
  const { homeEids, awayEids } = await findCompletedGameEids(
    meta.gid, meta.levelId, meta.home.tid, meta.away.tid
  );

  if (homeEids.length === 0 || awayEids.length === 0) {
    const which = homeEids.length === 0 ? meta.home.name : meta.away.name;
    console.error(`\nNo completed games found for ${which} this season. Cannot generate analysis.`);
    process.exit(1);
  }
  console.log();

  // Step 3: Scrape stats for each team's completed games
  console.log('Step 3/5: Scraping completed game stats...');
  await sleep(1000);
  const homeRawGames = await scrapeTeamGames(homeEids, meta.home.name);
  const awayRawGames = await scrapeTeamGames(awayEids, meta.away.name);
  console.log();

  // Step 4: Normalize into MatchupData
  console.log('Step 4/5: Aggregating stats...');
  const matchupData = buildMatchupData(meta, homeRawGames, awayRawGames);
  console.log(`  Home team: ${matchupData.homeTeamGames.length} game(s) aggregated`);
  console.log(`  Away team: ${matchupData.awayTeamGames.length} game(s) aggregated\n`);

  // Step 5: Generate AI analysis for both perspectives
  console.log('Step 5/5: Generating AI analysis...');
  const provider = process.env.AI_PROVIDER || 'anthropic';
  console.log(`  Using provider: ${provider}`);

  let homePerspective = null;
  let awayPerspective = null;

  const homePrompt = buildPrompt(matchupData, 'home');
  console.log(`  Generating analysis for ${meta.home.name} perspective...`);
  try {
    homePerspective = await generate(homePrompt);
  } catch (err) {
    console.error(`  [error] Home perspective failed: ${err.message}`);
  }

  await sleep(500);

  const awayPrompt = buildPrompt(matchupData, 'away');
  console.log(`  Generating analysis for ${meta.away.name} perspective...`);
  try {
    awayPerspective = await generate(awayPrompt);
  } catch (err) {
    console.error(`  [error] Away perspective failed: ${err.message}`);
  }

  if (!homePerspective && !awayPerspective) {
    console.error('[ai-analysis] Both AI calls failed. No output written.');
    process.exit(1);
  }

  // Output to terminal
  const separator = '═'.repeat(60);
  console.log(`\n${separator}`);
  console.log(`  主隊視角：${meta.home.name} 對陣 ${meta.away.name}`);
  console.log(separator);
  console.log(homePerspective ?? '（分析失敗）');

  console.log(`\n${separator}`);
  console.log(`  客隊視角：${meta.away.name} 對陣 ${meta.home.name}`);
  console.log(separator);
  console.log(awayPerspective ?? '（分析失敗）');

  // Write JSON output
  const output = {
    game_id: gameId,
    generated_at: new Date().toISOString(),
    home: meta.home,
    away: meta.away,
    home_games_analyzed: matchupData.homeTeamGames.length,
    away_games_analyzed: matchupData.awayTeamGames.length,
    home_perspective: homePerspective,
    away_perspective: awayPerspective,
  };

  const outPath = resolve(process.cwd(), 'analysis_output.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n[ai-analysis] Output written to ${outPath}`);
}

main().catch(err => {
  console.error('[ai-analysis] Fatal:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
