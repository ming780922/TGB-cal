import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { LangPill } from './LangPill';
import { ShareButton } from './ShareButton';

interface TopBarHomeProps {
  variant: 'home';
}

interface TopBarTeamProps {
  variant: 'team';
  locale: string;
  backLabel: string;
  shareLabel: string;
}

type TopBarProps = TopBarHomeProps | TopBarTeamProps;

export function TopBar(props: TopBarProps) {
  return (
    <div className="flex items-center justify-between px-5 pt-[14px]">
      <div>
        {props.variant === 'team' && (
          <Link
            href={`/${props.locale}`}
            className="font-mono text-[11px] text-[#5b6478] flex items-center gap-0.5"
          >
            <ChevronLeft size={14} />
            {props.backLabel}
          </Link>
        )}
      </div>
      <div>
        {props.variant === 'home' ? (
          <LangPill />
        ) : (
          <ShareButton label={props.shareLabel} />
        )}
      </div>
    </div>
  );
}
