import { describe, expect, it } from 'vitest';
import { applyRating, createSession, undoLast } from './session';
import { emptyAppState, type BuiltContent } from '../types';
import { buildTonightQueue, discoverReadyCards } from '../queue/buildTonightQueue';

const content: BuiltContent = {
  subjects: [{ id: 'ds', name: 'DS', color: '#fff' }],
  days: [
    {
      date: '2026-10-27',
      summary: 's',
      topics: [
        {
          id: 't1',
          subject: 'ds',
          title: 'T',
          selfAssessment: 'x',
          sources: [{ label: 'x' }],
          freeRecallPrompt: 'p',
          freeRecallEstSeconds: 10,
          notesEstSeconds: 10,
          notes: 'n',
          cards: [
            {
              id: 'c1',
              type: 'qa',
              level: 'recall',
              tier: 'core',
              status: 'ready',
              origin: 'user-studied',
              retired: false,
              question: 'Q',
              answer: 'A',
              estSeconds: 30,
            },
          ],
        },
      ],
    },
  ],
  cardsById: {
    c1: {
      id: 'c1',
      type: 'qa',
      level: 'recall',
      tier: 'core',
      status: 'ready',
      origin: 'user-studied',
      retired: false,
      question: 'Q',
      answer: 'A',
      estSeconds: 30,
    },
  },
  topicByCardId: {
    c1: { topicId: 't1', topicTitle: 'T', date: '2026-10-27', subject: 'ds' },
  },
};

describe('session rating idempotency', () => {
  it('同一 actionId 不重复评分；撤销标记 void', () => {
    const state = emptyAppState();
    discoverReadyCards(state, content, '2026-10-27');
    const queue = buildTonightQueue({ content, state, studyDate: '2026-10-27', budgetMinutes: 30 });
    let ui = createSession(queue, '2026-10-27');
    ui.phase = 'cards';
    ui.answerRevealed = true;

    const first = applyRating({
      state,
      content,
      ui,
      cardId: 'c1',
      rating: 3,
      kind: 'scheduled',
      actionId: 'act-1',
    });
    expect(first.duplicate).toBe(false);
    expect(first.state.logs).toHaveLength(1);

    const dup = applyRating({
      state: first.state,
      content,
      ui: first.ui,
      cardId: 'c1',
      rating: 4,
      kind: 'scheduled',
      actionId: 'act-1',
    });
    expect(dup.duplicate).toBe(true);
    expect(dup.state.logs).toHaveLength(1);

    const undone = undoLast(first.state, first.ui);
    expect(undone.state.logs[0].voidedAt).toBeTruthy();
    expect(undone.state.cards.c1.reps).toBe(0);
  });
});
