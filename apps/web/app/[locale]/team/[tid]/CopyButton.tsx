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
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={handleCopy} type="button">
      {copied ? copiedLabel : label}
    </button>
  );
}
