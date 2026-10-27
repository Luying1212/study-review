/** 晚间复习工作台固定标识；导入时必须匹配 */
export const APP_ID = 'study-review-workbench' as const;
export const APP_STATE_VERSION = 1 as const;
export const PACKAGE_SCHEMA_VERSION = 1 as const;
export const ARCHIVE_SCHEMA_VERSION = 1 as const;

export type CardType = 'qa' | 'code' | 'cloze' | 'explain';
export type CardLevel = 'recall' | 'explain' | 'apply';
export type CardTier = 'core' | 'general';
export type CardStatus = 'draft' | 'needs-review' | 'ready';
export type CardOrigin = 'user-studied' | 'ai-supplement';
export type Rating = 1 | 2 | 3 | 4;
export type ReviewKind = 'scheduled' | 'retry' | 'practice';
export type IssueStatus = 'open' | 'resolved' | 'wontfix';
export type SessionStatus = 'completed' | 'aborted';

export interface Subject {
  id: string;
  name: string;
  color: string;
}

export interface SourceRef {
  label: string;
  locator?: string;
}

export interface Card {
  id: string;
  type: CardType;
  level: CardLevel;
  tier: CardTier;
  status: CardStatus;
  origin: CardOrigin;
  retired: boolean;
  question: string;
  answer: string;
  hint?: string;
  rubric?: string[];
  estSeconds: number;
  tags?: string[];
}

export interface Topic {
  id: string;
  subject: string;
  title: string;
  selfAssessment: string;
  sources: SourceRef[];
  freeRecallPrompt: string;
  freeRecallEstSeconds: number;
  notesEstSeconds: number;
  notes: string;
  cards?: Card[];
  cardRefs?: string[];
}

export interface DayContent {
  date: string;
  summary: string;
  topics: Topic[];
  tempNotes?: string[];
}

export interface CardState {
  step: number;
  due: string | null;
  firstEligibleOn: string;
  firstCompletedOn?: string;
  relearnedAt?: string;
  reps: number;
  lapses: number;
  lastRating?: Rating;
  lastReviewed?: string;
}

export interface ReviewLog {
  id: string;
  sessionId: string;
  cardId: string;
  ts: string;
  studyDate: string;
  rating: Rating;
  kind: ReviewKind;
  usedHint: boolean;
  viewedNotesBeforeAnswer: boolean;
  elapsedMs: number;
  voidedAt?: string;
  typedAnswer?: string;
}

export type IssueReasonCode =
  | 'wrong-answer'
  | 'ambiguous'
  | 'typo'
  | 'duplicate'
  | 'out-of-scope'
  | 'other';

export interface CardIssue {
  id: string;
  cardId: string;
  ts: string;
  reasonCode: IssueReasonCode;
  status: IssueStatus;
  note?: string;
}

export interface FreeRecallRecord {
  topicId: string;
  completed: boolean;
  elapsedMs: number;
  text?: string;
}

export interface NotesViewRecord {
  topicId: string;
  viewedAt: string;
  beforeAnswer: boolean;
}

export interface SessionSummary {
  id: string;
  studyDate: string;
  startedAt: string;
  endedAt?: string;
  activeMs: number;
  status: SessionStatus;
  freeRecall: FreeRecallRecord[];
  notesViews: NotesViewRecord[];
  completedCardIds: string[];
}

export interface AppSettings {
  budgetMinutes: number;
  dayStartHour: number;
  timeZone: string;
}

export interface AppState {
  version: typeof APP_STATE_VERSION;
  appId: string;
  settings: AppSettings;
  cards: Record<string, CardState>;
  logs: ReviewLog[];
  promoted: string[];
  suspended: string[];
  issues: CardIssue[];
  dayFeedback: Record<string, string>;
  sessions: SessionSummary[];
}

export interface LocalMeta {
  deviceId: string;
  revision: number;
  baseArchiveId: string | null;
  hasUnarchivedChanges: boolean;
  lastExportedPackageId: string | null;
  lastExportedAt: string | null;
  lastExportedRevision: number | null;
  rawBackup?: string;
}

export interface PerformanceItem {
  cardId: string;
  topicId: string;
  topicTitle: string;
  level: CardLevel;
  question: string;
  rating: Rating;
  usedHint: boolean;
  viewedNotesBeforeAnswer: boolean;
  leech?: boolean;
}

export interface DailyReport {
  studyDate: string;
  sessionCount: number;
  uniqueCompletedCards: number;
  firstRatingDistribution: Record<Rating, number>;
  retryCount: number;
  practiceCount: number;
  activeMs: number;
  deferredCardCount: number;
  unfinishedFreeRecallCount: number;
  archivedGeneralCount: number;
  smooth: PerformanceItem[];
  consolidate: PerformanceItem[];
  relearn: PerformanceItem[];
  retries: Array<{ cardId: string; rating: Rating; question: string }>;
  issueCardIds: string[];
  suspendedCardIds: string[];
  deferredCardIds: string[];
  archivedGeneralCardIds: string[];
  tomorrowDueCoreEstimate: number;
  generalPendingCount: number;
}

export interface ReviewPackage {
  schemaVersion: typeof PACKAGE_SCHEMA_VERSION;
  appId: string;
  packageId: string;
  baseArchiveId: string | null;
  exportedAt: string;
  studyDate: string;
  source: { deviceId: string; revision: number };
  state: AppState;
  report: DailyReport;
}

export interface ArchiveReceipt {
  packageId: string;
  sha256: string;
  previousArchiveId: string | null;
  archivedAt: string;
  studyDate: string;
}

export interface ProgressArchive {
  schemaVersion: typeof ARCHIVE_SCHEMA_VERSION;
  appId: string;
  archiveId: string;
  previousArchiveId: string | null;
  exportedAt: string;
  archivedAt: string;
  source: { deviceId: string; revision: number };
  state: AppState;
  reportSummary: Omit<DailyReport, never>;
}

export interface ProgressBundle {
  archive: ProgressArchive | null;
  receipts: ArchiveReceipt[];
}

export interface BuiltContent {
  subjects: Subject[];
  days: DayContent[];
  cardsById: Record<string, Card>;
  topicByCardId: Record<string, { topicId: string; topicTitle: string; date: string; subject: string }>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  budgetMinutes: 20,
  dayStartHour: 4,
  timeZone: 'Asia/Shanghai',
};

export function emptyAppState(settings: AppSettings = DEFAULT_SETTINGS): AppState {
  return {
    version: APP_STATE_VERSION,
    appId: APP_ID,
    settings: { ...settings },
    cards: {},
    logs: [],
    promoted: [],
    suspended: [],
    issues: [],
    dayFeedback: {},
    sessions: [],
  };
}
