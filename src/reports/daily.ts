import type {
  AppState,
  BuiltContent,
  DailyReport,
  PerformanceItem,
  Rating,
  ReviewLog,
} from '../types';
import { addDays, compareYmd } from '../utils/date';
import { isGeneralExpired } from '../queue/buildTonightQueue';

function activeLogs(logs: ReviewLog[]): ReviewLog[] {
  return logs.filter((l) => !l.voidedAt);
}

/** 每卡每天首次未撤销的正式评分 */
export function firstScheduledByCardDate(logs: ReviewLog[]): Map<string, ReviewLog> {
  const map = new Map<string, ReviewLog>();
  const sorted = activeLogs(logs)
    .filter((l) => l.kind === 'scheduled')
    .slice()
    .sort((a, b) => a.ts.localeCompare(b.ts));
  for (const log of sorted) {
    const key = `${log.cardId}::${log.studyDate}`;
    if (!map.has(key)) map.set(key, log);
  }
  return map;
}

export function isLeech(
  cardId: string,
  state: AppState,
  studyDate: string,
): boolean {
  const since = state.cards[cardId]?.relearnedAt;
  const windowStart = addDays(studyDate, -13);
  const firsts = firstScheduledByCardDate(state.logs);
  const failDays = new Set<string>();
  for (const [, log] of firsts) {
    if (log.cardId !== cardId) continue;
    if (log.rating !== 1) continue;
    if (compareYmd(log.studyDate, windowStart) < 0) continue;
    if (compareYmd(log.studyDate, studyDate) > 0) continue;
    if (since && log.ts < since) continue;
    failDays.add(log.studyDate);
  }
  return failDays.size >= 3;
}

function itemFromLog(
  log: ReviewLog,
  content: BuiltContent,
  leech?: boolean,
): PerformanceItem {
  const meta = content.topicByCardId[log.cardId];
  const card = content.cardsById[log.cardId];
  return {
    cardId: log.cardId,
    topicId: meta?.topicId ?? 'unknown',
    topicTitle: meta?.topicTitle ?? '未知知识点',
    level: card?.level ?? 'recall',
    question: card?.question ?? log.cardId,
    rating: log.rating,
    usedHint: log.usedHint,
    viewedNotesBeforeAnswer: log.viewedNotesBeforeAnswer,
    leech,
  };
}

export function buildDailyReport(input: {
  state: AppState;
  content: BuiltContent;
  studyDate: string;
  deferredCardIds?: string[];
  unfinishedFreeRecallCount?: number;
  archivedGeneralCardIds?: string[];
}): DailyReport {
  const { state, content, studyDate } = input;
  const sessions = state.sessions.filter((s) => s.studyDate === studyDate);
  const dayLogs = activeLogs(state.logs).filter((l) => l.studyDate === studyDate);
  const firsts = firstScheduledByCardDate(state.logs);
  const dayFirsts: ReviewLog[] = [];
  for (const [key, log] of firsts) {
    if (key.endsWith(`::${studyDate}`)) dayFirsts.push(log);
  }

  const dist: Record<Rating, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const smooth: PerformanceItem[] = [];
  const consolidate: PerformanceItem[] = [];
  const relearn: PerformanceItem[] = [];

  for (const log of dayFirsts) {
    dist[log.rating] += 1;
    const leech = isLeech(log.cardId, state, studyDate);
    const item = itemFromLog(log, content, leech);
    if (log.rating === 1 || leech) {
      relearn.push(item);
    } else if (log.rating === 2 || log.usedHint || log.viewedNotesBeforeAnswer) {
      consolidate.push(item);
    } else if (log.rating >= 3) {
      smooth.push(item);
    }
  }

  // 薄弱但当日无首次评分的也列入重学建议
  for (const cardId of Object.keys(state.cards)) {
    if (isLeech(cardId, state, studyDate) && !relearn.some((r) => r.cardId === cardId)) {
      const meta = content.topicByCardId[cardId];
      const card = content.cardsById[cardId];
      relearn.push({
        cardId,
        topicId: meta?.topicId ?? 'unknown',
        topicTitle: meta?.topicTitle ?? '未知知识点',
        level: card?.level ?? 'recall',
        question: card?.question ?? cardId,
        rating: 1,
        usedHint: false,
        viewedNotesBeforeAnswer: false,
        leech: true,
      });
    }
  }

  const retries = dayLogs
    .filter((l) => l.kind === 'retry')
    .map((l) => ({
      cardId: l.cardId,
      rating: l.rating,
      question: content.cardsById[l.cardId]?.question ?? l.cardId,
    }));

  const practiceCount = dayLogs.filter((l) => l.kind === 'practice').length;
  const uniqueCompleted = new Set(dayFirsts.map((l) => l.cardId)).size;
  const activeMs = sessions.reduce((sum, s) => sum + s.activeMs, 0);

  const deferredCardIds = input.deferredCardIds ?? [];
  const archivedGeneralCardIds =
    input.archivedGeneralCardIds ??
    Object.entries(state.cards)
      .filter(([id, cs]) => {
        const card = content.cardsById[id];
        if (!card || card.tier !== 'general' || state.promoted.includes(id)) return false;
        if (cs.reps > 0) return false;
        return isGeneralExpired(cs.firstEligibleOn, studyDate);
      })
      .map(([id]) => id);

  const openIssues = state.issues.filter((i) => i.status === 'open').map((i) => i.cardId);

  // 明日到期核心卡估计（含逾期）
  const tomorrow = addDays(studyDate, 1);
  let tomorrowDue = 0;
  let generalPending = 0;
  for (const [id, cs] of Object.entries(state.cards)) {
    const card = content.cardsById[id];
    if (!card || card.retired || card.status !== 'ready') continue;
    if (state.suspended.includes(id)) continue;
    const core = card.tier === 'core' || state.promoted.includes(id);
    if (core) {
      const due = cs.due ?? cs.firstEligibleOn;
      if (compareYmd(due, tomorrow) <= 0) tomorrowDue += 1;
    } else if (cs.reps === 0 && !isGeneralExpired(cs.firstEligibleOn, tomorrow)) {
      generalPending += 1;
    }
  }

  return {
    studyDate,
    sessionCount: sessions.length,
    uniqueCompletedCards: uniqueCompleted,
    firstRatingDistribution: dist,
    retryCount: retries.length,
    practiceCount,
    activeMs,
    deferredCardCount: deferredCardIds.length,
    unfinishedFreeRecallCount: input.unfinishedFreeRecallCount ?? 0,
    archivedGeneralCount: archivedGeneralCardIds.length,
    smooth,
    consolidate,
    relearn,
    retries,
    issueCardIds: openIssues,
    suspendedCardIds: [...state.suspended],
    deferredCardIds,
    archivedGeneralCardIds,
    tomorrowDueCoreEstimate: tomorrowDue,
    generalPendingCount: generalPending,
  };
}
