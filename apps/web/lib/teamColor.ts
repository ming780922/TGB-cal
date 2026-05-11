const PALETTE = [
  '#3b6dff',
  '#7a4dff',
  '#0ea5e9',
  '#f97316',
  '#f43f5e',
  '#f59e0b',
  '#10b981',
  '#6366f1',
  '#ec4899',
  '#14b8a6',
];

export function getTeamColor(tid: number): string {
  return PALETTE[Math.abs(tid) % PALETTE.length];
}
