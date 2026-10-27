import type {
  AppState,
  BuiltContent,
  Card,
  CardState,
  DayContent,
  Topic,
} from '../types';
import { addDays, compareYmd, diffDays } from '../utils/date';
import { ladderScheduler } from '../scheduler/ladder';

export interface QueueCardItem {
  kind: 'card';
  cardId: string;
  topicId: string;
  subject: string;
  estSeconds: number;
  notesEstSeconds: number;
  priority: number;
  overdueDays: number;
  levelOrder: number;
  firstEligibleOn: string;
}

export interface QueueFreeRecallItem {
  kind: 'free-recall';
  topicId: string;
  subject: string;
  title: string;
  prompt: string;
  freeRecallEstSeconds: number;
  notesEstSeconds: number;
}

export interface TonightQueue {
  studyDate: string;
  budgetSeconds: number;
  freeRecall: QueueFreeRecallItem[];
  cards: QueueCardItem[];
  deferredCards: QueueCardItem[];
  unfinishedFreeRecall: QueueFreeRecallItem[];
  archivedGeneral: Array<{ cardId: string; topicId: string }>;
  reservedFreeRecallSeconds: number;
  reservedCardSeconds: number;
  consecutiveDeferHint: boolean;
}

const LEVEL_ORDER: Record<string, number> = { recall: 0, explain: 1, apply: 2 };

function isPromoted(state: AppState, cardId: string): boolean {
  return state.promoted.includes(cardId);
}

function effectiveTier(card: Card, state: AppState): 'core' | 'general' {
  if (card.tier === 'core' || isPromoted(state, card.id)) return 'core';
  return 'general';
}

export function generalWindowEnd(firstEligibleOn: string): string {
  return addDays(firstEligibleOn, 2);
}

export function isGeneralExpired(firstEligibleOn: string, studyDate: string): boolean {
  return compareYmd(studyDate, addDays(firstEligibleOn, 3)) >= 0;
}

export function isGeneralInWindow(firstEligibleOn: string, studyDate: string): boolean {
  return compareYmd(studyDate, firstEligibleOn) >= 0 && compareYmd(studyDate, generalWindowEnd(firstEligibleOn)) <= 0;
}

function hasScheduledHistory(cardState: CardState | undefined): boolean {
  return Boolean(cardState && cardState.reps > 0);
}

function resolveCard(
  content: BuiltContent,
  cardId: string,
): { card: Card; topicId: string; subject: string; topicTitle: string } | null {
  const card = content.cardsById[cardId];
  const meta = content.topicByCardId[cardId];
  if (!card || !meta) return null;
  return { card, topicId: meta.topicId, subject: meta.subject, topicTitle: meta.topicTitle };
}

function ensureEligible(
  state: AppState,
  cardId: string,
  studyDate: string,
  mutate: boolean,
): CardState {
  const existing = state.cards[cardId];
  if (existing) return existing;
  const initial = ladderScheduler.initial(contentStubCard(cardId), studyDate);
  if (mutate) state.cards[cardId] = initial;
  return initial;
}

function contentStubCard(id: string): Card {
  return {
    id,
    type: 'qa',
    level: 'recall',
    tier: 'core',
    status: 'ready',
    origin: 'user-studied',
    retired: false,
    question: '',
    answer: '',
    estSeconds: 60,
  };
}

/** 发现 ready 卡时写入 firstEligibleOn（调用方负责 mutate） */
export function discoverReadyCards(
  state: AppState,
  content: BuiltContent,
  studyDate: string,
): void {
  for (const cardId of Object.keys(content.cardsById)) {
    const card = content.cardsById[cardId];
    if (card.status !== 'ready' || card.retired) continue;
    if (!state.cards[cardId]) {
      state.cards[cardId] = ladderScheduler.initial(card, studyDate);
    }
  }
}

function todayTopics(content: BuiltContent, studyDate: string): Array<Topic & { date: string }> {
  const day = content.days.find((d) => d.date === studyDate);
  if (!day) return [];
  return day.topics.map((t) => ({ ...t, date: day.date }));
}

