import Link from 'next/link';

interface FooterProps {
  locale: string;
}

export function Footer({ locale }: FooterProps) {
  const isZh = locale === 'zh-Hant';
  return (
    <footer className="flex items-center justify-between px-5 py-4 font-mono text-[10px] text-[#9ba3b4]">
      <span>v1.0 · tgb.ming060.com</span>
      <div className="flex gap-3">
        <Link href={`/${locale}/privacy`} className="underline underline-offset-2">
          {isZh ? '隱私權' : 'Privacy'}
        </Link>
        <Link href={`/${locale}/terms`} className="underline underline-offset-2">
          {isZh ? '使用條款' : 'Terms'}
        </Link>
      </div>
    </footer>
  );
}
