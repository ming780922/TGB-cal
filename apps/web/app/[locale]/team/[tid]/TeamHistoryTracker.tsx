'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'tgb_recent_teams';
const MAX_ITEMS = 10;

export type RecentTeam = { tid: number; name: string; leagueName: string };

export function TeamHistoryTracker({ tid, name, leagueName }: RecentTeam) {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const existing: RecentTeam[] = raw ? JSON.parse(raw) : [];
      const filtered = existing.filter(t => t.tid !== tid);
      const updated = [{ tid, name, leagueName }, ...filtered].slice(0, MAX_ITEMS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }, [tid, name, leagueName]);

  return null;
}
