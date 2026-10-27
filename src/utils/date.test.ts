import { describe, expect, it } from 'vitest';
import { addDays, studyDateOf, diffDays } from './date';

describe('studyDateOf', () => {
  const settings = { dayStartHour: 4, timeZone: 'Asia/Shanghai' };

  it('凌晨 3 点属前一天', () => {
    // 2026-10-27 03:00 Asia/Shanghai = 2026-10-26 19:00 UTC
    expect(studyDateOf('2026-10-26T19:00:00.000Z', settings)).toBe('2026-10-26');
  });

  it('凌晨 4 点换日', () => {
    // 2026-10-27 04:00 Asia/Shanghai = 2026-10-26 20:00 UTC
    expect(studyDateOf('2026-10-26T20:00:00.000Z', settings)).toBe('2026-10-27');
  });
});

describe('addDays', () => {
  it('跨月加日', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('diffDays', () => {
  it('计算逾期天数', () => {
    expect(diffDays('2026-10-28', '2026-10-26')).toBe(2);
  });
});
