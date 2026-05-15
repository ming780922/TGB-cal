/**
 * Given a raw game and the perspective team's tid, determine win/loss/null.
 */
function getResult(rawGame, teamTid) {
  if (rawGame.homeScore == null || rawGame.awayScore == null) return null;
  if (rawGame.homeScore === rawGame.awayScore) return null;
  const isHome = rawGame.homeTid === teamTid;
  const homeWon = rawGame.homeScore > rawGame.awayScore;
  return isHome ? (homeWon ? 'win' : 'loss') : (homeWon ? 'loss' : 'win');
}

/**
 * Given a raw game and the perspective team's tid, return that team's stats block.
 */
function getTeamStats(rawGame, teamTid) {
  const isHome = rawGame.homeTid === teamTid;
  return {
    stats: isHome ? rawGame.homeStats : rawGame.awayStats,
    players: isHome ? (rawGame.homePlayers ?? []) : (rawGame.awayPlayers ?? []),
  };
}

/**
 * Convert a raw scraped game into a normalized game entry from a team's perspective.
 */
function normalizeGame(rawGame, teamTid, opponentName) {
  const { stats, players } = getTeamStats(rawGame, teamTid);
  const topPlayers = [...players]
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    .slice(0, 5);

  return {
    gameId: rawGame.eid,
    date: null,
    opponent: opponentName,
    result: getResult(rawGame, teamTid),
    teamStats: {
      points: stats.points,
      fgPct: stats.fgPct,
      threePct: stats.threePct,
      ftPct: stats.ftPct,
      offRebounds: stats.offRebounds,
      defRebounds: stats.defRebounds,
      rebounds: stats.rebounds,
      assists: stats.assists,
      steals: stats.steals,
      blocks: stats.blocks,
      turnovers: stats.turnovers,
      quarterScores: stats.quarterScores,
    },
    topPlayers,
  };
}

/**
 * Build the universal MatchupData from scrape results.
 *
 * @param {{ gameId, home: {tid, name}, away: {tid, name} }} meta
 * @param {object[]} homeRawGames - RawGameStats[] for home team's completed games
 * @param {object[]} awayRawGames - RawGameStats[] for away team's completed games
 * @returns {MatchupData}
 */
export function buildMatchupData(meta, homeRawGames, awayRawGames) {
  const homeTeamGames = homeRawGames.map(g => {
    const opponentTid = g.homeTid === meta.home.tid ? g.awayTid : g.homeTid;
    const opponentName = opponentTid === meta.away.tid ? meta.away.name : String(opponentTid);
    return normalizeGame(g, meta.home.tid, opponentName);
  });

  const awayTeamGames = awayRawGames.map(g => {
    const opponentTid = g.homeTid === meta.away.tid ? g.awayTid : g.homeTid;
    const opponentName = opponentTid === meta.home.tid ? meta.home.name : String(opponentTid);
    return normalizeGame(g, meta.away.tid, opponentName);
  });

  return {
    matchup: {
      gameId: meta.gameId,
      home: meta.home,
      away: meta.away,
    },
    homeTeamGames,
    awayTeamGames,
  };
}
