export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getTranslations } from 'next-intl/server';
import { HotTeams } from './components/HotTeams';
import { TeamSearch } from './components/TeamSearch';

type Props = {
  params: { locale: string };
};

export async function generateMetadata({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'home' });
  return { title: t('title') };
}

export default async function HomePage({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'home' });

  let hotTeams: Array<{ tid: number; name: string }> = [];
  try {
    const { env } = getRequestContext();
    const result = await env.DB.prepare(
      'SELECT tid, name FROM teams ORDER BY active_division_count DESC, last_game_at DESC LIMIT 8'
    ).all<{ tid: number; name: string }>();
    hotTeams = result.results ?? [];
  } catch {
    hotTeams = [];
  }

  return (
    <main>
      <h1>{t('title')}</h1>
      <TeamSearch locale={locale} />
      <HotTeams teams={hotTeams} locale={locale} />
    </main>
  );
}
