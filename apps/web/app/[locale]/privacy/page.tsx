export const runtime = 'edge';

import Link from 'next/link';
import { GlassCard } from '@/components/GlassCard';

type Props = { params: { locale: string } };

export async function generateMetadata({ params: { locale } }: Props) {
  return {
    title: locale === 'zh-Hant' ? '隱私權政策 | TGB iCal' : 'Privacy Policy | TGB iCal',
  };
}

const ZH_BODY: [string, string][] = [
  ['我們收集的資料', 'TGB 行事曆只儲存球隊、聯盟與賽程等公開資訊。我們不會在沒有你同意的情況下儲存個人識別資料。'],
  ['訂閱機制', '當你訂閱球隊賽程時，我們提供一個 .ics 連結。你的行事曆 App 會定期向 tgb.ming060.com 拉取最新資料，我們會記錄基本的存取紀錄（IP、時間）以維持服務品質。'],
  ['Cookies', '我們僅使用功能性 Cookies（例如語言偏好設定），不使用追蹤或廣告 Cookies。'],
  ['資料分享', '我們不會向第三方販售或分享你的資料。'],
  ['聯絡我們', '若有任何隱私權相關問題，請聯絡 privacy@tgb.ming060.com。'],
];

const EN_BODY: [string, string][] = [
  ['What we collect', 'TGB Calendar stores only public information about teams, leagues, and schedules. We do not store personal data without consent.'],
  ['Subscription mechanics', 'When you subscribe, we provide a .ics URL. Your calendar app periodically fetches updates from tgb.ming060.com — we keep basic access logs (IP, timestamp) to ensure service quality.'],
  ['Cookies', 'We only use functional cookies (e.g. language preference). No tracking or advertising cookies.'],
  ['Data sharing', 'We do not sell or share your data with third parties.'],
  ['Contact', 'For privacy questions, please contact privacy@tgb.ming060.com.'],
];

export default function PrivacyPage({ params: { locale } }: Props) {
  const isZh = locale === 'zh-Hant';
  const body = isZh ? ZH_BODY : EN_BODY;
  const title = isZh ? '隱私權政策' : 'Privacy Policy';
  const updated = isZh ? '最後更新：2026 年 5 月 1 日' : 'Last updated: May 1, 2026';
  const backLabel = isZh ? '返回首頁' : 'Back to home';

  return (
    <div className="px-5 pt-5 pb-8">
      <Link
        href={`/${locale}`}
        className="font-mono text-[11px] text-[#5b6478] mb-5 inline-block"
      >
        ← {backLabel}
      </Link>

      <h1 className="text-[24px] font-bold text-[#0d1426] mb-1">{title}</h1>
      <p className="font-mono text-[10px] text-[#9ba3b4] mb-6">{updated}</p>

      <div className="flex flex-col gap-4">
        {body.map(([heading, paragraph]) => (
          <GlassCard key={heading} className="px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1 h-4 rounded-full bg-[#3b6dff] shrink-0" />
              <h2 className="text-[14px] font-semibold text-[#0d1426]">{heading}</h2>
            </div>
            <p className="text-[13px] text-[#5b6478] leading-[1.6]">{paragraph}</p>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
