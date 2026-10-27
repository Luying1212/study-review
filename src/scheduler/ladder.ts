import type { Card, CardState, Rating } from '../types';
import { addDays } from '../utils/date';
import type { Scheduler, SchedulerContext } from './index';

/** 阶梯（天）：step=0 表示学习当天 */
export const LADDER = [0, 1, 3, 7, 14, 30, 60, 120] as const;
export const MAX_STEP = LADDER.length - 1;

export function previewIntervalDays(state: CardState, rating: Rating): number {
  const next = ladderScheduler.next(
    { ...state },
    rating,
    { now: new Date().toISOString(), studyDate: state.due ?? state.firstEligibleOn, timeZone: 'Asia/Shanghai' },
  );
  if (!next.due) return 0;
  // 预览用相对「今天」的间隔展示：由调用方传入 studyDate 更准；此函数给按钮文案
  return ratingIntervalDays(state.step, rating);
}

export function ratingIntervalDays(step: number, rating: Rating): number {
  const clamped = Math.max(0, Math.min(step, MAX_STEP));
  if (rating === 1) return 1;
  if (rating === 2) {
    const base = Math.max(1, clamped);
    return Math.max(1, Math.round(LADDER[base] * 0.5));
  }
  if (rating === 3) {
    const newStep = Math.min(clamped + 1, MAX_STEP);
    return LADDER[newStep];
  }
  const newStep = Math.min(clamped + 2, MAX_STEP);
  return LADDER[newStep];
}

export function formatNextLabel(days: number, isGeneralFirstComplete = false): string {
  if (isGeneralFirstComplete) return '完成（一般卡）';
  if (days <= 0) return '今天';
  if (days === 1) return '明天';
  return `${days} 天后`;
}

export const ladderScheduler: Scheduler = {
  initial(_card: Card, learnedOn: string): CardState {
    return {
      step: 0,
      due: learnedOn,
      firstEligibleOn: learnedOn,
      reps: 0,
      lapses: 0,
    };
  },

  next(state: CardState, rating: Rating, context: SchedulerContext): CardState {
    const today = context.studyDate;
    const next: CardState = { ...state };

    if (rating === 1) {
      next.step = 1;
      next.due = addDays(today, 1);
      next.lapses = state.lapses + 1;
    } else if (rating === 2) {
      const step = Math.max(1, state.step);
      next.step = step;
      next.due = addDays(today, Math.max(1, Math.round(LADDER[Math.min(step, MAX_STEP)] * 0.5)));
    } else if (rating === 3) {
      const newStep = Math.min(state.step + 1, MAX_STEP);
      next.step = newStep;
      next.due = addDays(today, LADDER[newStep]);
    } else {
      const newStep = Math.min(state.step + 2, MAX_STEP);
      next.step = newStep;
      next.due = addDays(today, LADDER[newStep]);
    }

    next.reps = state.reps + 1;
    next.lastRating = rating;
    next.lastReviewed = context.now;
    if (!next.firstCompletedOn) next.firstCompletedOn = today;
    return next;
  },
};

/** 一般卡首次正式评分后的状态（不安排长期间隔） */
export function applyGeneralFirstRating(
  state: CardState,
  rating: Rating,
  context: SchedulerContext,
): CardState {
  return {
    ...state,
    reps: state.reps + 1,
    lapses: rating === 1 ? state.lapses + 1 : state.lapses,
    lastRating: rating,
    lastReviewed: context.now,
    firstCompletedOn: state.firstCompletedOn ?? context.studyDate,
    due: null,
    step: state.step,
  };
}

/** 已完成或已过期的一般卡升级为核心 */
export function promoteCompletedOrExpiredGeneral(state: CardState, studyDate: string): CardState {
  return {
    ...state,
    step: 1,
    due: addDays(studyDate, 1),
  };
}

/** 标记已重学：核心卡 step=1、due=明天；薄弱统计从 relearnedAt 起算 */
export function markRelearned(state: CardState, studyDate: string, nowIso: string): CardState {
  return {
    ...state,
    relearnedAt: nowIso,
    step: 1,
    due: addDays(studyDate, 1),
  };
}
