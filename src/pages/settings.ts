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
    `<div class="stack-lg">
      <header class="hero-meta">
        <p class="caption">设置</p>
        <h1 class="large-title">偏好与备份</h1>
      </header>

      <section>
        <div class="group-label">复习偏好</div>
        <div class="group stack" style="padding:14px">
          <label class="caption">每晚预算（分钟）
            <select id="budget" style="margin-top:8px">
              ${[10, 15, 20, 25, 30].map((n) => `<option value="${n}" ${s.budgetMinutes === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </label>
          <label class="caption" style="display:block;margin-top:14px">换日时间（小时 0–23）
            <input id="day-start" type="number" min="0" max="23" value="${s.dayStartHour}" style="margin-top:8px" />
          </label>
          <p class="caption" style="margin-top:12px">时区：${s.timeZone}</p>
          <button class="btn btn-primary" id="save-settings" style="margin-top:14px">保存设置</button>
        </div>
      </section>

      <section>
        <div class="group-label">备份与恢复</div>
        <div class="group">
          <div class="cell">
            <div class="cell-main">
              <div class="cell-title">最近导出</div>
              <div class="cell-sub">${exportAt}</div>
            </div>
          </div>
          <div class="cell">
            <div class="cell-main">
              <div class="cell-title">仓库归档</div>
              <div class="cell-sub">${archiveAt}</div>
            </div>
          </div>
          <div class="cell">
            <div class="cell-main">
              <div class="cell-title">本地版本</div>
              <div class="cell-sub">revision ${ctx.meta.revision} · 未归档 ${ctx.meta.hasUnarchivedChanges ? '是' : '否'}</div>
            </div>
          </div>
        </div>
        <div class="footer-actions" style="margin-top:12px">
          <button class="btn btn-secondary btn-block" id="export-full">导出完整复习包</button>
          <label class="btn btn-secondary btn-block" style="display:grid;place-items:center;cursor:pointer">
            导入替换
            <input id="import-file" type="file" accept="application/json,.json" hidden />
          </label>
          ${ctx.loadError && ctx.meta.rawBackup ? `<button class="btn btn-danger btn-block" id="dl-raw">下载损坏原始数据</button>` : ''}
        </div>
      </section>

      <section>
        <div class="group-label">危险操作</div>
        <div class="group" style="padding:16px">
          <p class="caption">重置会先下载备份。保留设备与归档基线，并视为未归档修改。</p>
          <button class="btn btn-danger btn-block" id="reset-progress" style="margin-top:12px">重置所有进度</button>
        </div>
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
    alert('进度已重置。');
    rerender();
  });
}
