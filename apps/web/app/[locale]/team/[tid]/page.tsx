import { getTranslations } from 'next-intl/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { notFound } from 'next/navigation';
import CopyButton from './CopyButton';
import LocalDate from './LocalDate';
import NotifyButton from './NotifyButton';
import { TopBar } from '@/components/TopBar';
import { GlassCard } from '@/components/GlassCard';

interface Props {
  params: { locale: string; tid: string };
}

interface DivisionRow {
  wins: number;
  losses: number;
  rank: number | null;
  level_id: number;
  gid: number;
  name: string | null;
  league_name: string;
  scheduled_count: number;
  total_count: number;
}

interface GameRow {
  game_id: number;
  level_id: number;
  scheduled_at: number;
  venue: string;
  status: string;
  home_tid: number;
  away_tid: number;
  home_name: string;
  away_name: string;
  home_score: number | null;
  away_score: number | null;
}

export const runtime = 'edge';

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props) {
  const { locale, tid } = params;
  if (isNaN(parseInt(tid))) return {};
  const t = await getTranslations({ locale, namespace: 'meta' });
  try {
    const { env } = getRequestContext();
    const team = await env.DB.prepare('SELECT name FROM teams WHERE tid = ?')
      .bind(tid)
      .first<{ name: string }>();
    if (!team?.name) return { title: t('siteTitle') };
    return { title: t('teamPageTitle', { teamName: team.name }) };
  } catch {
    return { title: t('siteTitle') };
  }
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

  let teamDivisions: DivisionRow[] = [];
  let allGames: GameRow[] = [];

  try {
    const { env } = getRequestContext();
    const now = Math.floor(Date.now() / 1000);

    const divResult = await env.DB.prepare(`
      SELECT td.wins, td.losses, td.rank,
             d.level_id, d.gid, d.name,
             l.name as league_name,
             (SELECT COUNT(*) FROM games g
              WHERE g.level_id = d.level_id
              AND (g.home_tid = td.tid OR g.away_tid = td.tid)
              AND g.status = 'scheduled'
              AND g.scheduled_at > ?) as scheduled_count,
             (SELECT COUNT(*) FROM games g
              WHERE g.level_id = d.level_id
              AND (g.home_tid = td.tid OR g.away_tid = td.tid)) as total_count
      FROM team_divisions td
      JOIN divisions d ON d.level_id = td.level_id
      JOIN leagues l ON l.gid = d.gid
      WHERE td.tid = ?
      ORDER BY (SELECT MAX(g.scheduled_at) FROM games g WHERE g.level_id = d.level_id AND (g.home_tid = td.tid OR g.away_tid = td.tid)) DESC
    `).bind(now, Number(tid)).all<DivisionRow>();
    teamDivisions = divResult.results ?? [];

    const gamesResult = await env.DB.prepare(`
      SELECT g.game_id, g.level_id, g.scheduled_at, g.venue, g.status,
             g.home_tid, g.away_tid,
             g.home_score, g.away_score,
             ht.name as home_name, away_t.name as away_name
      FROM games g
      JOIN teams ht ON ht.tid = g.home_tid
      JOIN teams away_t ON away_t.tid = g.away_tid
      WHERE (g.home_tid = ? OR g.away_tid = ?)
      ORDER BY g.scheduled_at DESC
    `).bind(Number(tid), Number(tid)).all<GameRow>();
    allGames = gamesResult.results ?? [];
  } catch {
    // defaults to empty arrays
  }

  const icalUrl = `https://tgb.ming060.com/ical/${tid}.ics`;
  const webcalUrl = `webcal://tgb.ming060.com/ical/${tid}.ics`;
  const googleCalUrl = `https://calendar.google.com/calendar/r/settings/addbyurl?url=${encodeURIComponent(icalUrl)}`;

  const totalWins = teamDivisions.reduce((s, d) => s + d.wins, 0);
  const totalLosses = teamDivisions.reduce((s, d) => s + d.losses, 0);
  const totalScheduled = teamDivisions.reduce((s, d) => s + d.scheduled_count, 0);

  const latestDiv = teamDivisions[0];

  return (
    <div className="pb-[140px]">
      <TopBar
        variant="team"
        locale={locale}
        backLabel={t('back')}
        shareLabel={t('share')}
      />

      {/* Hero header */}
      <div className="px-5 pt-5">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="w-1.5 h-1.5 rounded-full bg-[#3b6dff]"
            style={{ boxShadow: '0 0 6px #3b6dff' }}
            aria-hidden="true"
          />
          <span className="font-mono text-[10px] text-[#5b6478] tracking-[1.5px]">
            {t('active').toUpperCase()}
          </span>
        </div>

        <h1 className="text-[30px] font-bold tracking-[-0.02em] text-[#0d1426] mb-1">
          {team.name}
        </h1>

        {latestDiv && (
          <p className="text-[12px] text-[#5b6478]">
            {latestDiv.league_name}
            {latestDiv.name ? ` · ${latestDiv.name}` : ''}
          </p>
        )}
      </div>

      {/* Stat strip */}
      <div className="px-5 pt-4">
        <GlassCard className="flex divide-x divide-[rgba(13,20,38,0.08)]">
          {[
            { label: t('win'), value: totalWins, color: '#3b6dff' },
            { label: t('loss'), value: totalLosses, color: '#0d1426' },
            { label: t('sched'), value: totalScheduled, color: '#7a4dff' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex-1 flex flex-col items-center py-4 gap-1">
              <span
                className="font-mono text-[22px] font-bold leading-none"
                style={{ color }}
              >
                {value}
              </span>
              <span className="font-mono text-[9px] tracking-[1.5px] text-[#9ba3b4] uppercase">
                {label}
              </span>
            </div>
          ))}
        </GlassCard>
      </div>

      {/* Games in latest division */}
      {latestDiv && (() => {
        const divGames = allGames.filter((g) => g.level_id === latestDiv.level_id);
        const tidNum = Number(tid);
        return (
          <div className="px-5 pt-5 flex flex-col gap-2">
            {divGames.map((game) => {
              const isCompleted = game.status === 'completed';
              const myScore = game.home_tid === tidNum ? game.home_score : game.away_score;
              const oppScore = game.home_tid === tidNum ? game.away_score : game.home_score;
              const didWin = isCompleted && myScore !== null && oppScore !== null && myScore > oppScore;
              const didLose = isCompleted && myScore !== null && oppScore !== null && myScore < oppScore;

              const card = (
                <GlassCard className={`px-4 py-3 ${isCompleted ? 'cursor-pointer active:opacity-80' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className="shrink-0">
                      <div className="font-mono text-[11px] font-semibold text-[#3b6dff]">
                        <LocalDate timestamp={game.scheduled_at} part="date" />
                      </div>
                      <div className="font-mono text-[9px] text-[#9ba3b4]">
                        <LocalDate timestamp={game.scheduled_at} part="time" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-[#0d1426] truncate">
                        {game.home_name}
                      </div>
                      <div className="text-[13px] text-[#5b6478] truncate">
                        {game.away_name}
                      </div>
                      {game.venue && (
                        <div className="font-mono text-[9px] text-[#9ba3b4] truncate mt-0.5">
                          {game.venue}
                        </div>
                      )}
                    </div>

                    {isCompleted && myScore !== null && oppScore !== null ? (
                      <div className="shrink-0 text-right">
                        <div
                          className="font-mono text-[16px] font-bold leading-none"
                          style={{ color: didWin ? '#3b6dff' : didLose ? '#f43f5e' : '#5b6478' }}
                        >
                          {game.home_score} – {game.away_score}
                        </div>
                        <div
                          className="font-mono text-[9px] tracking-[1px] mt-0.5"
                          style={{ color: didWin ? '#3b6dff' : didLose ? '#f43f5e' : '#9ba3b4' }}
                        >
                          {didWin ? 'WIN' : didLose ? 'LOSS' : 'DRAW'}
                        </div>
                      </div>
                    ) : (
                      <span className="font-mono text-[9px] text-[#9ba3b4] shrink-0 tracking-[1px]">
                        SCH
                      </span>
                    )}
                  </div>
                </GlassCard>
              );

              return isCompleted ? (
                <a
                  key={game.game_id}
                  href={`https://tgbleague.com/event.php?eid=${game.game_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {card}
                </a>
              ) : (
                <div key={game.game_id}>{card}</div>
              );
            })}
          </div>
        );
      })()}

      {/* Subscribe footer — sticky */}
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[400px] px-4 pb-4 pt-3 z-20"
        style={{
          background: 'rgba(255,255,255,0.85)',
          borderTop: '1px solid rgba(255,255,255,0.9)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <p className="font-mono text-[10px] text-[#9ba3b4] tracking-[1.5px] uppercase mb-2">
          {t('subscribeHeader')}
        </p>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <a
            href={webcalUrl}
            className="flex items-center justify-center py-[11px] px-3 rounded-[12px] text-[13px] font-semibold text-white text-center"
            style={{
              background: 'linear-gradient(135deg, #3b6dff, #7a4dff)',
              boxShadow: '0 6px 18px rgba(59,109,255,0.35)',
            }}
          >
            {t('apple')}
          </a>
          <a
            href={googleCalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center py-[11px] px-3 rounded-[12px] text-[13px] font-semibold text-[#0d1426] bg-[rgba(255,255,255,0.85)] border border-[rgba(13,20,38,0.08)] text-center"
          >
            {t('google')}
          </a>
        </div>

        <NotifyButton
          tid={Number(tid)}
          label={t('notifyMe')}
          activeLabel={t('notifyActive')}
        />

        <CopyButton
          url={icalUrl}
          label={t('copyLink')}
          copiedLabel={t('copied')}
        />
      </div>
    </div>
  );
}
