import { getTranslations } from 'next-intl/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { notFound } from 'next/navigation';
import CopyButton from './CopyButton';

interface Props {
  params: { locale: string; tid: string };
}

export const runtime = 'edge';

export async function generateStaticParams() {
  // Returns empty — pages are rendered at runtime on Cloudflare Pages
  // (D1 is not available at build time in all environments)
  return [];
}

export async function generateMetadata({ params }: Props) {
  const { locale, tid } = params;
  const tidNum = parseInt(tid);
  if (isNaN(tidNum)) return {};

  const t = await getTranslations({ locale, namespace: 'meta' });

  let teamName = '';
  try {
    const { env } = getRequestContext();
    const team = await env.DB.prepare('SELECT name FROM teams WHERE tid = ?')
      .bind(tidNum)
      .first<{ name: string }>();
    teamName = team?.name ?? '';
  } catch {
    return { title: t('siteTitle') };
  }

  if (!teamName) return { title: t('siteTitle') };

  return {
    title: t('teamPageTitle', { teamName }),
    description: t('teamPageDescription', { teamName, season: '', division: '' }),
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
  const tidNum = parseInt(tid);

  if (isNaN(tidNum)) notFound();

  const t = await getTranslations({ locale, namespace: 'team' });

  let team: { tid: number; name: string } | null = null;
  try {
    const { env } = getRequestContext();
    team = await env.DB.prepare('SELECT tid, name FROM teams WHERE tid = ?')
      .bind(tidNum)
      .first<{ tid: number; name: string }>();
  } catch {
    notFound();
  }

  if (!team) notFound();

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

      {/* Active/past season sections added in T032–T035 */}
    </main>
  );
}
