'use client';

import { Share2 } from 'lucide-react';

interface ShareButtonProps {
  label: string;
}

export function ShareButton({ label }: ShareButtonProps) {
  const handleShare = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ url: window.location.href });
      } catch {
        // user cancelled or not supported
      }
    } else {
      await navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
  };

  return (
    <button
      onClick={handleShare}
      type="button"
      className="font-mono text-[11px] text-[#5b6478] flex items-center gap-1"
    >
      <Share2 size={13} />
      {label}
    </button>
  );
}
