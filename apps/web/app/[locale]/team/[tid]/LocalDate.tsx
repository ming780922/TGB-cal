'use client';

import { useEffect, useState } from 'react';

interface Props {
  timestamp: number;
  part?: 'date' | 'time';
}

export default function LocalDate({ timestamp, part }: Props) {
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    const d = new Date(timestamp * 1000);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    setDate(`${m}/${day}`);
    setTime(`${hh}:${mm}`);
  }, [timestamp]);

  if (!date) return <span aria-hidden="true">&nbsp;</span>;

  if (part === 'date') return <span>{date}</span>;
  if (part === 'time') return <span>{time}</span>;
  return <span>{date} {time}</span>;
}
