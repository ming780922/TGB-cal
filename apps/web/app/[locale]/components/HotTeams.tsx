import { getTranslations } from 'next-intl/server';

type Props = {
  teams: Array<{ tid: number; name: string }>;
  locale: string;
};

export async function HotTeams({ teams, locale }: Props) {
  if (teams.length === 0) {
    return null;
  }

  const t = await getTranslations({ locale, namespace: 'home' });

  return (
    <section>
      <h2>{t('hotTeams')}</h2>
      <ul>
        {teams.map(team => (
          <li key={team.tid}>
            <a href={`/${locale}/team/${team.tid}`}>{team.name}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
