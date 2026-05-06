import { getTranslations } from 'next-intl/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { notFound } from 'next/navigation';
import CopyButton from './CopyButton';

interface Props {
  params: { locale: string; tid: string };
}

interface DivisionRow {
  wins: number;
  losses: number;
  draws: number;
  rank: number | null;
  level_id: string;
  season_label: string;
  division_label: string;
  full_title: string | null;
  last_game_at: number;
  league_name: string;
}

interface UpcomingGameRow {
  game_id: string;
  scheduled_at: number;
  scheduled_at_local: string;
  venue: string;
  status: string;
  home_tid: string;
  away_tid: string;
  home_name: string;
  away_name: string;
  level_id?: string;
}

interface CompletedGameRow {
  game_id: string;
  scheduled_at: number;
  scheduled_at_local: string;
  venue: string;
  status: string;
  home_tid: string;
  away_tid: string;
  home_score: number;
  away_score: number;
  home_name: string;
  away_name: string;
}

export const runtime = 'edge';

export async function generateStaticParams() {
  // Returns empty — pages are rendered at runtime on Cloudflare Pages
  // (D1 is not available at build time in all environments)
  return [];
}

export async function generateMetadata({ params }: Props) {
  const { locale, tid } = params;
  if (isNaN(parseInt(tid))) return {};

  const t = await getTranslations({ locale, namespace: 'meta' });

  let teamName = '';
  let firstActiveDivision: DivisionRow | null = null;

  try {
    const { env } = getRequestContext();
    const team = await env.DB.prepare('SELECT name FROM teams WHERE tid = ?')
      .bind(tid)
      .first<{ name: string }>();
    teamName = team?.name ?? '';

    if (teamName) {
      const activeDivResult = await env.DB.prepare(`
        SELECT td.wins, td.losses, td.draws, td.rank,
               d.level_id, d.season_label, d.division_label, d.full_title, d.last_game_at,
               l.name as league_name
        FROM team_divisions td
        JOIN divisions d ON d.level_id = td.level_id
        JOIN leagues l ON l.gid = d.gid
        WHERE td.tid = ? AND d.last_game_at > unixepoch()
        ORDER BY d.last_game_at DESC
      `).bind(tid).first<DivisionRow>();
      firstActiveDivision = activeDivResult ?? null;
    }
  } catch {
    return { title: t('siteTitle') };
  }

  if (!teamName) return { title: t('siteTitle') };

  return {
    title: t('teamPageTitle', { teamName }),
    description: t('teamPageDescription', {
      teamName,
      season: firstActiveDivision?.season_label ?? '',
      division: firstActiveDivision?.division_label ?? '',
    }),
    alternates: {
      languages: {
        zh: `/zh/team/${tid}`,
        en: `/en/team/${tid}`,
      },
    },
  };
}

