'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GlassCard } from '@/components/GlassCard';
import { getTeamColor } from '@/lib/teamColor';

const STORAGE_KEY = 'tgb_recent_teams';

type RecentTeam = { tid: number; name: string; leagueName: string };

type Props = { locale: string; header: string; clearLabel: string };

export function RecentTeams({ locale, header, clearLabel }: Props) {
  const [teams, setTeams] = useState<RecentTeam[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTeams(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
    setTeams([]);
  }

  if (teams.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] text-[#5b6478] tracking-[1.5px] uppercase">
          {header}
        </span>
        <button
          onClick={clearHistory}
          className="font-mono text-[10px] text-[#9ba3b4] hover:text-[#f43f5e] transition-colors"
        >
          {clearLabel}
        </button>
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
