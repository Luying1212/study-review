import {
  APP_ID,
  PACKAGE_SCHEMA_VERSION,
  emptyAppState,
  type AppState,
  type DailyReport,
  type LocalMeta,
  type ReviewPackage,
} from '../types';
import { validateAppStateShape } from './store';

export function buildReviewPackage(input: {
  state: AppState;
  meta: LocalMeta;
  studyDate: string;
  report: DailyReport;
  packageId?: string;
}): ReviewPackage {
  return {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    appId: APP_ID,
    packageId: input.packageId ?? crypto.randomUUID(),
    baseArchiveId: input.meta.baseArchiveId,
    exportedAt: new Date().toISOString(),
    studyDate: input.studyDate,
    source: {
      deviceId: input.meta.deviceId,
      revision: input.meta.revision,
    },
    state: structuredClone(input.state),
    report: structuredClone(input.report),
  };
}

export function packageFilename(pkg: ReviewPackage): string {
  return `srw-review-${pkg.studyDate}-${pkg.packageId}.json`;
}

export function downloadReviewPackage(pkg: ReviewPackage): void {
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = packageFilename(pkg);
  a.click();
  URL.revokeObjectURL(url);
}

export type PackageValidation =
  | { ok: true; pkg: ReviewPackage }
  | { ok: false; message: string };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validateReviewPackage(data: unknown): PackageValidation {
  if (!isObject(data)) return { ok: false, message: '复习包不是对象。' };
  if (data.schemaVersion !== PACKAGE_SCHEMA_VERSION) {
    return { ok: false, message: `不支持的 schemaVersion: ${String(data.schemaVersion)}` };
  }
  if (data.appId !== APP_ID) {
    return { ok: false, message: 'appId 不匹配，拒绝导入以免覆盖本工作台数据。' };
  }
  if (typeof data.packageId !== 'string' || !data.packageId) {
    return { ok: false, message: '缺少 packageId。' };
  }
  if (typeof data.studyDate !== 'string') return { ok: false, message: '缺少 studyDate。' };
  if (typeof data.exportedAt !== 'string') return { ok: false, message: '缺少 exportedAt。' };
  if (!isObject(data.source)) return { ok: false, message: '缺少 source。' };
  if (typeof data.source.deviceId !== 'string' || typeof data.source.revision !== 'number') {
    return { ok: false, message: 'source 字段不合法。' };
  }
  if (!validateAppStateShape(data.state)) {
    return { ok: false, message: 'state 结构不合法或 appId/version 不匹配。' };
  }
  if (!isObject(data.report)) return { ok: false, message: '缺少 report。' };

  const logs = (data.state as AppState).logs;
  const logIds = new Set<string>();
  for (const log of logs) {
    if (logIds.has(log.id)) return { ok: false, message: `重复日志 ID: ${log.id}` };
    logIds.add(log.id);
  }
  const sessions = (data.state as AppState).sessions;
  const sessionIds = new Set<string>();
  for (const s of sessions) {
    if (sessionIds.has(s.id)) return { ok: false, message: `重复会话 ID: ${s.id}` };
    sessionIds.add(s.id);
  }

  return { ok: true, pkg: data as unknown as ReviewPackage };
}

export interface ImportPreview {
  currentCards: number;
  incomingCards: number;
  currentLogs: number;
  incomingLogs: number;
  currentRevision: number;
  incomingRevision: number;
  studyDate: string;
  packageId: string;
}

export function previewImport(current: AppState, meta: LocalMeta, pkg: ReviewPackage): ImportPreview {
  return {
    currentCards: Object.keys(current.cards).length,
    incomingCards: Object.keys(pkg.state.cards).length,
    currentLogs: current.logs.length,
    incomingLogs: pkg.state.logs.length,
    currentRevision: meta.revision,
    incomingRevision: pkg.source.revision,
    studyDate: pkg.studyDate,
    packageId: pkg.packageId,
  };
}

export function sanitizePublicState(state: AppState): AppState {
  const next = structuredClone(state);
  next.dayFeedback = {};
  next.logs = next.logs.map((log) => {
    const { typedAnswer: _t, ...rest } = log;
    return rest;
  });
  next.issues = next.issues.map((issue) => {
    const { note: _n, ...rest } = issue;
    return rest;
  });
  next.sessions = next.sessions.map((s) => ({
    ...s,
    freeRecall: s.freeRecall.map((f) => {
      const { text: _text, ...rest } = f;
      return rest;
    }),
  }));
  return next;
}

export function resetProgressKeepingMeta(meta: LocalMeta): { state: AppState; meta: LocalMeta } {
  return {
    state: emptyAppState(),
    meta: {
      ...meta,
      revision: meta.revision + 1,
      hasUnarchivedChanges: true,
      lastExportedPackageId: null,
      lastExportedAt: null,
      lastExportedRevision: null,
    },
  };
}
