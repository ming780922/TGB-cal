import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';

const locales = ['zh', 'en'];

interface Props {
  children: React.ReactNode;
  params: { locale: string };
}

export default async function LocaleLayout({ children, params: { locale } }: Props) {
  if (!locales.includes(locale)) notFound();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <header>
            <a href={`/${locale}`}>TGB iCal</a>
            <nav>
              <a href={locale === 'zh' ? '/en' : '/zh'}>
                {locale === 'zh' ? 'EN' : '中文'}
              </a>
            </nav>
          </header>
          <main>
            {children}
          </main>
          <footer>
            <a href={`/${locale}/terms`}>
              {locale === 'zh' ? '使用者條款' : 'Terms of Use'}
            </a>
            {' · '}
            <a href={`/${locale}/privacy`}>
              {locale === 'zh' ? '隱私權政策' : 'Privacy Policy'}
            </a>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
