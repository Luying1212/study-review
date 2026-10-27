import { describe, expect, it } from 'vitest';
import { sanitizePublicState, validateReviewPackage, buildReviewPackage } from './backup';
import { emptyAppState, APP_ID } from '../types';

describe('review package', () => {
  it('拒绝错误 appId；公开状态剔除 typedAnswer', () => {
    const state = emptyAppState();
    state.logs.push({
      id: 'l1',
      sessionId: 's',
      cardId: 'c1',
      ts: '2026-10-27T12:00:00.000Z',
      studyDate: '2026-10-27',
      rating: 3,
      kind: 'scheduled',
      usedHint: false,
      viewedNotesBeforeAnswer: false,
      elapsedMs: 1,
      typedAnswer: 'secret',
    });
    state.dayFeedback['2026-10-27'] = 'private';
    const pub = sanitizePublicState(state);
    expect(pub.logs[0].typedAnswer).toBeUndefined();
    expect(pub.dayFeedback).toEqual({});

    const bad = validateReviewPackage({ schemaVersion: 1, appId: 'other' });
    expect(bad.ok).toBe(false);

    const pkg = buildReviewPackage({
      state,
      meta: {
        deviceId: 'd',
        revision: 1,
        baseArchiveId: null,
        hasUnarchivedChanges: true,
        lastExportedPackageId: null,
        lastExportedAt: null,
        lastExportedRevision: null,
      },
      studyDate: '2026-10-27',
      report: {
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
      packageId: 'pkg-1',
    });
    expect(pkg.appId).toBe(APP_ID);
    const ok = validateReviewPackage(pkg);
    expect(ok.ok).toBe(true);
  });
});
