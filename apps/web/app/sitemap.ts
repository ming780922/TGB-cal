export const runtime = 'edge';

import type { MetadataRoute } from 'next';
import { getRequestContext } from '@cloudflare/next-on-pages';

const BASE_URL = 'https://tgb.ming060.com';

interface TeamRow {
  tid: string;
  updated_at: number;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rootPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/zh-Hant`, lastModified: new Date() },
    { url: `${BASE_URL}/en`, lastModified: new Date() },
  ];

  try {
    const { env } = getRequestContext();
    const db = (env as { DB: D1Database }).DB;

    const result = await db
      .prepare('SELECT tid, updated_at FROM teams')
      .all<TeamRow>();

    const teams = result.results ?? [];

    return [
      ...rootPages,
      ...teams.flatMap((team) => [
        {
          url: `${BASE_URL}/zh-Hant/team/${team.tid}`,
          lastModified: new Date(team.updated_at * 1000),
        },
        {
          url: `${BASE_URL}/en/team/${team.tid}`,
          lastModified: new Date(team.updated_at * 1000),
        },
      ]),
    ];
  } catch {
    return rootPages;
  }
}
