import { describe, expect, it } from 'vitest';
import { buildTonightQueue, discoverReadyCards, isGeneralExpired } from './buildTonightQueue';
import { emptyAppState, type BuiltContent, type Card } from '../types';
import { ladderScheduler } from '../scheduler/ladder';
import { addDays } from '../utils/date';

function card(partial: Partial<Card> & { id: string }): Card {
  return {
    type: 'qa',
    level: 'recall',
    tier: 'core',
    status: 'ready',
    origin: 'user-studied',
    retired: false,
    question: partial.id,
    answer: 'a',
    estSeconds: 60,
    ...partial,
  };
}

function miniContent(cards: Card[]): BuiltContent {
  return {
    subjects: [{ id: 'ds', name: '数据结构', color: '#5B8DEF' }],
    days: [
      {
        date: '2026-10-27',
        summary: 't',
        topics: [
          {
            id: 'topic-a',
            subject: 'ds',
            title: '主题A',
            selfAssessment: 'x',
            sources: [{ label: 'x' }],
            freeRecallPrompt: '回忆一下',
            freeRecallEstSeconds: 90,
            notesEstSeconds: 60,
            notes: 'notes',
            cards,
          },
        ],
      },
    ],
    cardsById: Object.fromEntries(cards.map((c) => [c.id, c])),
    topicByCardId: Object.fromEntries(
      cards.map((c) => [c.id, { topicId: 'topic-a', topicTitle: '主题A', date: '2026-10-27', subject: 'ds' }]),
    ),
  };
}

describe('buildTonightQueue', () => {
  it('预算含自由回忆并超额顺延', () => {
    const cards = [
      card({ id: 'a', estSeconds: 600 }),
      card({ id: 'b', estSeconds: 30 }),
    ];
    const content = miniContent(cards);
    const state = emptyAppState();
    discoverReadyCards(state, content, '2026-10-27');
    const q = buildTonightQueue({
      content,
      state,
      studyDate: '2026-10-27',
      budgetMinutes: 10, // 600s；自由回忆最多 20%=120，装不下 90+60
    });
    // 自由回忆 150 > 120 → 未安排
    expect(q.unfinishedFreeRecall.length).toBe(1);
    expect(q.freeRecall.length).toBe(0);
    // 剩余 600，可装 b(30)，a(600) 刚好或顺延
    expect(q.cards.some((c) => c.cardId === 'b')).toBe(true);
  });

  it('一般卡第四天转档案，第三天仍可复习', () => {
    const g = card({ id: 'g1', tier: 'general', estSeconds: 30 });
    const content = miniContent([g]);
    const state = emptyAppState();
    state.cards.g1 = ladderScheduler.initial(g, '2026-10-25');
    expect(isGeneralExpired('2026-10-25', '2026-10-28')).toBe(true);
    const day3 = buildTonightQueue({ content, state, studyDate: '2026-10-27', budgetMinutes: 30 });
    expect(day3.cards.some((c) => c.cardId === 'g1')).toBe(true);
    const day4 = buildTonightQueue({ content, state, studyDate: '2026-10-28', budgetMinutes: 30 });
    expect(day4.cards.some((c) => c.cardId === 'g1')).toBe(false);
    expect(day4.archivedGeneral.some((a) => a.cardId === 'g1')).toBe(true);
  });

  it('暂停、废弃、待核对不出题', () => {
    const cards = [
      card({ id: 'ok' }),
      card({ id: 'sus' }),
      card({ id: 'ret', retired: true }),
      card({ id: 'draft', status: 'needs-review' }),
    ];
    const content = miniContent(cards);
    const state = emptyAppState();
    discoverReadyCards(state, content, '2026-10-27');
    state.suspended.push('sus');
    const q = buildTonightQueue({ content, state, studyDate: '2026-10-27', budgetMinutes: 30 });
    const ids = q.cards.map((c) => c.cardId);
    expect(ids).toContain('ok');
    expect(ids).not.toContain('sus');
    expect(ids).not.toContain('ret');
    expect(ids).not.toContain('draft');
  });

  it('排序：遗忘优先于其他到期', () => {
    const cards = [card({ id: 'normal' }), card({ id: 'forgot' })];
    const content = miniContent(cards);
    const state = emptyAppState();
    discoverReadyCards(state, content, '2026-10-27');
    state.cards.normal = {
      ...state.cards.normal,
      reps: 1,
      lastRating: 3,
      due: '2026-10-27',
      step: 2,
    };
    state.cards.forgot = {
      ...state.cards.forgot,
      reps: 1,
      lastRating: 1,
      due: '2026-10-26',
      step: 1,
      lapses: 1,
    };
    const q = buildTonightQueue({ content, state, studyDate: '2026-10-27', budgetMinutes: 30 });
    expect(q.cards[0].cardId).toBe('forgot');
  });

  it('历史补录以首次资格日入队', () => {
    const c = card({ id: 'old' });
    const content = miniContent([c]);
    // 内容日期很旧，但今日才 discover
    content.days[0].date = '2026-09-01';
    content.topicByCardId.old.date = '2026-09-01';
    const state = emptyAppState();
    discoverReadyCards(state, content, '2026-10-27');
    expect(state.cards.old.firstEligibleOn).toBe('2026-10-27');
    const q = buildTonightQueue({ content, state, studyDate: '2026-10-27', budgetMinutes: 30 });
    expect(q.cards.some((x) => x.cardId === 'old')).toBe(true);
  });
});

void addDays;
