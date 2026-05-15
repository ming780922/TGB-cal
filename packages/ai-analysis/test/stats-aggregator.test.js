import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMatchupData } from '../stats-aggregator.js';

const meta = {
  gameId: 99,
  home: { tid: 1, name: "Alpha" },
  away: { tid: 2, name: "Beta" },
};

const makeRawGame = (eid, homeTid, awayTid, homeScore, awayScore) => ({
  eid,
  homeTid, awayTid,
  homeScore, awayScore,
  homeStats: {
    points: homeScore, twoFGM: 10, twoFGA: 20, threeFGM: 2, threeFGA: 6,
    ftm: 4, fta: 5, fgPct: 0.50, threePct: 0.33, ftPct: 0.80,
    offRebounds: 5, defRebounds: 20, rebounds: 25, assists: 8,
    steals: 3, blocks: 1, turnovers: 5, fouls: 10,
    quarterScores: [10, 12, 8, homeScore - 30],
  },
  homePlayers: [{ name: "Alice", points: 20, rebounds: 8, assists: 3, steals: 1, turnovers: 2 }],
  awayStats: {
    points: awayScore, twoFGM: 8, twoFGA: 18, threeFGM: 3, threeFGA: 9,
    ftm: 2, fta: 4, fgPct: 0.44, threePct: 0.33, ftPct: 0.50,
    offRebounds: 4, defRebounds: 18, rebounds: 22, assists: 6,
    steals: 2, blocks: 0, turnovers: 7, fouls: 12,
    quarterScores: [8, 10, 10, awayScore - 28],
  },
  awayPlayers: [{ name: "Bob", points: 18, rebounds: 7, assists: 2, steals: 2, turnovers: 3 }],
});

describe('buildMatchupData', () => {
  it('returns correct matchup metadata', () => {
    const result = buildMatchupData(meta, [], []);
    assert.deepEqual(result.matchup, {
      gameId: 99,
      home: { tid: 1, name: "Alpha" },
      away: { tid: 2, name: "Beta" },
    });
  });

  it('maps home team wins correctly when home team won', () => {
    // Alpha (tid=1) played as home, won 50-40
    const rawGame = makeRawGame(100, 1, 2, 50, 40);
    const result = buildMatchupData(meta, [rawGame], []);
    assert.equal(result.homeTeamGames[0].result, 'win');
  });

  it('maps home team loss correctly when home team played as away and lost', () => {
    // Alpha (tid=1) played as away (awayTid=1), lost 30-50
    const rawGame = makeRawGame(101, 2, 1, 50, 30);
    const result = buildMatchupData(meta, [rawGame], []);
    assert.equal(result.homeTeamGames[0].result, 'loss');
  });

  it('includes topPlayers sorted by points descending', () => {
    const rawGame = makeRawGame(100, 1, 2, 50, 40);
    rawGame.homePlayers = [
      { name: "Alice", points: 20, rebounds: 8, assists: 3, steals: 1, turnovers: 2 },
      { name: "Bob", points: 30, rebounds: 4, assists: 1, steals: 0, turnovers: 1 },
    ];
    const result = buildMatchupData(meta, [rawGame], []);
    assert.equal(result.homeTeamGames[0].topPlayers[0].name, 'Bob');
  });

  it('returns empty arrays when no games provided', () => {
    const result = buildMatchupData(meta, [], []);
    assert.deepEqual(result.homeTeamGames, []);
    assert.deepEqual(result.awayTeamGames, []);
  });

  it('returns null result for draws (equal scores)', () => {
    const rawGame = makeRawGame(102, 1, 2, 50, 50);
    const result = buildMatchupData(meta, [rawGame], []);
    assert.equal(result.homeTeamGames[0].result, null);
  });

  it('returns null result when scores are null', () => {
    const rawGame = makeRawGame(103, 1, 2, null, null);
    const result = buildMatchupData(meta, [rawGame], []);
    assert.equal(result.homeTeamGames[0].result, null);
  });

  it('maps away team win correctly', () => {
    // Beta (tid=2) played as away, won 60-40
    const rawGame = makeRawGame(104, 1, 2, 40, 60);
    const result = buildMatchupData(meta, [], [rawGame]);
    assert.equal(result.awayTeamGames[0].result, 'win');
  });

  it('resolves opponent name to team name when opponent is the other matchup team', () => {
    const rawGame = makeRawGame(100, 1, 2, 50, 40);
    const result = buildMatchupData(meta, [rawGame], []);
    assert.equal(result.homeTeamGames[0].opponent, 'Beta');
  });

  it('falls back to tid string for unknown opponents', () => {
    const rawGame = makeRawGame(105, 1, 99, 50, 40);
    const result = buildMatchupData(meta, [rawGame], []);
    assert.equal(result.homeTeamGames[0].opponent, '99');
  });
});
