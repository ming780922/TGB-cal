'use client';

import { useState } from 'react';

interface CopyButtonProps {
  url: string;
  label: string;
  copiedLabel: string;
}

export default function CopyButton({ url, label, copiedLabel }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="flex-1 font-mono text-[10px] text-[#9ba3b4] truncate">{url}</span>
      <button
        onClick={handleCopy}
        type="button"
        className="font-mono text-[10px] font-semibold shrink-0 transition-colors"
        style={{ color: copied ? '#3b6dff' : '#5b6478' }}
      >
        {copied ? `✓ ${copiedLabel}` : label.toUpperCase()}
      </button>
    </div>
  );
}
