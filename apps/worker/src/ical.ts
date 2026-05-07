import { getVenueAddress } from './venue-map';

export interface GameRow {
  game_id: number;
  level_id: number;
  home_tid: number | null;
  away_tid: number | null;
  home_name: string | null;
  away_name: string | null;
  scheduled_at: number;
  venue: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string;
  ical_sequence: number;
  gid: number;
  league_name: string;
  name: string;
}

export interface TeamInfo {
  tid: number;
  name: string;
}

const CRLF = '\r\n';

function foldLine(line: string): string {
  // RFC 5545: fold lines longer than 75 octets
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;

  let result = '';
  let currentLineBytes = 0;
  let currentLine = '';
  const chars = [...line]; // handle multi-byte characters

  for (const char of chars) {
    const charBytes = encoder.encode(char).length;
    if (currentLineBytes + charBytes > 75 && currentLine.length > 0) {
      result += currentLine + CRLF + ' ';
      currentLine = char;
      currentLineBytes = 1 + charBytes; // 1 for the leading space
    } else {
      currentLine += char;
      currentLineBytes += charBytes;
    }
  }
  result += currentLine;
  return result;
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function formatTaipei(timestamp: number): string {
  // Convert Unix timestamp to YYYYMMDDTHHmmSS in Asia/Taipei (UTC+8)
  const d = new Date((timestamp + 8 * 3600) * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
}

function addHour(timestamp: number): string {
  // localTime: YYYYMMDDTHHmmSS, add 1 hour
  return formatTaipei(timestamp + 3600);
}

function nowUtc(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}

export function generateIcal(team: TeamInfo, games: GameRow[]): string {
  const lines: string[] = [];

  const add = (line: string) => lines.push(foldLine(line));

  add('BEGIN:VCALENDAR');
  add('VERSION:2.0');
  add('PRODID:-//ming060//TGB Calendar//ZH');
  add(`X-WR-CALNAME:${escapeText(team.name)} 賽程`);
  add('X-WR-TIMEZONE:Asia/Taipei');
  add('CALSCALE:GREGORIAN');
  add('METHOD:PUBLISH');

  // VTIMEZONE for Asia/Taipei (CST, UTC+8, no DST)
  add('BEGIN:VTIMEZONE');
  add('TZID:Asia/Taipei');
  add('BEGIN:STANDARD');
  add('DTSTART:19700101T000000');
  add('TZNAME:CST');
  add('TZOFFSETFROM:+0800');
  add('TZOFFSETTO:+0800');
  add('END:STANDARD');
  add('END:VTIMEZONE');

  for (const game of games) {
    const uid = `game-${game.game_id}@tgb.ming060.com`;
    const dtstamp = nowUtc();
    const dtstart = formatTaipei(game.scheduled_at);
    const dtend = addHour(game.scheduled_at);

    const homeName = game.home_name ?? '???';
    const awayName = game.away_name ?? '???';

    let summary: string;
    if (game.status === 'completed' && game.home_score !== null && game.away_score !== null) {
      summary = `${homeName} ${game.home_score} - ${game.away_score} ${awayName}`;
    } else {
      summary = `${homeName} vs ${awayName}`;
    }

    const fullAddress = getVenueAddress(game.venue);
    const location = fullAddress
      ? `${fullAddress} (${game.venue})`
      : (game.venue ?? '');

    const divisionLine = [game.league_name, game.name].filter(Boolean).join(' ');
    const tgbUrl = `https://tgbleague.com/division.php?gid=${game.gid}&level_id=${game.level_id}`;
    const description = `${escapeText(divisionLine)}\\n${tgbUrl}`;

    add('BEGIN:VEVENT');
    add(`UID:${uid}`);
    add(`SEQUENCE:${game.ical_sequence}`);
    add(`DTSTAMP:${dtstamp}`);
    add(`DTSTART;TZID=Asia/Taipei:${dtstart}`);
    add(`DTEND;TZID=Asia/Taipei:${dtend}`);
    add(`SUMMARY:${escapeText(summary)}`);
    if (location) add(`LOCATION:${escapeText(location)}`);
    add(`DESCRIPTION:${description}`);
    add(`URL:${tgbUrl}`);
    add('END:VEVENT');
  }

  add('END:VCALENDAR');

  return lines.join(CRLF) + CRLF;
}
