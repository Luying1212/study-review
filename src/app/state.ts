import type { AppState, BuiltContent, LocalMeta, ProgressBundle } from '../types';
import { emptyAppState } from '../types';
import {
  loadState,
  replaceState,
  saveState,
  browserStorage,
  type StorageAdapter,
} from '../storage/store';
import { reconcileProgress, applyArchiveToLocal, advanceBaselineOnly } from '../storage/reconcile';
import { discoverReadyCards } from '../queue/buildTonightQueue';
import { studyDateOf } from '../utils/date';

function defaultMeta(): LocalMeta {
  return {
    deviceId: crypto.randomUUID(),
    revision: 0,
    baseArchiveId: null,
    hasUnarchivedChanges: false,
    lastExportedPackageId: null,
    lastExportedAt: null,
    lastExportedRevision: null,
  };
}

export interface AppContext {
  content: BuiltContent;
  progress: ProgressBundle;
  state: AppState;
  meta: LocalMeta;
  studyDate: string;
  loadError: string | null;
  conflict: Extract<ReturnType<typeof reconcileProgress>, { action: 'conflict' }> | null;
  storage: StorageAdapter;
}

export function bootContext(
  content: BuiltContent,
  progress: ProgressBundle,
  storage: StorageAdapter = browserStorage,
): AppContext {
  const loaded = loadState(storage);
  let state = emptyAppState();
  let meta = defaultMeta();
  let loadError: string | null = null;
  let conflict: AppContext['conflict'] = null;

  if (!loaded.ok) {
    loadError = loaded.message;
    meta = { ...defaultMeta(), rawBackup: loaded.raw ?? undefined };
  } else {
    state = loaded.state;
    meta = loaded.meta;
    const decision = reconcileProgress({ local: state, meta, bundle: progress });
    if (decision.action === 'auto-restore-archive') {
      const applied = applyArchiveToLocal(decision.archive, meta);
      state = applied.state;
      meta = applied.meta;
      replaceState(state, meta, storage);
    } else if (decision.action === 'auto-advance-baseline') {
      const applied = advanceBaselineOnly(decision.archive, state, meta);
      state = applied.state;
      meta = applied.meta;
      replaceState(state, meta, storage);
    } else if (decision.action === 'conflict') {
      conflict = decision;
    }
  }

  const studyDate = studyDateOf(new Date(), state.settings);
  const beforeIds = new Set(Object.keys(state.cards));
  discoverReadyCards(state, content, studyDate);
  const afterIds = Object.keys(state.cards);
  if (loaded.ok && afterIds.some((id) => !beforeIds.has(id))) {
    const saved = saveState(state, meta, {}, storage);
    if (saved.ok) {
      meta = { ...meta, revision: saved.revision, hasUnarchivedChanges: true };
    }
  }

  return { content, progress, state, meta, studyDate, loadError, conflict, storage };
}

export function persist(
  ctx: AppContext,
  opts?: { bumpRevision?: boolean; markUnarchived?: boolean },
): string | null {
  const result = saveState(ctx.state, ctx.meta, opts, ctx.storage);
  if (!result.ok) return result.message;
  ctx.meta = {
    ...ctx.meta,
    revision: result.revision,
    hasUnarchivedChanges: opts?.markUnarchived === false ? false : true,
  };
  return null;
}
