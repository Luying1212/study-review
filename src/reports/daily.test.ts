import { describe, expect, it } from 'vitest';
import { buildDailyReport, isLeech } from './daily';
import { emptyAppState, type BuiltContent, type ReviewLog } from '../types';

const content: BuiltContent = {
  subjects: [{ id: 'ds', name: 'DS', color: '#fff' }],
  days: [],
  cardsById: {
    c1: {
      id: 'c1',
      type: 'qa',
      level: 'recall',
      tier: 'core',
      status: 'ready',
      origin: 'user-studied',
      retired: false,
      question: 'Q1',
      answer: 'A',
      estSeconds: 40,
    },
  },
  topicByCardId: {
    c1: { topicId: 't1', topicTitle: 'T', date: '2026-10-20', subject: 'ds' },
  },
};

function log(partial: Partial<ReviewLog> & Pick<ReviewLog, 'id' | 'studyDate' | 'rating' | 'kind'>): ReviewLog {
  return {
    sessionId: 's',
    cardId: 'c1',
    ts: `${partial.studyDate}T12:00:00.000Z`,
    usedHint: false,
    viewedNotesBeforeAnswer: false,
    elapsedMs: 1000,
    ...partial,
  };
}

describe('leech & report', () => {
  it('leech 按不同学习日判断，补练/撤销不计', () => {
    const state = emptyAppState();
    state.cards.c1 = {
      step: 1,
      due: '2026-10-27',
      firstEligibleOn: '2026-10-10',
      reps: 3,
      lapses: 3,
    };
    state.logs = [
      log({ id: '1', studyDate: '2026-10-20', rating: 1, kind: 'scheduled' }),
      log({ id: '2', studyDate: '2026-10-22', rating: 1, kind: 'scheduled' }),
      log({ id: '3', studyDate: '2026-10-24', rating: 1, kind: 'scheduled' }),
      log({ id: 'r', studyDate: '2026-10-24', rating: 1, kind: 'retry' }),
      log({ id: 'v', studyDate: '2026-10-25', rating: 1, kind: 'scheduled', voidedAt: 'x' }),
    ];
    expect(isLeech('c1', state, '2026-10-27')).toBe(true);

    state.logs = [
      log({ id: '1', studyDate: '2026-10-20', rating: 1, kind: 'scheduled' }),
      log({ id: '2', studyDate: '2026-10-22', rating: 1, kind: 'scheduled' }),
      log({ id: 'r1', studyDate: '2026-10-22', rating: 1, kind: 'retry' }),
      log({ id: 'r2', studyDate: '2026-10-22', rating: 1, kind: 'retry' }),
    ];
    expect(isLeech('c1', state, '2026-10-27')).toBe(false);
  });

  it('重学后重新起算但历史保留', () => {
    const state = emptyAppState();
    state.cards.c1 = {
      step: 1,
      due: '2026-10-28',
      firstEligibleOn: '2026-10-10',
      reps: 4,
      lapses: 3,
      relearnedAt: '2026-10-26T00:00:00.000Z',
    };
    state.logs = [
      log({ id: '1', studyDate: '2026-10-20', rating: 1, kind: 'scheduled', ts: '2026-10-20T12:00:00.000Z' }),
      log({ id: '2', studyDate: '2026-10-22', rating: 1, kind: 'scheduled', ts: '2026-10-22T12:00:00.000Z' }),
      log({ id: '3', studyDate: '2026-10-24', rating: 1, kind: 'scheduled', ts: '2026-10-24T12:00:00.000Z' }),
    ];
    expect(isLeech('c1', state, '2026-10-27')).toBe(false);
    expect(state.logs.length).toBe(3);
  });

  it('首次忘记后补练成功仍列需重学并另列补练', () => {
    const state = emptyAppState();
    state.cards.c1 = {
      step: 1,
      due: '2026-10-28',
      firstEligibleOn: '2026-10-27',
      reps: 1,
      lapses: 1,
      lastRating: 1,
    };
    state.sessions = [
      {
        id: 's1',
        studyDate: '2026-10-27',
        startedAt: '2026-10-27T12:00:00.000Z',
        activeMs: 60000,
        status: 'completed',
        freeRecall: [],
        notesViews: [],
        completedCardIds: ['c1'],
      },
    ];
    state.logs = [
      log({ id: '1', studyDate: '2026-10-27', rating: 1, kind: 'scheduled' }),
      log({ id: '2', studyDate: '2026-10-27', rating: 3, kind: 'retry' }),
    ];
    const report = buildDailyReport({ state, content, studyDate: '2026-10-27' });
    expect(report.relearn.some((r) => r.cardId === 'c1')).toBe(true);
    expect(report.retryCount).toBe(1);
    expect(report.uniqueCompletedCards).toBe(1);
    expect(report.smooth.some((r) => r.cardId === 'c1')).toBe(false);
  });
});
