import 'dotenv/config';
import { writeFileSync, readFileSync } from 'node:fs';
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
    const match = arg.replace(/^--/, '').split('=');
    params[match[0]] = match.length > 1 ? match.slice(1).join('=') : true;
  }

  const fromJson = params['from-json'];
  const scrapeOnly = params['scrape-only'] === true;

  if (fromJson) {
    return { mode: 'analyze', fromJson: String(fromJson) };
  }

  const gameId = parseInt(params.game_id, 10);
  if (!params.game_id || !Number.isInteger(gameId) || gameId <= 0) {
    console.error(
      'Usage:\n' +
      '  node index.js --game_id=<eid>                     # full flow\n' +
      '  node index.js --game_id=<eid> --scrape-only       # scrape & save matchup JSON, no AI\n' +
      '  node index.js --from-json=<path>                  # load matchup JSON & run AI only'
    );
    process.exit(1);
  }

  return { mode: scrapeOnly ? 'scrape' : 'full', gameId };
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

async function scrape(gameId) {
  console.log(`\n[ai-analysis] Scraping game ${gameId}\n`);

  console.log('Step 1/4: Looking up game metadata...');
  const meta = await scrapeEventMeta(gameId);
  console.log(`  Home: ${meta.home.name} (tid=${meta.home.tid})`);
  console.log(`  Away: ${meta.away.name} (tid=${meta.away.tid})`);
  console.log(`  Division: gid=${meta.gid}, level_id=${meta.levelId}\n`);

  console.log('Step 2/4: Finding completed games this season...');
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

  console.log('Step 3/4: Scraping completed game stats...');
  await sleep(1000);
  const homeRawGames = await scrapeTeamGames(homeEids, meta.home.name);
  const awayRawGames = await scrapeTeamGames(awayEids, meta.away.name);
  console.log();

  console.log('Step 4/4: Aggregating stats...');
  const matchupData = buildMatchupData(meta, homeRawGames, awayRawGames);
  console.log(`  Home team: ${matchupData.homeTeamGames.length} game(s) aggregated`);
  console.log(`  Away team: ${matchupData.awayTeamGames.length} game(s) aggregated\n`);

  return matchupData;
}

async function analyze(matchupData) {
  const { matchup } = matchupData;
  const provider = process.env.AI_PROVIDER || 'anthropic';
  console.log(`\n[ai-analysis] Generating analysis (provider: ${provider})\n`);

  let homePerspective = null;
  let awayPerspective = null;

  const homePrompt = buildPrompt(matchupData, 'home');
  console.log(`  Generating analysis for ${matchup.home.name} perspective...`);
  try {
    homePerspective = await generate(homePrompt);
  } catch (err) {
    console.error(`  [error] Home perspective failed: ${err.message}`);
  }

  await sleep(500);

  const awayPrompt = buildPrompt(matchupData, 'away');
  console.log(`  Generating analysis for ${matchup.away.name} perspective...`);
  try {
    awayPerspective = await generate(awayPrompt);
  } catch (err) {
    console.error(`  [error] Away perspective failed: ${err.message}`);
  }

  if (!homePerspective && !awayPerspective) {
    console.error('[ai-analysis] Both AI calls failed. No output written.');
    process.exit(1);
  }

  const separator = '═'.repeat(60);
  console.log(`\n${separator}`);
  console.log(`  主隊視角：${matchup.home.name} 對陣 ${matchup.away.name}`);
  console.log(separator);
  console.log(homePerspective ?? '（分析失敗）');

  console.log(`\n${separator}`);
  console.log(`  客隊視角：${matchup.away.name} 對陣 ${matchup.home.name}`);
  console.log(separator);
  console.log(awayPerspective ?? '（分析失敗）');

  const output = {
    game_id: matchup.gameId,
    generated_at: new Date().toISOString(),
    home: matchup.home,
    away: matchup.away,
    home_games_analyzed: matchupData.homeTeamGames.length,
    away_games_analyzed: matchupData.awayTeamGames.length,
    home_perspective: homePerspective,
    away_perspective: awayPerspective,
  };

  const outPath = resolve(process.cwd(), 'analysis_output.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n[ai-analysis] Output written to ${outPath}`);
}

async function main() {
  const args = parseArgs();

  if (args.mode === 'analyze') {
    const jsonPath = resolve(process.cwd(), args.fromJson);
    console.log(`[ai-analysis] Loading matchup data from ${jsonPath}`);
    const matchupData = JSON.parse(readFileSync(jsonPath, 'utf8'));
    await analyze(matchupData);
    return;
  }

  const matchupData = await scrape(args.gameId);

  const scrapeOutPath = resolve(process.cwd(), `matchup_${args.gameId}.json`);
  writeFileSync(scrapeOutPath, JSON.stringify(matchupData, null, 2), 'utf8');
  console.log(`[ai-analysis] Matchup data saved to ${scrapeOutPath}`);

  if (args.mode === 'scrape') {
    console.log('[ai-analysis] --scrape-only: skipping AI analysis.');
    return;
  }

  await analyze(matchupData);
}

main().catch(err => {
  console.error('[ai-analysis] Fatal:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