function collectCandidates(
  content: BuiltContent,
  state: AppState,
  studyDate: string,
): { cards: QueueCardItem[]; archivedGeneral: Array<{ cardId: string; topicId: string }> } {
  const cards: QueueCardItem[] = [];
  const archivedGeneral: Array<{ cardId: string; topicId: string }> = [];
  const suspended = new Set(state.suspended);

  for (const cardId of Object.keys(content.cardsById)) {
    const resolved = resolveCard(content, cardId);
    if (!resolved) continue;
    const { card, topicId, subject } = resolved;
    if (card.status !== 'ready' || card.retired) continue;
    if (suspended.has(cardId)) continue;

    const cs = state.cards[cardId] ?? ladderScheduler.initial(card, studyDate);
    const tier = effectiveTier(card, state);

    if (tier === 'general') {
      if (cs.firstCompletedOn || cs.due === null && cs.reps > 0) {
        // 已完成一般卡
        continue;
      }
      if (isGeneralExpired(cs.firstEligibleOn, studyDate)) {
        archivedGeneral.push({ cardId, topicId });
        continue;
      }
      if (!isGeneralInWindow(cs.firstEligibleOn, studyDate)) continue;
      if (cs.due && compareYmd(cs.due, studyDate) > 0) continue;

      cards.push({
        kind: 'card',
        cardId,
        topicId,
        subject,
        estSeconds: card.estSeconds || 60,
        notesEstSeconds: 0, // 填入时再按 topic 去重
        priority: 5,
        overdueDays: cs.due ? Math.max(0, diffDays(studyDate, cs.due)) : 0,
        levelOrder: LEVEL_ORDER[card.level] ?? 9,
        firstEligibleOn: cs.firstEligibleOn,
      });
      continue;
    }

    // core
    const due = cs.due ?? cs.firstEligibleOn;
    if (compareYmd(due, studyDate) > 0) continue;

    const overdueDays = Math.max(0, diffDays(studyDate, due));
    let priority = 4;
    if (hasScheduledHistory(cs) && cs.lastRating === 1) priority = 2;
    else if (hasScheduledHistory(cs)) priority = 3;
    else priority = 4;

    cards.push({
      kind: 'card',
      cardId,
      topicId,
      subject,
      estSeconds: card.estSeconds || 60,
      notesEstSeconds: 0,
      priority,
      overdueDays,
      levelOrder: LEVEL_ORDER[card.level] ?? 9,
      firstEligibleOn: cs.firstEligibleOn,
    });
  }

  cards.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.priority === 2 || a.priority === 3) {
      if (b.overdueDays !== a.overdueDays) return b.overdueDays - a.overdueDays;
    }
    if (a.priority === 4) {
      const fe = compareYmd(a.firstEligibleOn, b.firstEligibleOn);
      if (fe !== 0) return fe;
      if (a.levelOrder !== b.levelOrder) return a.levelOrder - b.levelOrder;
    }
    if (a.priority === 5) {
      if (a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays;
      const fe = compareYmd(a.firstEligibleOn, b.firstEligibleOn);
      if (fe !== 0) return fe;
    }
    return a.cardId.localeCompare(b.cardId);
  });

  return { cards, archivedGeneral };
}

function freeRecallCandidates(
  content: BuiltContent,
  studyDate: string,
): QueueFreeRecallItem[] {
  return todayTopics(content, studyDate).map((t) => ({
    kind: 'free-recall' as const,
    topicId: t.id,
    subject: t.subject,
    title: t.title,
    prompt: t.freeRecallPrompt,
    freeRecallEstSeconds: t.freeRecallEstSeconds ?? 90,
    notesEstSeconds: t.notesEstSeconds ?? 60,
  }));
}

function notesCostForTopic(
  topicId: string,
  content: BuiltContent,
  already: Set<string>,
): number {
  if (already.has(topicId)) return 0;
  for (const day of content.days) {
    const topic = day.topics.find((t) => t.id === topicId);
    if (topic) return topic.notesEstSeconds ?? 60;
  }
  return 60;
}

export function buildTonightQueue(input: {
  content: BuiltContent;
  state: AppState;
  studyDate: string;
  budgetMinutes?: number;
  /** 连续有核心卡顺延的学习日数；≥3 时提示 */
  consecutiveDeferDays?: number;
}): TonightQueue {
  const budgetMinutes = input.budgetMinutes ?? input.state.settings.budgetMinutes;
  const budgetSeconds = budgetMinutes * 60;
  const freeCap = Math.floor(budgetSeconds * 0.2);

  const { cards: allCards, archivedGeneral } = collectCandidates(
    input.content,
    input.state,
    input.studyDate,
  );

  const freeAll = freeRecallCandidates(input.content, input.studyDate);
  const selectedFree: QueueFreeRecallItem[] = [];
  const unfinishedFree: QueueFreeRecallItem[] = [];
  let freeUsed = 0;
  for (const fr of freeAll) {
    const cost = fr.freeRecallEstSeconds + fr.notesEstSeconds;
    if (freeUsed + cost <= freeCap) {
      selectedFree.push(fr);
      freeUsed += cost;
    } else {
      unfinishedFree.push(fr);
    }
  }

  let remaining = budgetSeconds - freeUsed;
  const selectedCards: QueueCardItem[] = [];
  const deferred: QueueCardItem[] = [];
  const notesTopics = new Set(selectedFree.map((f) => f.topicId));

  // 为已选自由回忆预留 notes（已计入 freeUsed）
  for (const card of allCards) {
    const notes = notesCostForTopic(card.topicId, input.content, notesTopics);
    const cost = card.estSeconds + notes;
    if (cost <= remaining) {
      selectedCards.push({ ...card, notesEstSeconds: notes });
      remaining -= cost;
      if (notes > 0) notesTopics.add(card.topicId);
    } else {
      deferred.push(card);
      // 尝试后续更短任务：继续扫描
    }
  }

  // 对 deferred 再试一次「更短任务」（已在单次扫描中跳过并继续，上面逻辑已满足）

  return {
    studyDate: input.studyDate,
    budgetSeconds,
    freeRecall: selectedFree,
    cards: selectedCards,
    deferredCards: deferred,
    unfinishedFreeRecall: unfinishedFree,
    archivedGeneral,
    reservedFreeRecallSeconds: freeUsed,
    reservedCardSeconds: budgetSeconds - freeUsed - remaining,
    consecutiveDeferHint: (input.consecutiveDeferDays ?? 0) >= 3,
  };
}

export function countNewCardsToday(days: DayContent[], studyDate: string): number {
  const day = days.find((d) => d.date === studyDate);
  if (!day) return 0;
  let n = 0;
  for (const t of day.topics) {
    n += t.cards?.length ?? 0;
  }
  return n;
}

// silence unused in tree-shaking edge — ensureEligible used by tests via discover
void ensureEligible;
