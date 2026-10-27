import type {
  AppState,
  BuiltContent,
  CardIssue,
  Rating,
  ReviewLog,
  SessionSummary,
} from '../types';
import {
  applyGeneralFirstRating,
  formatNextLabel,
  ladderScheduler,
  promoteCompletedOrExpiredGeneral,
  ratingIntervalDays,
} from '../scheduler/ladder';
import { buildTonightQueue, type TonightQueue } from '../queue/buildTonightQueue';
import { isGeneralExpired } from '../queue/buildTonightQueue';

export const SESSION_STORAGE_KEY = 'srw:session-ui:v1';

export type SessionPhase = 'free-recall' | 'cards' | 'notes' | 'done';

export interface SessionUiState {
  sessionId: string;
  studyDate: string;
  phase: SessionPhase;
  freeRecallIndex: number;
  cardIndex: number;
  queue: TonightQueue;
  retryQueue: string[];
  completedRetries: string[];
  ratedCardIds: string[];
  freeRecallDone: string[];
  notesDone: string[];
  viewedNotesTopics: string[];
  lastActionId: string | null;
  undoSnapshot: UndoSnapshot | null;
  answerRevealed: boolean;
  usedHint: boolean;
  typedAnswer: string;
  cardStartedAt: number;
  activeMs: number;
  paused: boolean;
  budgetExceededPrompted: boolean;
}

interface UndoSnapshot {
  cardState: AppState['cards'][string];
  logId: string;
  cardIndex: number;
  retryQueue: string[];
  ratedCardIds: string[];
}

export function createSession(queue: TonightQueue, studyDate: string): SessionUiState {
  return {
    sessionId: crypto.randomUUID(),
    studyDate,
    phase: queue.freeRecall.length ? 'free-recall' : queue.cards.length ? 'cards' : 'notes',
    freeRecallIndex: 0,
    cardIndex: 0,
    queue,
    retryQueue: [],
    completedRetries: [],
    ratedCardIds: [],
    freeRecallDone: [],
    notesDone: [],
    viewedNotesTopics: [],
    lastActionId: null,
    undoSnapshot: null,
    answerRevealed: false,
    usedHint: false,
    typedAnswer: '',
    cardStartedAt: Date.now(),
    activeMs: 0,
    paused: false,
    budgetExceededPrompted: false,
  };
}

export function saveSessionUi(ui: SessionUiState): void {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(ui));
}

export function loadSessionUi(): SessionUiState | null {
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUiState;
  } catch {
    return null;
  }
}