export default async function TeamPage({ params }: Props) {
  const { locale, tid } = params;

  if (isNaN(parseInt(tid))) notFound();

  const t = await getTranslations({ locale, namespace: 'team' });

  let team: { tid: string; name: string } | null = null;
  try {
    const { env } = getRequestContext();
    team = await env.DB.prepare('SELECT tid, name FROM teams WHERE tid = ?')
      .bind(tid)
      .first<{ tid: string; name: string }>();
  } catch {
    notFound();
  }

  if (!team) notFound();

  // Fetch schedule data
  let activeDivisions: DivisionRow[] = [];
  let pastDivision: DivisionRow | null = null;
  let upcomingGames: UpcomingGameRow[] = [];
  let completedGames: CompletedGameRow[] = [];

  try {
    const { env } = getRequestContext();

    // Active divisions (last_game_at in the future)
    const activeDivResult = await env.DB.prepare(`
      SELECT td.wins, td.losses, td.draws, td.rank,
             d.level_id, d.season_label, d.division_label, d.full_title, d.last_game_at,
             l.name as league_name
      FROM team_divisions td
      JOIN divisions d ON d.level_id = td.level_id
      JOIN leagues l ON l.gid = d.gid
      WHERE td.tid = ? AND d.last_game_at > unixepoch()
      ORDER BY d.last_game_at DESC
    `).bind(tid).all<DivisionRow>();
    activeDivisions = activeDivResult.results ?? [];

    // Past division fallback (only when no active divisions)
    if (activeDivisions.length === 0) {
      const pastDivResult = await env.DB.prepare(`
        SELECT td.wins, td.losses, td.draws, td.rank,
               d.level_id, d.season_label, d.division_label, d.full_title, d.last_game_at,
               l.name as league_name
        FROM team_divisions td
        JOIN divisions d ON d.level_id = td.level_id
        JOIN leagues l ON l.gid = d.gid
        WHERE td.tid = ? AND d.last_game_at <= unixepoch()
        ORDER BY d.last_game_at DESC
        LIMIT 1
      `).bind(tid).first<DivisionRow>();
      pastDivision = pastDivResult ?? null;
    }

    // Upcoming games (next 5 scheduled)
    const upcomingResult = await env.DB.prepare(`
      SELECT g.game_id, g.scheduled_at, g.scheduled_at_local, g.venue, g.status,
             g.home_tid, g.away_tid,
             ht.name as home_name, at.name as away_name
      FROM games g
      JOIN teams ht ON ht.tid = g.home_tid
      JOIN teams at ON at.tid = g.away_tid
      WHERE (g.home_tid = ? OR g.away_tid = ?) AND g.status = 'scheduled'
      ORDER BY g.scheduled_at ASC
      LIMIT 5
    `).bind(tid, tid).all<UpcomingGameRow>();
    upcomingGames = upcomingResult.results ?? [];

    // Completed games (recent 5)
    const completedResult = await env.DB.prepare(`
      SELECT g.game_id, g.scheduled_at, g.scheduled_at_local, g.venue, g.status,
             g.home_tid, g.away_tid, g.home_score, g.away_score,
             ht.name as home_name, at.name as away_name
      FROM games g
      JOIN teams ht ON ht.tid = g.home_tid
      JOIN teams at ON at.tid = g.away_tid
      WHERE (g.home_tid = ? OR g.away_tid = ?) AND g.status = 'completed'
      ORDER BY g.scheduled_at DESC
      LIMIT 5
    `).bind(tid, tid).all<CompletedGameRow>();
    completedGames = completedResult.results ?? [];
  } catch {
    // Default to empty arrays on error — already initialized above
  }

  const icalUrl = `https://tgb.ming060.com/ical/${tid}.ics`;
  const webcalUrl = `webcal://tgb.ming060.com/ical/${tid}.ics`;
  const googleCalUrl = `https://calendar.google.com/calendar/r/settings/addbyurl?url=${encodeURIComponent(icalUrl)}`;

  return (
    <main>
      <h1>{team.name}</h1>

      {/* Subscription section */}
      <section aria-label={t('subscribeSection')}>
        <h2>{t('subscribeSection')}</h2>
        <div>
          <a href={webcalUrl}>{t('addToApple')}</a>
          <a href={googleCalUrl} target="_blank" rel="noopener noreferrer">
            {t('addToGoogle')}
          </a>
          <CopyButton url={icalUrl} label={t('copyLink')} copiedLabel={t('copied')} />
        </div>
      </section>

      {/* Active seasons (T033) */}
      {activeDivisions.length > 0 && (
        <section aria-label={t('activeSeasons')}>
          <h2>{t('activeSeasons')}</h2>
          {activeDivisions.map(div => {
            const nextGame = upcomingGames.find(g => g.level_id === div.level_id);
            const divScheduledCount = upcomingGames.filter(g => g.level_id === div.level_id).length;
            const opponentName = nextGame
              ? (nextGame.home_tid === Number(tid) ? nextGame.away_name : nextGame.home_name)
              : null;
            return (
              <div key={div.level_id}>
                <h3>{div.full_title ?? `${div.season_label} ${div.division_label}`}</h3>
                <p>{div.league_name}</p>
                <p>{t('wins')}: {div.wins} / {t('losses')}: {div.losses} / {t('draws')}: {div.draws}{div.rank ? ` / ${t('rank')}: ${div.rank}` : ''}</p>
                <p>{t('scheduledGames')}: {divScheduledCount}</p>
                {nextGame && <p>{t('nextGame')}: {nextGame.scheduled_at_local} vs {opponentName} @ {nextGame.venue}</p>}
              </div>
            );
          })}
        </section>
      )}

      {/* Past season fallback (T034) */}
      {activeDivisions.length === 0 && pastDivision && (
        <section>
          <h2>{t('pastSeason')} <span>{t('ended')}</span></h2>
          <div>
            <h3>{pastDivision.full_title ?? `${pastDivision.season_label} ${pastDivision.division_label}`}</h3>
            <p>{pastDivision.league_name}</p>
            <p>{t('wins')}: {pastDivision.wins} / {t('losses')}: {pastDivision.losses} / {t('draws')}: {pastDivision.draws}</p>
          </div>
        </section>
      )}

      {/* Completed games (T035) */}
      {completedGames.length > 0 && (
        <section aria-label={t('completedGames')}>
          <h2>{t('completedGames')}</h2>
          <ul>
            {completedGames.map(game => {
              const isHome = game.home_tid === Number(tid);
              const opponent = isHome ? game.away_name : game.home_name;
              const score = isHome
                ? `${game.home_score} - ${game.away_score}`
                : `${game.away_score} - ${game.home_score}`;
              return (
                <li key={game.game_id}>
                  {game.scheduled_at_local} vs {opponent}: {score}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
