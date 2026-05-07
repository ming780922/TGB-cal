'use client';

import { useEffect, useState } from 'react';

interface Props {
  timestamp: number;
}

/**
 * Renders a Unix timestamp in the user's local time zone.
 * Uses a Client Component to avoid hydration mismatches between server and browser timezones.
 */
export default function LocalDate({ timestamp }: Props) {
  const [formatted, setFormatted] = useState<string>('');

  useEffect(() => {
    const date = new Date(timestamp * 1000);
    
    // Format: YYYY/MM/DD HH:mm (consistent style, local time)
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    
    setFormatted(`${y}/${m}/${d} ${hh}:${mm}`);
  }, [timestamp]);

  if (!formatted) {
    // Show nothing or a space during hydration to prevent jumpy layout
    return <span aria-hidden="true">&nbsp;</span>;
  }

  return <span>{formatted}</span>;
}