export function clearSessionUi(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

export function effectiveTier(
  content: BuiltContent,
  state: AppState,
  cardId: string,
): 'core' | 'general' {
  const card = content.cardsById[cardId];
  if (!card) return 'core';
  if (card.tier === 'core' || state.promoted.includes(cardId)) return 'core';
  return 'general';
}

export function nextLabelForRating(
  content: BuiltContent,
  state: AppState,
  cardId: string,
  rating: Rating,
  cappedByAssist: boolean,
): string {
  const tier = effectiveTier(content, state, cardId);
  const cs = state.cards[cardId];
  if (!cs) return '';
  if (tier === 'general' && cs.reps === 0) {
    return formatNextLabel(0, true);
  }
  const r = cappedByAssist && rating > 2 ? 2 : rating;
  return formatNextLabel(ratingIntervalDays(cs.step, r as Rating));
}

export function applyRating(input: {
  state: AppState;
  content: BuiltContent;
  ui: SessionUiState;
  cardId: string;
  rating: Rating;
  kind: 'scheduled' | 'retry' | 'practice';
  actionId: string;
  nowIso?: string;
}): { state: AppState; ui: SessionUiState; duplicate: boolean } {
  const { content, cardId, kind, actionId } = input;
  let rating = input.rating;
  const ui = structuredClone(input.ui);
  const state = structuredClone(input.state);
  const nowIso = input.nowIso ?? new Date().toISOString();

  if (ui.lastActionId === actionId) {
    return { state: input.state, ui: input.ui, duplicate: true };
  }
  if (kind === 'scheduled' && ui.ratedCardIds.includes(cardId)) {
    return { state: input.state, ui: input.ui, duplicate: true };
  }

  const assist = ui.usedHint || ui.viewedNotesTopics.includes(
    content.topicByCardId[cardId]?.topicId ?? '',
  );
  if (assist && rating > 2) rating = 2;

  const card = content.cardsById[cardId];
  const cs = state.cards[cardId] ?? ladderScheduler.initial(card, ui.studyDate);
  const before = structuredClone(cs);
  const ctx = { now: nowIso, studyDate: ui.studyDate, timeZone: state.settings.timeZone };

  if (kind === 'scheduled') {
    const tier = effectiveTier(content, state, cardId);
    if (tier === 'general' && cs.reps === 0) {
      state.cards[cardId] = applyGeneralFirstRating(cs, rating, ctx);
    } else {
      state.cards[cardId] = ladderScheduler.next(cs, rating, ctx);
    }
  } else {
    // retry/practice：只写日志
    state.cards[cardId] = cs;
  }

  const elapsed = Math.max(0, Date.now() - ui.cardStartedAt);
  const log: ReviewLog = {
    id: actionId,
    sessionId: ui.sessionId,
    cardId,
    ts: nowIso,
    studyDate: ui.studyDate,
    rating,
    kind,
    usedHint: ui.usedHint,
    viewedNotesBeforeAnswer: ui.viewedNotesTopics.includes(
      content.topicByCardId[cardId]?.topicId ?? '',
    ),
    elapsedMs: elapsed,
    typedAnswer: ui.typedAnswer || undefined,
  };
  state.logs.push(log);

  ui.undoSnapshot = {
    cardState: before,
    logId: actionId,
    cardIndex: ui.cardIndex,
    retryQueue: [...ui.retryQueue],
    ratedCardIds: [...ui.ratedCardIds],
  };
  ui.lastActionId = actionId;
  ui.activeMs += elapsed;

  if (kind === 'scheduled') {
    ui.ratedCardIds.push(cardId);
    if (rating === 1 && !ui.retryQueue.includes(cardId) && !ui.completedRetries.includes(cardId)) {
      ui.retryQueue.push(cardId);
    }
  } else if (kind === 'retry') {
    ui.completedRetries.push(cardId);
    ui.retryQueue = ui.retryQueue.filter((id) => id !== cardId);
  }

  ui.answerRevealed = false;
  ui.usedHint = false;
  ui.typedAnswer = '';
  ui.cardStartedAt = Date.now();

  return { state, ui, duplicate: false };
}

export function undoLast(state: AppState, ui: SessionUiState): { state: AppState; ui: SessionUiState } {
  if (!ui.undoSnapshot) return { state, ui };
  const nextState = structuredClone(state);
  const nextUi = structuredClone(ui);
  const snap = nextUi.undoSnapshot!;
  const log = nextState.logs.find((l) => l.id === snap.logId);
  if (log && !log.voidedAt) {
    log.voidedAt = new Date().toISOString();
    nextState.cards[log.cardId] = snap.cardState;
  }
  nextUi.cardIndex = snap.cardIndex;
  nextUi.retryQueue = snap.retryQueue;
  nextUi.ratedCardIds = snap.ratedCardIds;
  nextUi.undoSnapshot = null;
  nextUi.answerRevealed = false;
  return { state: nextState, ui: nextUi };
}

export function promoteCard(state: AppState, content: BuiltContent, cardId: string, studyDate: string): AppState {
  const next = structuredClone(state);
  if (!next.promoted.includes(cardId)) next.promoted.push(cardId);
  const cs = next.cards[cardId];
  const card = content.cardsById[cardId];
  if (!cs || !card) return next;
  if (cs.reps > 0 || isGeneralExpired(cs.firstEligibleOn, studyDate)) {
    next.cards[cardId] = promoteCompletedOrExpiredGeneral(cs, studyDate);
  }
  // 尚未完成且未过期：升级后立即具备正式复习资格，保留现有 due/firstEligibleOn
  return next;
}

export function reportIssue(
  state: AppState,
  cardId: string,
  reasonCode: CardIssue['reasonCode'],
  note?: string,
): AppState {
  const next = structuredClone(state);
  const issue: CardIssue = {
    id: crypto.randomUUID(),
    cardId,
    ts: new Date().toISOString(),
    reasonCode,
    status: 'open',
    note,
  };
  next.issues.push(issue);
  if (!next.suspended.includes(cardId)) next.suspended.push(cardId);
  return next;
}

export function finalizeSession(
  state: AppState,
  ui: SessionUiState,
  status: SessionSummary['status'],
): AppState {
  const next = structuredClone(state);
  const existing = next.sessions.find((s) => s.id === ui.sessionId);
  const summary: SessionSummary = {
    id: ui.sessionId,
    studyDate: ui.studyDate,
    startedAt: existing?.startedAt ?? new Date(Date.now() - ui.activeMs).toISOString(),
    endedAt: new Date().toISOString(),
    activeMs: ui.activeMs,
    status,
    freeRecall: ui.freeRecallDone.map((topicId) => ({
      topicId,
      completed: true,
      elapsedMs: 0,
    })),
    notesViews: ui.viewedNotesTopics.map((topicId) => ({
      topicId,
      viewedAt: new Date().toISOString(),
      beforeAnswer: true,
    })),
    completedCardIds: [...ui.ratedCardIds],
  };
  if (existing) {
    Object.assign(existing, summary);
  } else {
    next.sessions.push(summary);
  }
  return next;
}

export function buildQueueForTonight(content: BuiltContent, state: AppState, studyDate: string): TonightQueue {
  return buildTonightQueue({ content, state, studyDate });
}
