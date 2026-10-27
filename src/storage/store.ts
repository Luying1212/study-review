import {
  APP_ID,
  APP_STATE_VERSION,
  DEFAULT_SETTINGS,
  emptyAppState,
  type AppState,
  type LocalMeta,
} from '../types';

export const STORAGE_KEY = 'srw:v1';
export const META_KEY = 'srw:meta:v1';
export const SESSION_UI_KEY = 'srw:session-ui:v1';

export type LoadResult =
  | { ok: true; state: AppState; meta: LocalMeta }
  | {
      ok: false;
      reason: 'missing' | 'corrupt' | 'unknown-version' | 'wrong-app';
      raw: string | null;
      message: string;
      preserved: true;
    };

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

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validateAppStateShape(data: unknown): data is AppState {
  if (!isObject(data)) return false;
  if (data.version !== APP_STATE_VERSION) return false;
  if (data.appId !== APP_ID) return false;
  if (!isObject(data.settings)) return false;
  if (!isObject(data.cards)) return false;
  if (!Array.isArray(data.logs)) return false;
  if (!Array.isArray(data.promoted)) return false;
  if (!Array.isArray(data.suspended)) return false;
  if (!Array.isArray(data.issues)) return false;
  if (!isObject(data.dayFeedback)) return false;
  if (!Array.isArray(data.sessions)) return false;
  return true;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const browserStorage: StorageAdapter = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    localStorage.setItem(k, v);
  },
  removeItem: (k) => {
    localStorage.removeItem(k);
  },
};

export function loadState(adapter: StorageAdapter = browserStorage): LoadResult {
  const raw = adapter.getItem(STORAGE_KEY);
  const metaRaw = adapter.getItem(META_KEY);
  let meta = defaultMeta();
  if (metaRaw) {
    try {
      meta = { ...defaultMeta(), ...(JSON.parse(metaRaw) as LocalMeta) };
    } catch {
      // keep default meta; do not wipe
    }
  }

  if (raw === null) {
    return { ok: true, state: emptyAppState(), meta };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) {
      return {
        ok: false,
        reason: 'corrupt',
        raw,
        message: '本地进度不是有效 JSON 对象，已保留原始数据，未覆盖。',
        preserved: true,
      };
    }
    if (typeof parsed.version === 'number' && parsed.version !== APP_STATE_VERSION) {
      return {
        ok: false,
        reason: 'unknown-version',
        raw,
        message: `未知进度版本 ${String(parsed.version)}，已保留原始数据。`,
        preserved: true,
      };
    }
    if (parsed.appId !== APP_ID) {
      return {
        ok: false,
        reason: 'wrong-app',
        raw,
        message: '本地数据 appId 不匹配，已保留原始数据。',
        preserved: true,
      };
    }
    if (!validateAppStateShape(parsed)) {
      return {
        ok: false,
        reason: 'corrupt',
        raw,
        message: '本地进度结构不完整，已保留原始数据，未覆盖。',
        preserved: true,
      };
    }
    return { ok: true, state: parsed, meta };
  } catch {
    return {
      ok: false,
      reason: 'corrupt',
      raw,
      message: '本地进度解析失败，已保留原始数据，未覆盖。',
      preserved: true,
    };
  }
}

export type SaveResult =
  | { ok: true; revision: number }
  | { ok: false; message: string; stateKeptInMemory: true };

export function saveState(
  state: AppState,
  meta: LocalMeta,
  options: { bumpRevision?: boolean; markUnarchived?: boolean } = {},
  adapter: StorageAdapter = browserStorage,
): SaveResult {
  const nextMeta: LocalMeta = { ...meta };
  if (options.bumpRevision !== false) {
    nextMeta.revision = meta.revision + 1;
  }
  if (options.markUnarchived !== false) {
    nextMeta.hasUnarchivedChanges = true;
  }
  try {
    adapter.setItem(STORAGE_KEY, JSON.stringify(state));
    adapter.setItem(META_KEY, JSON.stringify(nextMeta));
    return { ok: true, revision: nextMeta.revision };
  } catch {
    return {
      ok: false,
      message: '写入本地存储失败，未显示已保存。请立即导出备份；继续操作有丢失风险。',
      stateKeptInMemory: true,
    };
  }
}

export function replaceState(
  state: AppState,
  meta: LocalMeta,
  adapter: StorageAdapter = browserStorage,
): SaveResult {
  try {
    adapter.setItem(STORAGE_KEY, JSON.stringify(state));
    adapter.setItem(META_KEY, JSON.stringify(meta));
    return { ok: true, revision: meta.revision };
  } catch {
    return {
      ok: false,
      message: '写入本地存储失败。',
      stateKeptInMemory: true,
    };
  }
}

export function downloadRawBackup(raw: string, filename = 'srw-raw-backup.json'): void {
  const blob = new Blob([raw], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function createMemoryStorage(initial: Record<string, string> = {}): StorageAdapter {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

export { defaultMeta, DEFAULT_SETTINGS };
