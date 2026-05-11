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

interface UpcomingGameRow {
  game_id: number;
  scheduled_at: number;
  venue: string;
  status: string;
  home_tid: number;
  away_tid: number;
  home_name: string;
  away_name: string;
  level_id?: number;
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
  let upcomingGames: UpcomingGameRow[] = [];

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
      ORDER BY d.updated_at DESC
    `).bind(now, Number(tid)).all<DivisionRow>();
    teamDivisions = divResult.results ?? [];

    const upcomingResult = await env.DB.prepare(`
      SELECT g.game_id, g.level_id, g.scheduled_at, g.venue, g.status,
             g.home_tid, g.away_tid,
             ht.name as home_name, at.name as away_name
      FROM games g
      JOIN teams ht ON ht.tid = g.home_tid
      JOIN teams at ON at.tid = g.away_tid
      WHERE (g.home_tid = ? OR g.away_tid = ?) AND g.status = 'scheduled'
      ORDER BY g.scheduled_at ASC
      LIMIT 10
    `).bind(Number(tid), Number(tid)).all<UpcomingGameRow>();
    upcomingGames = upcomingResult.results ?? [];
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
            {t('active').toUpperCase()} · {tid.toUpperCase()}
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

      {/* Season cards */}
      {teamDivisions.length > 0 && (
        <div className="px-5 pt-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-[10px] text-[#5b6478] tracking-[1.5px] uppercase">
              {t('seasons')} · {String(teamDivisions.length).padStart(2, '0')}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {teamDivisions.map((div) => {
              const nextGame = upcomingGames.find((g) => g.level_id === div.level_id);
              const opponent = nextGame
                ? nextGame.home_tid === Number(tid)
                  ? nextGame.away_name
                  : nextGame.home_name
                : null;
              const displayTitle = div.name || div.league_name;

              return (
                <div key={div.level_id} className="relative">
                  <GlassCard className="pl-4 pr-4 py-4 relative overflow-hidden">
                    {/* Left accent bar */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-[3px]"
                      style={{ background: 'linear-gradient(to bottom, #3b6dff, #7a4dff)' }}
                      aria-hidden="true"
                    />

                    <div className="flex items-start justify-between gap-2 ml-1">
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-semibold text-[#0d1426] truncate">
                          {div.league_name}
                        </div>
                        <div className="font-mono text-[11px] text-[#5b6478] mt-0.5">
                          {displayTitle !== div.league_name ? `${displayTitle} · ` : ''}
                          {t('scheduledOf', { s: div.scheduled_count, t: div.total_count })}
                        </div>
                      </div>

                      <span
                        className="font-mono text-[11px] font-semibold text-white px-[9px] py-[3px] rounded-[6px] whitespace-nowrap shrink-0"
                        style={{
                          background: 'linear-gradient(135deg, #3b6dff, #7a4dff)',
                          boxShadow: '0 4px 10px rgba(59,109,255,0.3)',
                        }}
                      >
                        {div.wins}W · {div.losses}L
                      </span>
                    </div>

                    {nextGame && opponent && (
                      <div
                        className="mt-[10px] ml-1 p-[10px] rounded-[10px] flex items-center gap-[10px]"
                        style={{ background: 'rgba(59,109,255,0.06)' }}
                      >
                        <div className="shrink-0">
                          <div className="font-mono text-[9px] text-[#9ba3b4] tracking-[1px] uppercase mb-0.5">
                            {t('nextMatch')}
                          </div>
                          <div className="font-mono text-[14px] font-semibold text-[#3b6dff]">
                            <LocalDate timestamp={nextGame.scheduled_at} part="date" />
                          </div>
                          <div className="font-mono text-[10px] text-[#9ba3b4]">
                            <LocalDate timestamp={nextGame.scheduled_at} part="time" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-[#0d1426]">
                            {t('vs')} {opponent}
                          </div>
                          {nextGame.venue && (
                            <div className="font-mono text-[10px] text-[#5b6478] truncate mt-0.5">
                              {nextGame.venue}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </GlassCard>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
