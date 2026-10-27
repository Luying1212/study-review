import type { AppContext } from '../app/state';
import { persist } from '../app/state';
import { buildQueueForTonight } from '../app/session';
import { buildDailyReport } from '../reports/daily';
import { buildReviewPackage, downloadReviewPackage } from '../storage/backup';
import { markRelearned } from '../scheduler/ladder';
import { levelLabel, shell } from './shell';

function fmtMs(ms: number): string {
  const m = Math.round(ms / 60000);
  return `${m}`;
}

export function renderReport(ctx: AppContext, studyDate = ctx.studyDate): string {
  const q = buildQueueForTonight(ctx.content, ctx.state, studyDate);
  const report = buildDailyReport({
    state: ctx.state,
    content: ctx.content,
    studyDate,
    deferredCardIds: q.deferredCards.map((c) => c.cardId),
    unfinishedFreeRecallCount: q.unfinishedFreeRecall.length,
    archivedGeneralCardIds: q.archivedGeneral.map((a) => a.cardId),
  });

  const list = (title: string, items: Array<{ question: string; level: string; leech?: boolean }>) => `
    <section>
      <div class="group-label">${title}</div>
      <div class="group">
        ${
          items.length
            ? items
                .map(
                  (i) =>
                    `<div class="list-item"><div class="cell-title">${i.question}</div><div class="muted">${levelLabel(i.level)}${i.leech ? ' · 薄弱' : ''}</div></div>`,
                )
                .join('')
            : `<div class="cell"><div class="cell-sub">暂无</div></div>`
        }
      </div>
    </section>`;

  const body = `
    <div class="report-shot stack-lg">
      <header class="hero-meta">
        <p class="caption">每日报告</p>
        <h1 class="large-title" style="font-size:1.75rem">${studyDate}</h1>
        <p class="caption">表现记录，不是整科掌握认证</p>
      </header>

      <section>
        <div class="group-label">完成情况</div>
        <div class="group">
          <div class="stat-grid">
            <div class="stat"><div class="label">有效会话</div><div class="n">${report.sessionCount}</div></div>
            <div class="stat"><div class="label">正式完成</div><div class="n">${report.uniqueCompletedCards}<span style="font-size:0.9rem;color:var(--text-secondary);font-weight:600"> 张</span></div></div>
            <div class="stat"><div class="label">活跃用时</div><div class="n">${fmtMs(report.activeMs)}<span style="font-size:0.9rem;color:var(--text-secondary);font-weight:600"> 分</span></div></div>
            <div class="stat"><div class="label">顺延 / 未排自由回忆</div><div class="n" style="font-size:1.35rem">${report.deferredCardCount} / ${report.unfinishedFreeRecallCount}</div></div>
          </div>
        </div>
      </section>

      <section>
        <div class="group-label">首次评分分布</div>
        <div class="group">
          <div class="cell"><div class="cell-title">忘记</div><div class="cell-value">${report.firstRatingDistribution[1]}</div></div>
          <div class="cell"><div class="cell-title">困难</div><div class="cell-value">${report.firstRatingDistribution[2]}</div></div>
          <div class="cell"><div class="cell-title">掌握</div><div class="cell-value">${report.firstRatingDistribution[3]}</div></div>
          <div class="cell"><div class="cell-title">熟练</div><div class="cell-value">${report.firstRatingDistribution[4]}</div></div>
        </div>
      </section>

      ${list('独立回答比较顺利', report.smooth)}
      ${list('需要巩固', report.consolidate)}
      ${list('建议重新学习', report.relearn)}

      <section>
        <div class="group-label">补练与问题</div>
        <div class="group">
          <div class="cell">
            <div class="cell-main">
              <div class="cell-title">补练</div>
              <div class="cell-sub">${report.retryCount ? report.retries.map((r) => `${r.question} → ${r.rating}`).join('；') : '无'}</div>
            </div>
            <div class="cell-value">${report.retryCount}</div>
          </div>
          <div class="cell">
            <div class="cell-main">
              <div class="cell-title">问题 / 暂停 / 转档案</div>
              <div class="cell-sub">标记问题、暂停与已转档案的一般卡</div>
            </div>
            <div class="cell-value" style="font-size:0.95rem">${report.issueCardIds.length}/${report.suspendedCardIds.length}/${report.archivedGeneralCount}</div>
          </div>
        </div>
      </section>

      <section>
        <div class="group-label">我的补充</div>
        <div class="group" style="padding:14px">
          <textarea id="day-feedback" rows="3" placeholder="我具体卡在哪里（默认仅本地保留）">${ctx.state.dayFeedback[studyDate] ?? ''}</textarea>
          <button class="btn btn-secondary btn-block" id="save-feedback" style="margin-top:10px">保存补充</button>
        </div>
      </section>

      <section>
        <div class="group-label">下一步</div>
        <div class="group">
          <div class="cell">
            <div class="cell-main">
              <div class="cell-title">明日到期核心卡</div>
              <div class="cell-sub">含逾期；不含未来新增</div>
            </div>
            <div class="cell-value">${report.tomorrowDueCoreEstimate}</div>
          </div>
          <div class="cell">
            <div class="cell-main"><div class="cell-title">一般卡待办</div></div>
            <div class="cell-value">${report.generalPendingCount}</div>
          </div>
        </div>
      </section>

      <section>
        <div class="group-label">薄弱点</div>
        <div class="group">
          ${
            report.relearn.filter((r) => r.leech).length
              ? report.relearn
                  .filter((r) => r.leech)
                  .map(
                    (r) =>
                      `<div class="cell"><div class="cell-main"><div class="cell-title">${r.question}</div></div><button class="btn btn-secondary" style="min-height:36px;padding:0 12px;font-size:0.85rem" data-relearn="${r.cardId}">已重学</button></div>`,
                  )
                  .join('')
              : `<div class="cell"><div class="cell-sub">暂无多日反复失败的薄弱卡</div></div>`
          }
        </div>
      </section>

      <div class="footer-actions">
        <button class="btn btn-primary" id="export-pkg">导出今日复习包</button>
        <a class="btn-link" href="#/">可以睡觉了</a>
      </div>
    </div>`;
  return shell('report', body);
}

