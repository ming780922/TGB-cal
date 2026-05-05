export const runtime = 'edge';

import { getTranslations } from 'next-intl/server';

type Props = { params: { locale: string } };

export async function generateMetadata({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('privacy') };
}

export default async function PrivacyPage({ params: { locale } }: Props) {
  return (
    <article>
      <h1>隱私權政策 / Privacy Policy</h1>
      <p>本網站不需要登入，不收集任何個人資料。</p>
      <p>Cloudflare 可能會記錄基本存取日誌（如 IP 位址），詳見 <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Cloudflare 隱私權政策</a>。</p>
      <hr />
      <p>This site does not require login and does not collect any personal data.</p>
      <p>Cloudflare may log basic access data (e.g., IP addresses). See the <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Cloudflare Privacy Policy</a> for details.</p>
    </article>
  );
}
