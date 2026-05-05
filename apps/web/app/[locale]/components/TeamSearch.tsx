'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

type TeamResult = {
  tid: number;
  name: string;
  active_division_count: number;
  last_game_at: string | null;
};

type Props = {
  locale: string;
};

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
        .then((res) => res.json() as Promise<{ results: TeamResult[] }>)
        .then((data) => setResults(data.results))
        .catch(() => setResults([]));
    }, 200);

    return () => clearTimeout(timer);
  }, [inputValue]);

  return (
    <div>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder={t('searchPlaceholder')}
      />
      {inputValue && results !== null && (
        results.length === 0 ? (
          <p>{t('noResults')}</p>
        ) : (
          <ul>
            {results.map((team) => (
              <li key={team.tid}>
                <a href={`/${locale}/team/${team.tid}`}>{team.name}</a>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
