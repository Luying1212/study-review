import type { Card, CardState, Rating } from '../types';

export interface SchedulerContext {
  now: string;
  studyDate: string;
  timeZone: string;
}

export interface Scheduler {
  initial(card: Card, learnedOn: string): CardState;
  next(state: CardState, rating: Rating, context: SchedulerContext): CardState;
}
