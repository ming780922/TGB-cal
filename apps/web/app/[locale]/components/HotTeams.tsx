import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { GlassCard } from '@/components/GlassCard';
import { getTeamColor } from '@/lib/teamColor';

type Props = {
  teams: Array<{ tid: number; name: string; leagueName: string }>;
  locale: string;
};

export async function HotTeams({ teams, locale }: Props) {
  if (teams.length === 0) return null;

  const t = await getTranslations({ locale, namespace: 'home' });

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="font-mono text-[10px] text-[#5b6478] tracking-[1.5px] uppercase">
          {t('popularHeader')}
        </span>
      </div>

      <GlassCard>
        {teams.map((team, index) => {
          const color = getTeamColor(team.tid);
          const initial = team.name[0] ?? '?';
          const isLast = index === teams.length - 1;

          return (
            <Link
              key={team.tid}
              href={`/${locale}/team/${team.tid}`}
              className={`flex items-center gap-3 px-4 py-3 hover:bg-[rgba(59,109,255,0.04)] transition-colors ${!isLast ? 'border-b border-[rgba(13,20,38,0.06)]' : ''}`}
            >
              <span className="font-mono text-[10px] text-[#9ba3b4] w-5 shrink-0">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span
                className="w-7 h-7 rounded-[9px] flex items-center justify-center text-white font-bold text-[12px] shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${color}, ${color}dd)`,
                  boxShadow: `0 3px 8px ${color}33`,
                }}
              >
                {initial}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium text-[#0d1426] truncate">{team.name}</div>
                {team.leagueName && (
                  <div className="font-mono text-[10px] text-[#5b6478] truncate">{team.leagueName}</div>
                )}
              </div>
              <span className="text-[#3b6dff] text-[14px] shrink-0">→</span>
            </Link>
          );
        })}
      </GlassCard>
    </section>
  );
}
