// Venue address map: short name → full address
// NOTE: Verify each address against Google Maps before production deployment (constitution requirement)
export const VENUE_MAP: Record<string, string> = {
  '和平籃球館': '台北市大安區和平東路一段183號',
  '信義國中': '台北市信義區基隆路一段95號',
  '板橋體育館': '新北市板橋區莊敬路62號',
  '中正體育館': '台北市中正區汀州路三段2號',
  '永和體育館': '新北市永和區永和路二段128號',
};

export function getVenueAddress(venueName: string | null): string | null {
  if (!venueName) return null;
  return VENUE_MAP[venueName.trim()] ?? null;
}
