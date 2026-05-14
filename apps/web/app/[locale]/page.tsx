export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getTranslations } from 'next-intl/server';
import { HotTeams } from './components/HotTeams';
import { RecentTeams } from './components/RecentTeams';
import { TeamSearch } from './components/TeamSearch';
import { TopBar } from '@/components/TopBar';

type Props = { params: { locale: string } };

export async function generateMetadata({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('siteTitle') };
}

interface HotTeamRow {
  tid: number;
  name: string;
  league_name: string | null;
}

export default async function HomePage({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'home' });

  let hotTeams: Array<{ tid: number; name: string; leagueName: string }> = [];
  try {
    const { env } = getRequestContext();
    const result = await env.DB.prepare(`
      SELECT t.tid, t.name,
             (SELECT l.name FROM team_divisions td
              JOIN leagues l ON l.gid = td.gid
              WHERE td.tid = t.tid
              ORDER BY td.updated_at DESC LIMIT 1) as league_name
      FROM teams t
      ORDER BY t.updated_at DESC
      LIMIT 5
    `).all<HotTeamRow>();
    hotTeams = (result.results ?? []).map(r => ({
      tid: r.tid,
      name: r.name,
      leagueName: r.league_name ?? '',
    }));
  } catch {
    hotTeams = [];
  }

  return (
    <div>
      <TopBar variant="home" />

      {/* Hero */}
      <div className="px-5 pt-7">
        <div className="inline-flex items-center gap-1.5 bg-[rgba(255,255,255,0.65)] border border-[rgba(255,255,255,0.9)] rounded-full px-3 py-1 font-mono text-[10px] text-[#5b6478] backdrop-blur-xl mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3b6dff]" />
          {t('brandChip')}
        </div>

        <h1 className="text-[32px] font-bold leading-[1.1] tracking-[-0.04em] text-[#0d1426] mb-3">
          <span className="block">{t('taglineA')}</span>
          <span className="block bg-gradient-to-br from-[#3b6dff] to-[#7a4dff] bg-clip-text text-transparent pb-1">
            {t('taglineB')}
          </span>
        </h1>

        <p className="text-[13px] text-[#5b6478] leading-[1.6]">{t('subHero')}</p>
      </div>

      {/* Search */}
      <div className="px-5 pt-5">
        <TeamSearch locale={locale} />
      </div>

      {/* Recent teams */}
      <div className="px-5 pt-6">
        <RecentTeams locale={locale} header={t('recentHeader')} clearLabel={t('recentClear')} />
      </div>

      {/* Popular teams */}
      <div className="px-5 pt-6 pb-6">
        <HotTeams teams={hotTeams} locale={locale} />
      </div>
    </div>
  );
}
