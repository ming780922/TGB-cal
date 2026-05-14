'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { GlassCard } from '@/components/GlassCard';
import { getTeamColor } from '@/lib/teamColor';

type TeamResult = {
  tid: number;
  name: string;
  leagueName: string;
};

type Props = { locale: string };

export function TeamSearch({ locale }: Props) {
  const t = useTranslations('home');
  const [inputValue, setInputValue] = useState('');
  const [results, setResults] = useState<TeamResult[] | null>(null);

  useEffect(() => {
    if (!inputValue) {
      setResults(null);
      return;
    }

    const timer = setTimeout(() => {
      fetch(`/api/teams/search?q=${encodeURIComponent(inputValue)}`)
        .then((res) => res.json() as Promise<{ results?: TeamResult[] }>)
        .then((data) => setResults(data.results ?? []))
        .catch(() => setResults([]));
    }, 150);

    return () => clearTimeout(timer);
  }, [inputValue]);

  return (
    <div>
      {/* Search input */}
      <div className="bg-[rgba(255,255,255,0.65)] border border-[rgba(255,255,255,0.9)] rounded-[14px] backdrop-blur-xl shadow-card flex items-center px-[14px] gap-2 focus-within:ring-2 focus-within:ring-[rgba(59,109,255,0.15)] transition-shadow">
        <Search size={16} className="text-[#9ba3b4] shrink-0" />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="flex-1 bg-transparent py-3 text-[14px] text-[#0d1426] placeholder:text-[#9ba3b4] outline-none font-sans"
        />
      </div>

      {/* Results */}
      {inputValue && results !== null && (
        <div className="mt-2">
          {results.length === 0 ? (
            <GlassCard className="px-4 py-3">
              <p className="text-[13px] text-[#5b6478]">
                {t('noResults', { q: inputValue })}
              </p>
            </GlassCard>
          ) : (
            <GlassCard>
              {results.map((team, index) => {
                const color = getTeamColor(team.tid);
                const initial = team.name[0] ?? '?';
                const isLast = index === results.length - 1;

                return (
                  <Link
                    key={team.tid}
                    href={`/${locale}/team/${team.tid}`}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-[rgba(59,109,255,0.04)] transition-colors ${!isLast ? 'border-b border-[rgba(13,20,38,0.06)]' : ''}`}
                  >
                    <span
                      className="w-8 h-8 rounded-[10px] flex items-center justify-center text-white font-bold text-[13px] shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${color}, ${color}dd)`,
                        boxShadow: `0 4px 10px ${color}33`,
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
          )}
        </div>
      )}
    </div>
  );
}
