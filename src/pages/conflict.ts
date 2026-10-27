import type { AppContext } from '../app/state';
import { applyArchiveToLocal } from '../storage/reconcile';
import { buildReviewPackage, downloadReviewPackage } from '../storage/backup';
import { buildDailyReport } from '../reports/daily';
import { replaceState } from '../storage/store';
import { shell } from './shell';
import { navigate } from '../router';

export function renderConflict(ctx: AppContext): string {
  if (!ctx.conflict || ctx.conflict.action !== 'conflict') {
    return shell('settings', `<div class="panel"><p>当前无冲突。</p><a href="#/">返回</a></div>`);
  }
  const a = ctx.conflict.archive;
  const localLogs = ctx.state.logs.filter((l) => !l.voidedAt).length;
  const archLogs = a.state.logs.filter((l) => !l.voidedAt).length;
  return shell(
    'settings',
    `<div class="stack">
      <h1>进度冲突</h1>
      <div class="banner danger">${ctx.conflict.reason}</div>
      <section class="panel">
        <h3>本地</h3>
        <p>revision ${ctx.meta.revision} · 有效评分日志 ${localLogs} · 基线 ${ctx.meta.baseArchiveId ?? 'null'}</p>
      </section>
      <section class="panel">
        <h3>仓库归档</h3>
        <p>archiveId ${a.archiveId} · revision ${a.source.revision} · 有效评分日志 ${archLogs}</p>
        <p class="muted">归档时间 ${new Date(a.archivedAt).toLocaleString('zh-CN')}</p>
      </section>
      <p>第一版不做逐卡合并。请先导出双方，再明确选择保留哪一侧。</p>
      <div class="stack">
        <button class="btn" id="export-local">导出本地侧</button>
        <button class="btn" id="export-archive">导出仓库侧</button>
        <button class="btn btn-primary" id="keep-local">保留本地（基线指向当前归档，保留未归档标记）</button>
        <button class="btn btn-danger" id="keep-archive">采用仓库版本（完整替换）</button>
      </div>
    </div>`,
  );
}

export function bindConflict(ctx: AppContext): void {
  if (!ctx.conflict || ctx.conflict.action !== 'conflict') return;
  const archive = ctx.conflict.archive;

  const mkPkg = (state = ctx.state) => {
    const report = buildDailyReport({ state, content: ctx.content, studyDate: ctx.studyDate });
    return buildReviewPackage({ state, meta: ctx.meta, studyDate: ctx.studyDate, report });
  };

  document.getElementById('export-local')?.addEventListener('click', () => {
    downloadReviewPackage(mkPkg(ctx.state));
  });
  document.getElementById('export-archive')?.addEventListener('click', () => {
    downloadReviewPackage(
      buildReviewPackage({
        state: archive.state,
        meta: { ...ctx.meta, revision: archive.source.revision, deviceId: archive.source.deviceId },
        studyDate: ctx.studyDate,
        report: archive.reportSummary,
      }),
    );
  });
  document.getElementById('keep-local')?.addEventListener('click', () => {
    if (!confirm('保留本地整份进度。另一分支独有记录不会合并。继续？')) return;
    downloadReviewPackage(mkPkg(archive.state));
    downloadReviewPackage(mkPkg(ctx.state));
    ctx.meta.baseArchiveId = archive.archiveId;
    ctx.meta.hasUnarchivedChanges = true;
    replaceState(ctx.state, ctx.meta, ctx.storage);
    ctx.conflict = null;
    alert('已保留本地。请重新导出复习包后再归档。');
    navigate('#/');
  });
  document.getElementById('keep-archive')?.addEventListener('click', () => {
    if (!confirm('采用仓库版本将完整替换本地。已先请导出双方。继续？')) return;
    downloadReviewPackage(mkPkg(ctx.state));
    downloadReviewPackage(mkPkg(archive.state));
    const applied = applyArchiveToLocal(archive, ctx.meta, { clearUnarchived: true });
    ctx.state = applied.state;
    ctx.meta = applied.meta;
    replaceState(ctx.state, ctx.meta, ctx.storage);
    ctx.conflict = null;
    alert('已采用仓库版本。');
    navigate('#/');
  });
}
