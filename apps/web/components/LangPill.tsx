'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';

export function LangPill() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale;
  const pathname = usePathname();
  const router = useRouter();

  const toggle = () => {
    const next = locale === 'zh-Hant' ? 'en' : 'zh-Hant';
    const newPath = pathname.replace(`/${locale}`, `/${next}`);
    router.push(newPath);
  };

  return (
    <button
      onClick={toggle}
      type="button"
      className="bg-[rgba(255,255,255,0.65)] border border-[rgba(255,255,255,0.9)] rounded-full px-[10px] py-1 font-mono text-[10px] backdrop-blur-xl leading-none"
    >
      <span className={locale === 'zh-Hant' ? 'text-[#3b6dff]' : 'text-[#9ba3b4]'}>中</span>
      <span className="text-[#9ba3b4]"> · </span>
      <span className={locale === 'en' ? 'text-[#3b6dff]' : 'text-[#9ba3b4]'}>EN</span>
    </button>
  );
}
