import { describe, expect, it } from 'vitest';
import {
  LADDER,
  MAX_STEP,
  applyGeneralFirstRating,
  ladderScheduler,
  markRelearned,
  promoteCompletedOrExpiredGeneral,
  ratingIntervalDays,
} from './ladder';
import type { Card } from '../types';

const card: Card = {
  id: 'c1',
  type: 'qa',
  level: 'recall',
  tier: 'core',
  status: 'ready',
  origin: 'user-studied',
  retired: false,
  question: 'q',
  answer: 'a',
  estSeconds: 40,
};

const ctx = {
  now: '2026-10-27T12:00:00.000Z',
  studyDate: '2026-10-27',
  timeZone: 'Asia/Shanghai',
};

describe('ladderScheduler', () => {
  it('四种评分的 step/due', () => {
    const s0 = ladderScheduler.initial(card, '2026-10-27');
    const forget = ladderScheduler.next(s0, 1, ctx);
    expect(forget.step).toBe(1);
    expect(forget.due).toBe('2026-10-28');
    expect(forget.lapses).toBe(1);

    const hard = ladderScheduler.next({ ...s0, step: 3 }, 2, ctx);
    expect(hard.step).toBe(3);
    expect(ratingIntervalDays(3, 2)).toBe(4); // LADDER[3]=7 → round(3.5)=4
    expect(hard.due).toBe('2026-10-31');

    const good = ladderScheduler.next({ ...s0, step: 2 }, 3, ctx);
    expect(good.step).toBe(3);
    expect(good.due).toBe('2026-11-03'); // +7

    const easy = ladderScheduler.next({ ...s0, step: 2 }, 4, ctx);
    expect(easy.step).toBe(4);
    expect(easy.due).toBe('2026-11-10'); // +14
  });

  it('step 上限', () => {
    const s = { ...ladderScheduler.initial(card, '2026-10-27'), step: MAX_STEP };
    const next = ladderScheduler.next(s, 4, ctx);
    expect(next.step).toBe(MAX_STEP);
    expect(next.due).toBe('2027-02-24'); // +120
    expect(LADDER[MAX_STEP]).toBe(120);
  });

  it('一般卡首次评分 due=null', () => {
    const s0 = ladderScheduler.initial(card, '2026-10-27');
    const next = applyGeneralFirstRating(s0, 3, ctx);
    expect(next.due).toBeNull();
    expect(next.reps).toBe(1);
    expect(next.firstCompletedOn).toBe('2026-10-27');
  });

  it('升级已完成一般卡', () => {
    const s = applyGeneralFirstRating(ladderScheduler.initial(card, '2026-10-25'), 3, {
      ...ctx,
      studyDate: '2026-10-25',
    });
    const promoted = promoteCompletedOrExpiredGeneral(s, '2026-10-27');
    expect(promoted.step).toBe(1);
    expect(promoted.due).toBe('2026-10-28');
  });

  it('标记重学保留 lapses', () => {
    const s = ladderScheduler.next(ladderScheduler.initial(card, '2026-10-20'), 1, {
      ...ctx,
      studyDate: '2026-10-20',
    });
    const re = markRelearned(s, '2026-10-27', ctx.now);
    expect(re.lapses).toBe(1);
    expect(re.relearnedAt).toBe(ctx.now);
    expect(re.step).toBe(1);
    expect(re.due).toBe('2026-10-28');
  });
});