export function bindReport(ctx: AppContext, studyDate = ctx.studyDate): void {
  const q = buildQueueForTonight(ctx.content, ctx.state, studyDate);
  const report = buildDailyReport({
    state: ctx.state,
    content: ctx.content,
    studyDate,
    deferredCardIds: q.deferredCards.map((c) => c.cardId),
    unfinishedFreeRecallCount: q.unfinishedFreeRecall.length,
    archivedGeneralCardIds: q.archivedGeneral.map((a) => a.cardId),
  });

  document.getElementById('save-feedback')?.addEventListener('click', () => {
    const text = (document.getElementById('day-feedback') as HTMLTextAreaElement).value;
    ctx.state.dayFeedback[studyDate] = text;
    const err = persist(ctx);
    alert(err ?? '已保存补充（本地）');
  });

  document.getElementById('export-pkg')?.addEventListener('click', () => {
    const pkg = buildReviewPackage({
      state: ctx.state,
      meta: ctx.meta,
      studyDate,
      report,
    });
    downloadReviewPackage(pkg);
    ctx.meta.lastExportedPackageId = pkg.packageId;
    ctx.meta.lastExportedAt = pkg.exportedAt;
    ctx.meta.lastExportedRevision = ctx.meta.revision;
    persist(ctx, { bumpRevision: false, markUnarchived: false });
    ctx.meta.hasUnarchivedChanges = true;
    alert(`已下载复习包。下载成功不等于已上传 GitHub。`);
  });

  document.querySelectorAll('[data-relearn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.relearn!;
      const cs = ctx.state.cards[id];
      if (!cs) return;
      ctx.state.cards[id] = markRelearned(cs, studyDate, new Date().toISOString());
      persist(ctx);
      alert('已标记重学：历史保留，薄弱统计从此后起算。');
      location.reload();
    });
  });
}
