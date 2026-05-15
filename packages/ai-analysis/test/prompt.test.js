import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../prompt.js';

const sampleMatchup = {
  matchup: { gameId: 99, home: { tid: 1, name: "Alpha" }, away: { tid: 2, name: "Beta" } },
  homeTeamGames: [
    {
      gameId: 100, date: null, opponent: "Beta", result: "win",
      teamStats: { points: 60, fgPct: 0.50, threePct: 0.33, ftPct: 0.80,
        rebounds: 30, assists: 10, steals: 5, turnovers: 8, quarterScores: [15,15,15,15] },
      topPlayers: [{ name: "Alice", points: 20, rebounds: 8, assists: 3, steals: 1, turnovers: 2 }],
    },
  ],
  awayTeamGames: [],
};

describe('buildPrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = buildPrompt(sampleMatchup, 'home');
    assert.ok(typeof prompt === 'string' && prompt.length > 50);
  });

  it('home perspective includes home team name as "我方"', () => {
    const prompt = buildPrompt(sampleMatchup, 'home');
    assert.ok(prompt.includes('Alpha'));
  });

  it('away perspective includes away team name as "我方"', () => {
    const prompt = buildPrompt(sampleMatchup, 'away');
    assert.ok(prompt.includes('Beta'));
  });

  it('includes rendered stat values for opponent games', () => {
    // When away perspective: homeTeamGames become opponent data (fgPct: 0.50 → "50.0%")
    const prompt = buildPrompt(sampleMatchup, 'away');
    assert.ok(prompt.includes('50.0%'));
  });

  it('away perspective uses home team games as opponent data', () => {
    const prompt = buildPrompt(sampleMatchup, 'away');
    // homeTeamGames has 1 game vs "Beta"; from away perspective, Alpha's games are opponent data
    assert.ok(prompt.includes('Alpha'));
    assert.ok(prompt.includes('Beta'));
  });
});
