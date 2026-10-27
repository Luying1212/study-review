import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEY,
  createMemoryStorage,
  loadState,
  saveState,
} from './store';
import { emptyAppState, APP_ID } from '../types';

describe('store protection', () => {
  it('缺失时返回空状态', () => {
    const mem = createMemoryStorage();
    const loaded = loadState(mem);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.state.logs).toEqual([]);
  });

  it('损坏数据保留原字符串且不覆盖', () => {
    const mem = createMemoryStorage({ [STORAGE_KEY]: '{not-json' });
    const loaded = loadState(mem);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.preserved).toBe(true);
      expect(loaded.raw).toBe('{not-json');
    }
    expect(mem.getItem(STORAGE_KEY)).toBe('{not-json');
  });

  it('未知版本不覆盖', () => {
    const raw = JSON.stringify({ version: 99, appId: APP_ID });
    const mem = createMemoryStorage({ [STORAGE_KEY]: raw });
    const loaded = loadState(mem);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.reason).toBe('unknown-version');
    expect(mem.getItem(STORAGE_KEY)).toBe(raw);
  });

  it('写入失败不给假成功', () => {
    const mem = createMemoryStorage();
    const failing = {
      getItem: mem.getItem,
      removeItem: mem.removeItem,
      setItem: () => {
        throw new Error('quota');
      },
    };
    const result = saveState(emptyAppState(), {
      deviceId: 'd',
      revision: 0,
      baseArchiveId: null,
      hasUnarchivedChanges: false,
      lastExportedPackageId: null,
      lastExportedAt: null,
      lastExportedRevision: null,
    }, {}, failing);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stateKeptInMemory).toBe(true);
  });
});
