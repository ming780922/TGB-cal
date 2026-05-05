export const runtime = 'edge';

import { getTranslations } from 'next-intl/server';

type Props = { params: { locale: string } };

export async function generateMetadata({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('terms') };
}

export default async function TermsPage({ params: { locale } }: Props) {
  return (
    <article>
      <h1>使用者條款 / Terms of Use</h1>
      <p>本網站 TGB iCal 訂閱服務之賽程資料來源為 <a href="https://www.tgbleague.com" target="_blank" rel="noopener noreferrer">TGB 官方網站</a>。</p>
      <p>資料僅供參考，實際賽程請以 TGB 官方公告為準。本網站不保證資料之即時性與正確性。</p>
      <p>本服務僅供個人非商業用途使用，禁止任何商業用途。</p>
      <hr />
      <p>Schedule data on this site is sourced from the <a href="https://www.tgbleague.com" target="_blank" rel="noopener noreferrer">TGB official website</a>.</p>
      <p>Data is provided for reference only. Please refer to official TGB announcements for accurate schedule information. We do not guarantee the accuracy or timeliness of the data.</p>
      <p>This service is for personal, non-commercial use only. Commercial use is prohibited.</p>
    </article>
  );
}
