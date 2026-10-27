import type { AppContext } from '../app/state';
import { persist } from '../app/state';
import {
  buildReviewPackage,
  downloadReviewPackage,
  previewImport,
  resetProgressKeepingMeta,
  validateReviewPackage,
} from '../storage/backup';
import { buildDailyReport } from '../reports/daily';
import { buildQueueForTonight } from '../app/session';
import { downloadRawBackup, replaceState } from '../storage/store';
import { shell } from './shell';

export function renderSettings(ctx: AppContext): string {
  const s = ctx.state.settings;
  const archiveAt = ctx.progress.archive?.archivedAt
    ? new Date(ctx.progress.archive.archivedAt).toLocaleString('zh-CN')
    : '无';
  const exportAt = ctx.meta.lastExportedAt
    ? new Date(ctx.meta.lastExportedAt).toLocaleString('zh-CN')
    : '无';

  return shell(
    'settings',
    `<div class="stack">
      <h1>设置</h1>
      <section class="panel stack">
        <label>每晚预算（分钟）
          <select id="budget">
            ${[10, 15, 20, 25, 30].map((n) => `<option value="${n}" ${s.budgetMinutes === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </label>
        <label>换日时间（小时，0-23）
          <input id="day-start" type="number" min="0" max="23" value="${s.dayStartHour}" />
        </label>
        <p class="muted">时区：${s.timeZone}（首版固定）</p>
        <button class="btn btn-primary" id="save-settings">保存设置</button>
      </section>
      <section class="panel stack">
        <h3>备份与恢复</h3>
        <p>当前设备保存未归档进度；GitHub 保存上次归档。</p>
        <p class="muted">最近导出：${exportAt}（${ctx.meta.lastExportedPackageId ?? '—'}）</p>
        <p class="muted">仓库归档确认时间：${archiveAt}（${ctx.progress.archive?.archiveId ?? '—'}）</p>
        <p class="muted">本地 revision ${ctx.meta.revision} · 未归档：${ctx.meta.hasUnarchivedChanges ? '是' : '否'}</p>
        <button class="btn" id="export-full">导出完整复习包</button>
        <label class="btn" style="display:inline-flex;align-items:center;justify-content:center;cursor:pointer">
          导入替换
          <input id="import-file" type="file" accept="application/json,.json" hidden />
        </label>
        ${ctx.loadError && ctx.meta.rawBackup ? `<button class="btn btn-danger" id="dl-raw">下载损坏的原始数据</button>` : ''}
      </section>
      <section class="panel stack">
        <h3>重置进度</h3>
        <p class="muted">二次确认：先备份，再输入「重置」。保留设备与归档基线元数据，并视为未归档修改。</p>
        <button class="btn btn-danger" id="reset-progress">重置所有进度</button>
      </section>
    </div>`,
  );
}

export function bindSettings(ctx: AppContext, rerender: () => void): void {
  document.getElementById('save-settings')?.addEventListener('click', () => {
    const budget = Number((document.getElementById('budget') as HTMLSelectElement).value);
    const dayStart = Number((document.getElementById('day-start') as HTMLInputElement).value);
    ctx.state.settings.budgetMinutes = budget;
    ctx.state.settings.dayStartHour = Math.min(23, Math.max(0, dayStart));
    const err = persist(ctx);
    alert(err ?? '已保存。换日时间只影响新会话。');
    rerender();
  });

  document.getElementById('export-full')?.addEventListener('click', () => {
    const q = buildQueueForTonight(ctx.content, ctx.state, ctx.studyDate);
    const report = buildDailyReport({
      state: ctx.state,
      content: ctx.content,
      studyDate: ctx.studyDate,
      deferredCardIds: q.deferredCards.map((c) => c.cardId),
      unfinishedFreeRecallCount: q.unfinishedFreeRecall.length,
    });
    const pkg = buildReviewPackage({ state: ctx.state, meta: ctx.meta, studyDate: ctx.studyDate, report });
    downloadReviewPackage(pkg);
    ctx.meta.lastExportedPackageId = pkg.packageId;
    ctx.meta.lastExportedAt = pkg.exportedAt;
    ctx.meta.lastExportedRevision = ctx.meta.revision;
    persist(ctx, { bumpRevision: false, markUnarchived: true });
  });

  document.getElementById('import-file')?.addEventListener('change', async (ev) => {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      alert('非法 JSON，未改变现状。');
      return;
    }
    const checked = validateReviewPackage(data);
    if (!checked.ok) {
      alert(`导入拒绝：${checked.message}`);
      return;
    }
    const preview = previewImport(ctx.state, ctx.meta, checked.pkg);
    const ok = confirm(
      `将完整替换本地进度。\n当前卡状态 ${preview.currentCards} → ${preview.incomingCards}\n日志 ${preview.currentLogs} → ${preview.incomingLogs}\n先会下载现状备份。继续？`,
    );
    if (!ok) return;
    const q = buildQueueForTonight(ctx.content, ctx.state, ctx.studyDate);
    const report = buildDailyReport({
      state: ctx.state,
      content: ctx.content,
      studyDate: ctx.studyDate,
      deferredCardIds: q.deferredCards.map((c) => c.cardId),
    });
    downloadReviewPackage(
      buildReviewPackage({ state: ctx.state, meta: ctx.meta, studyDate: ctx.studyDate, report }),
    );
    ctx.state = checked.pkg.state;
    ctx.meta = {
      ...ctx.meta,
      revision: Math.max(ctx.meta.revision, checked.pkg.source.revision) + 1,
      baseArchiveId: checked.pkg.baseArchiveId,
      hasUnarchivedChanges: true,
      lastExportedPackageId: checked.pkg.packageId,
      lastExportedAt: checked.pkg.exportedAt,
      lastExportedRevision: checked.pkg.source.revision,
    };
    replaceState(ctx.state, ctx.meta, ctx.storage);
    alert('已导入替换。');
    rerender();
  });

  document.getElementById('dl-raw')?.addEventListener('click', () => {
    if (ctx.meta.rawBackup) downloadRawBackup(ctx.meta.rawBackup);
  });

  document.getElementById('reset-progress')?.addEventListener('click', () => {
    const q = buildQueueForTonight(ctx.content, ctx.state, ctx.studyDate);
    const report = buildDailyReport({
      state: ctx.state,
      content: ctx.content,
      studyDate: ctx.studyDate,
      deferredCardIds: q.deferredCards.map((c) => c.cardId),
    });
    downloadReviewPackage(
      buildReviewPackage({ state: ctx.state, meta: ctx.meta, studyDate: ctx.studyDate, report }),
    );
    const typed = prompt('已提供备份。请输入「重置」确认：');
    if (typed !== '重置') {
      alert('已取消');
      return;
    }
    const next = resetProgressKeepingMeta(ctx.meta);
    ctx.state = next.state;
    ctx.meta = next.meta;
    replaceState(ctx.state, ctx.meta, ctx.storage);
    alert('进度已重置。下次启动不会被旧归档自动覆盖，需重新导出并归档后才成为仓库进度。');
    rerender();
  });
}
