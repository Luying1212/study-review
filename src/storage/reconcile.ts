import type { AppState, LocalMeta, ProgressArchive, ProgressBundle } from '../types';
import { emptyAppState } from '../types';

export type ReconcileDecision =
  | { action: 'use-local'; reason: string }
  | { action: 'auto-restore-archive'; archive: ProgressArchive; reason: string }
  | { action: 'auto-advance-baseline'; archive: ProgressArchive; reason: string }
  | { action: 'conflict'; reason: string; local: AppState; archive: ProgressArchive }
  | { action: 'keep-empty'; reason: string };

function isLocalEmpty(state: AppState): boolean {
  return (
    Object.keys(state.cards).length === 0 &&
    state.logs.length === 0 &&
    state.sessions.length === 0 &&
    state.issues.length === 0
  );
}

function receiptProvesSuccessor(
  bundle: ProgressBundle,
  fromId: string | null,
  toId: string,
): boolean {
  if (!bundle.archive || bundle.archive.archiveId !== toId) return false;
  if (bundle.archive.previousArchiveId === fromId) return true;
  // walk receipts chain
  const byId = new Map(bundle.receipts.map((r) => [r.packageId, r]));
  let cur: string | null = toId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === fromId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    const rec = byId.get(cur);
    if (!rec) break;
    if (rec.previousArchiveId === fromId) return true;
    cur = rec.previousArchiveId;
  }
  return fromId === null && bundle.archive.previousArchiveId === null && toId === bundle.archive.archiveId
    ? false
    : false;
}

export function reconcileProgress(input: {
  local: AppState;
  meta: LocalMeta;
  bundle: ProgressBundle;
}): ReconcileDecision {
  const { local, meta, bundle } = input;
  const archive = bundle.archive;

  if (!archive) {
    if (isLocalEmpty(local)) {
      return { action: 'keep-empty', reason: '本地与仓库均无进度，使用空状态。' };
    }
    return { action: 'use-local', reason: '仓库无归档，保留本地进度。' };
  }

  if (isLocalEmpty(local) && !meta.hasUnarchivedChanges) {
    return {
      action: 'auto-restore-archive',
      archive,
      reason: '本地为空，自动恢复最近归档。',
    };
  }

  // 仓库确认接收了本设备已导出的相同版本
  if (
    meta.lastExportedPackageId &&
    meta.lastExportedPackageId === archive.archiveId &&
    meta.lastExportedRevision !== null &&
    meta.lastExportedRevision === archive.source.revision &&
    meta.deviceId === archive.source.deviceId
  ) {
    return {
      action: 'auto-advance-baseline',
      archive,
      reason: '仓库已接收本设备导出的相同版本；推进归档基线，保留此后本地修改。',
    };
  }

  if (meta.baseArchiveId === archive.archiveId) {
    return { action: 'use-local', reason: '仓库与本地基线相同，保留本地新进度。' };
  }

  // 本地无未归档修改，且仓库是当前基线的后续版本
  if (!meta.hasUnarchivedChanges) {
    const ok = receiptProvesSuccessor(bundle, meta.baseArchiveId, archive.archiveId);
    if (ok || meta.baseArchiveId === archive.previousArchiveId) {
      return {
        action: 'auto-restore-archive',
        archive,
        reason: '本地无未归档修改，仓库为后续归档，自动更新。',
      };
    }
  }

  // 分叉 / 倒退 / 无法证明继承
  return {
    action: 'conflict',
    reason: '仓库与本地进度存在分叉或无法证明继承关系，已停止自动覆盖。',
    local,
    archive,
  };
}

export function applyArchiveToLocal(
  archive: ProgressArchive,
  meta: LocalMeta,
  options: { clearUnarchived?: boolean } = {},
): { state: AppState; meta: LocalMeta } {
  return {
    state: structuredClone(archive.state),
    meta: {
      ...meta,
      baseArchiveId: archive.archiveId,
      hasUnarchivedChanges: options.clearUnarchived === false ? meta.hasUnarchivedChanges : false,
    },
  };
}

export function advanceBaselineOnly(
  archive: ProgressArchive,
  state: AppState,
  meta: LocalMeta,
): { state: AppState; meta: LocalMeta } {
  return {
    state,
    meta: {
      ...meta,
      baseArchiveId: archive.archiveId,
      hasUnarchivedChanges:
        meta.lastExportedRevision !== null && meta.revision > meta.lastExportedRevision
          ? true
          : false,
    },
  };
}

export function emptyBundle(): ProgressBundle {
  return { archive: null, receipts: [] };
}

void emptyAppState;
