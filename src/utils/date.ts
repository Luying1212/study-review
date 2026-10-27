import type { AppSettings } from '../types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 在指定时区把瞬时转为「墙钟」部件 */
export function zonedParts(isoOrDate: Date | string, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isValidYmd(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 按日历日期加天（不用固定毫秒） */
export function addDays(ymd: string, days: number): string {
  if (!isValidYmd(ymd)) throw new Error(`非法日期: ${ymd}`);
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function diffDays(a: string, b: string): number {
  if (!isValidYmd(a) || !isValidYmd(b)) throw new Error(`非法日期差: ${a} / ${b}`);
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const aMs = Date.UTC(ay, am - 1, ad);
  const bMs = Date.UTC(by, bm - 1, bd);
  return Math.round((aMs - bMs) / 86_400_000);
}

/**
 * 学习日：默认 Asia/Shanghai 凌晨 dayStartHour 换日。
 * 例如 dayStartHour=4 时，10-27 03:59 仍属 10-26。
 */
export function studyDateOf(
  now: Date | string,
  settings: Pick<AppSettings, 'dayStartHour' | 'timeZone'> = {
    dayStartHour: 4,
    timeZone: 'Asia/Shanghai',
  },
): string {
  const p = zonedParts(now, settings.timeZone);
  let ymd = formatYmd(p.year, p.month, p.day);
  if (p.hour < settings.dayStartHour) {
    ymd = addDays(ymd, -1);
  }
  return ymd;
}

export function compareYmd(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
