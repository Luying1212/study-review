import { describe, expect, it } from 'vitest';
import { reconcileProgress } from './reconcile';
import { emptyAppState, type ProgressArchive } from '../types';

function archive(id: string, prev: string | null = null): ProgressArchive {
  return {
    schemaVersion: 1,
    appId: 'study-review-workbench',
    archiveId: id,
    previousArchiveId: prev,
    exportedAt: '2026-10-27T00:00:00.000Z',
    archivedAt: '2026-10-27T01:00:00.000Z',
    source: { deviceId: 'd1', revision: 2 },
    state: emptyAppState(),
    reportSummary: {
      studyDate: '2026-10-27',
      sessionCount: 0,
      uniqueCompletedCards: 0,
      firstRatingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0 },
      retryCount: 0,
      practiceCount: 0,
      activeMs: 0,
      deferredCardCount: 0,
      unfinishedFreeRecallCount: 0,
      archivedGeneralCount: 0,
      smooth: [],
      consolidate: [],
      relearn: [],
      retries: [],
      issueCardIds: [],
      suspendedCardIds: [],
      deferredCardIds: [],
      archivedGeneralCardIds: [],
      tomorrowDueCoreEstimate: 0,
      generalPendingCount: 0,
    },
  };
}

describe('reconcile', () => {
  it('本地空则自动恢复归档', () => {
    const decision = reconcileProgress({
      local: emptyAppState(),
      meta: {
        deviceId: 'd',
        revision: 0,
        baseArchiveId: null,
        hasUnarchivedChanges: false,
        lastExportedPackageId: null,
        lastExportedAt: null,
        lastExportedRevision: null,
      },
      bundle: { archive: archive('a1'), receipts: [] },
    });
    expect(decision.action).toBe('auto-restore-archive');
  });

  it('本地有未归档且基线不同则冲突', () => {
    const local = emptyAppState();
    local.logs.push({
      id: 'x',
      sessionId: 's',
      cardId: 'c',
      ts: 't',
      studyDate: '2026-10-27',
      rating: 3,
      kind: 'scheduled',
      usedHint: false,
      viewedNotesBeforeAnswer: false,
      elapsedMs: 1,
    });
    const decision = reconcileProgress({
      local,
      meta: {
        deviceId: 'd',
        revision: 3,
        baseArchiveId: 'old',
        hasUnarchivedChanges: true,
        lastExportedPackageId: null,
        lastExportedAt: null,
        lastExportedRevision: null,
      },
      bundle: { archive: archive('new', 'other'), receipts: [] },
    });
    expect(decision.action).toBe('conflict');
  });
});
