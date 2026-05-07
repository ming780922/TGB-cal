import { getTranslations } from 'next-intl/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { notFound } from 'next/navigation';
import CopyButton from './CopyButton';
import LocalDate from './LocalDate';

interface Props {
  params: { locale: string; tid: string };
}

interface DivisionRow {
  wins: number;
  losses: number;
  rank: number | null;
  level_id: number;
  gid: number;
  season_label: string;
  division_label: string;
  full_title: string | null;
  last_game_at: number;
  league_name: string;
  scheduled_count: number;
}

interface UpcomingGameRow {
  game_id: number;
  scheduled_at: number;
  scheduled_at_local: string;
  venue: string;
  status: string;
  home_tid: number;
  away_tid: number;
  home_name: string;
  away_name: string;
  level_id?: number;
}

interface CompletedGameRow {
  game_id: number;
  scheduled_at: number;
  scheduled_at_local: string;
  venue: string;
  status: string;
  home_tid: number;
  away_tid: number;
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
        SELECT td.wins, td.losses, td.rank,
               d.level_id, d.gid, d.season_label, d.division_label, d.full_title, d.last_game_at,
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
  let teamDivisions: DivisionRow[] = [];
  let upcomingGames: UpcomingGameRow[] = [];
  let completedGames: CompletedGameRow[] = [];

  try {
    const { env } = getRequestContext();
    const now = Math.floor(Date.now() / 1000);

    // All divisions for this team, sorted by last game date (most recent first)
    const divResult = await env.DB.prepare(`
      SELECT td.wins, td.losses, td.rank,
             d.level_id, d.gid, d.season_label, d.division_label, d.full_title, d.last_game_at,
             l.name as league_name,
             (SELECT COUNT(*) FROM games g 
              WHERE g.level_id = d.level_id 
              AND (g.home_tid = td.tid OR g.away_tid = td.tid)
              AND g.status = 'scheduled'
              AND g.scheduled_at > ?) as scheduled_count
      FROM team_divisions td
      JOIN divisions d ON d.level_id = td.level_id
      JOIN leagues l ON l.gid = d.gid
      WHERE td.tid = ?
      ORDER BY d.last_game_at DESC
    `).bind(now, Number(tid)).all<DivisionRow>();
    teamDivisions = divResult.results ?? [];

    // Upcoming games (next 5 scheduled across all divisions for nextGame info)
    const upcomingResult = await env.DB.prepare(`
      SELECT g.game_id, g.level_id, g.scheduled_at, g.scheduled_at_local, g.venue, g.status,
             g.home_tid, g.away_tid,
             ht.name as home_name, at.name as away_name
      FROM games g
      JOIN teams ht ON ht.tid = g.home_tid
      JOIN teams at ON at.tid = g.away_tid
      WHERE (g.home_tid = ? OR g.away_tid = ?) AND g.status = 'scheduled'
      ORDER BY g.scheduled_at ASC
      LIMIT 5
    `).bind(Number(tid), Number(tid)).all<UpcomingGameRow>();
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
    `).bind(Number(tid), Number(tid)).all<CompletedGameRow>();
    completedGames = completedResult.results ?? [];
  } catch {
    // Default to empty arrays on error
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

      {/* Seasons list */}
      {teamDivisions.length > 0 && (
        <section aria-label={t('activeSeasons')}>
          <h2>{t('activeSeasons')}</h2>
          {teamDivisions.map(div => {
            const nextGame = upcomingGames.find(g => g.level_id === div.level_id);
            const tgbUrl = `https://tgbleague.com/division.php?gid=${div.gid}&level_id=${div.level_id}`;
            const displayTitle = (div.full_title && div.full_title !== 'TGB') ? div.full_title : div.league_name;

            return (
              <div key={div.level_id}>
                <h3>
                  <a href={tgbUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                    {displayTitle}
                  </a>
                </h3>
                <p>
                  {t('wins')}: {div.wins} / {t('losses')}: {div.losses}
                  {div.rank ? ` / ${t('rank')}: ${div.rank}` : ''}
                  {` / ${t('scheduledGames')}: ${div.scheduled_count}`}
                </p>
                {nextGame && (
                  <p>
                    {t('nextGame')}: <LocalDate timestamp={nextGame.scheduled_at} /> {nextGame.home_name} vs {nextGame.away_name} @ {nextGame.venue}
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Completed games (T035) */}
      {completedGames.length > 0 && (
        <section aria-label={t('completedGames')}>
          <h2>{t('completedGames')}</h2>
          <ul>
            {completedGames.map(game => {
              const gameId = Number(game.game_id);
              const isRealGame = gameId < 1000000000;
              const tgbEventUrl = `https://tgbleague.com/event.php?eid=${gameId}`;
              
              const content = (
                <>
                  <LocalDate timestamp={game.scheduled_at} /> {game.home_name} {game.home_score} - {game.away_score} {game.away_name}
                </>
              );

              return (
                <li key={game.game_id}>
                  {isRealGame ? (
                    <a href={tgbEventUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                      {content}
                    </a>
                  ) : content}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
