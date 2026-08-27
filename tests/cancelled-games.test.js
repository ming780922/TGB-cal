import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCancelledGames } from '../packages/scraper/db-client.js';
import { placeholderGameId } from '../packages/scraper/division.js';

const LEVEL = 1260;
const NOW = 1_800_000_000;
const FUTURE = NOW + 86_400;
const PAST = NOW - 86_400;

// A placeholder id for a future 為人施寶 (tid 481) vs 師大公鹿 (tid 316) fixture — the shape of
// the game that went missing from gid=240&level_id=1260 and kept showing up in the iCal feed.
const TEMP_ID = placeholderGameId(LEVEL, 481, 316, FUTURE);

function game(overrides) {
  return { game_id: 19487, level_id: LEVEL, scheduled_at: FUTURE, home_tid: 481, away_tid: 316, ...overrides };
}

function select(existing, { scrapedIds = [], claimed = [] } = {}) {
  return selectCancelledGames(existing, {
    levelId: LEVEL,
    scrapedIds,
    claimedTempIds: new Set(claimed),
    now: NOW,
  });
}

test('a placeholder fixture dropped from the page is reaped', () => {
  const rows = select([game({ game_id: TEMP_ID })]);
  assert.deepEqual(rows.map(g => g.game_id), [TEMP_ID]);
});

test('a past placeholder is reaped too — it can never be recovered', () => {
  const rows = select([game({ game_id: TEMP_ID, scheduled_at: PAST })]);
  assert.equal(rows.length, 1);
});

test('a future real-eid fixture dropped from the page is reaped', () => {
  const rows = select([game({ game_id: 19487 })]);
  assert.deepEqual(rows.map(g => g.game_id), [19487]);
});

test('a past real-eid game is kept — a missing one is more likely a parse hiccup', () => {
  const rows = select([game({ game_id: 19487, scheduled_at: PAST })]);
  assert.deepEqual(rows, []);
});

test('games still listed by the scrape are never reaped', () => {
  const existing = [game({ game_id: 19487 }), game({ game_id: TEMP_ID })];
  assert.deepEqual(select(existing, { scrapedIds: [19487, TEMP_ID] }), []);
});

test('a placeholder claimed for eid promotion is not reaped twice', () => {
  const rows = select([game({ game_id: TEMP_ID })], { scrapedIds: [19487], claimed: [TEMP_ID] });
  assert.deepEqual(rows, []);
});

test('another division\'s games are out of scope', () => {
  const rows = select([game({ game_id: 19487, level_id: 999 })]);
  assert.deepEqual(rows, []);
});
