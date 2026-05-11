export const runtime = 'edge';

import Link from 'next/link';
import { GlassCard } from '@/components/GlassCard';

type Props = { params: { locale: string } };

export async function generateMetadata({ params: { locale } }: Props) {
  return {
    title: locale === 'zh-Hant' ? '使用條款 | TGB iCal' : 'Terms of Use | TGB iCal',
  };
}

const ZH_BODY: [string, string][] = [
  ['服務範圍', 'TGB 行事曆提供球隊賽程查詢與訂閱服務。所有賽程資訊由各聯盟主辦方提供，我們盡力確保正確，但不保證完全無誤。'],
  ['使用規範', '請勿利用本服務進行任何違法、騷擾或破壞性的行為。我們保留隨時暫停服務的權利。'],
  ['訂閱連結', '訂閱用的 .ics 連結為公開連結。請自行斟酌分享對象。'],
  ['免責聲明', '比賽時間、地點等資訊可能臨時調整，請以聯盟官方公告為準。'],
  ['條款變更', '我們可能不定期更新本條款，變更後將在此頁公告。持續使用即視為同意新條款。'],
];

const EN_BODY: [string, string][] = [
  ['Scope', 'TGB Calendar provides team schedule lookup and subscription. Schedule data is supplied by leagues; we strive for accuracy but make no warranty.'],
  ['Acceptable use', 'Do not use the service for unlawful, harassing, or disruptive activity. We may suspend service at any time.'],
  ['Subscription URLs', '.ics URLs are public links. Share at your own discretion.'],
  ['Disclaimer', 'Game times and venues may change. The league\'s official announcement prevails.'],
  ['Changes', 'We may update these terms occasionally. Continued use constitutes acceptance.'],
];

export default function TermsPage({ params: { locale } }: Props) {
  const isZh = locale === 'zh-Hant';
  const body = isZh ? ZH_BODY : EN_BODY;
  const title = isZh ? '使用條款' : 'Terms of Use';
  const updated = isZh ? '最後更新：2026 年 5 月 1 日' : 'Last updated: May 1, 2026';
  const backLabel = isZh ? '返回首頁' : 'Back to home';

  return (
    <div className="px-5 pt-5 pb-8">
      <Link
        href={`/${locale}`}
        className="font-mono text-[11px] text-[#5b6478] mb-5 inline-block"
      >
        <span aria-hidden="true">← </span>{backLabel}
      </Link>

      <h1 className="text-[24px] font-bold text-[#0d1426] mb-1">{title}</h1>
      <p className="font-mono text-[10px] text-[#9ba3b4] mb-6">{updated}</p>

      <div className="flex flex-col gap-4">
        {body.map(([heading, paragraph]) => (
          <GlassCard key={heading} className="px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1 h-4 rounded-full bg-[#3b6dff] shrink-0" aria-hidden="true" />
              <h2 className="text-[14px] font-semibold text-[#0d1426]">{heading}</h2>
            </div>
            <p className="text-[13px] text-[#5b6478] leading-[1.6]">{paragraph}</p>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
