import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Inter, Noto_Sans_TC, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import { Footer } from '@/components/Footer';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const notoSansTC = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

const locales = ['zh-Hant', 'en'];

interface Props {
  children: React.ReactNode;
  params: { locale: string };
}

export default async function LocaleLayout({ children, params: { locale } }: Props) {
  if (!locales.includes(locale)) notFound();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${notoSansTC.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-9C2L297MN7"
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-9C2L297MN7');
          `}
        </Script>
      </head>
      <body className="bg-[#eef1f7] min-h-screen relative overflow-x-hidden font-sans text-[#0d1426]">
        {/* Background halos */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="absolute w-[260px] h-[260px] rounded-full"
            style={{ top: -80, right: -60, background: 'radial-gradient(circle, rgba(122,77,255,0.38), transparent 70%)' }}
          />
          <div
            className="absolute w-[260px] h-[260px] rounded-full"
            style={{ top: 220, left: -80, background: 'radial-gradient(circle, rgba(59,109,255,0.32), transparent 70%)' }}
          />
          <div
            className="absolute w-[260px] h-[260px] rounded-full"
            style={{ bottom: -110, right: -60, background: 'radial-gradient(circle, rgba(59,109,255,0.22), transparent 70%)' }}
          />
        </div>

        <NextIntlClientProvider messages={messages}>
          <div className="relative z-10 max-w-[400px] mx-auto min-h-screen flex flex-col">
            <main className="flex-1">
              {children}
            </main>
            <Footer locale={locale} />
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
