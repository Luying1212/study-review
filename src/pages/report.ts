import type { AppContext } from '../app/state';
import { persist } from '../app/state';
import { buildQueueForTonight } from '../app/session';
import { buildDailyReport } from '../reports/daily';
import { buildReviewPackage, downloadReviewPackage } from '../storage/backup';
import { markRelearned } from '../scheduler/ladder';
import { shell } from './shell';

function fmtMs(ms: number): string {
  const m = Math.round(ms / 60000);
  return `${m} 分钟`;
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
    <section class="panel">
      <h3>${title}</h3>
      ${
        items.length
          ? items
              .map(
                (i) =>
                  `<div class="list-item"><div>${i.question}</div><div class="muted">${i.level}${i.leech ? ' · 薄弱' : ''}</div></div>`,
              )
              .join('')
          : '<p class="muted">无</p>'
      }
    </section>`;

  const body = `
    <div class="stack report-shot">
      <h1>每日复习报告 · ${studyDate}</h1>
      <p class="muted">表现记录，不是整科掌握认证。不含学会百分比。</p>
      <section class="panel stat-grid">
        <div class="stat"><div class="muted">有效会话</div><div class="n">${report.sessionCount}</div></div>
        <div class="stat"><div class="muted">正式完成卡</div><div class="n">${report.uniqueCompletedCards}</div></div>
        <div class="stat"><div class="muted">活跃用时</div><div class="n">${fmtMs(report.activeMs)}</div></div>
        <div class="stat"><div class="muted">顺延 / 未完成自由回忆</div><div class="n">${report.deferredCardCount} / ${report.unfinishedFreeRecallCount}</div></div>
      </section>
      <p class="muted">首次评分：忘记 ${report.firstRatingDistribution[1]} · 困难 ${report.firstRatingDistribution[2]} · 掌握 ${report.firstRatingDistribution[3]} · 熟练 ${report.firstRatingDistribution[4]}</p>
      ${list('独立回答比较顺利', report.smooth)}
      ${list('需要巩固', report.consolidate)}
      ${list('建议重新学习', report.relearn)}
      <section class="panel">
        <h3>补练结果（单列）</h3>
        <p>次数 ${report.retryCount}${report.retries.length ? '：' : ''}${report.retries.map((r) => `${r.question}→${r.rating}`).join('；')}</p>
      </section>
      <section class="panel">
        <h3>问题卡 / 暂停 / 已转档案一般卡</h3>
        <p class="muted">问题 ${report.issueCardIds.length} · 暂停 ${report.suspendedCardIds.length} · 转档案 ${report.archivedGeneralCount}</p>
      </section>
      <section class="panel stack">
        <h3>我的补充</h3>
        <textarea id="day-feedback" rows="3" placeholder="我具体卡在哪里（默认仅本地/下载包保留）">${ctx.state.dayFeedback[studyDate] ?? ''}</textarea>
        <button class="btn" id="save-feedback">保存补充</button>
      </section>
      <section class="panel">
        <h3>下一步</h3>
        <p>预计明日到期核心卡（含逾期）：${report.tomorrowDueCoreEstimate}；一般卡待办：${report.generalPendingCount}。未包含未来新增内容。</p>
      </section>
      <section class="panel stack">
        <h3>薄弱点 · 标记已重学</h3>
        ${
          report.relearn.filter((r) => r.leech).length
            ? report.relearn
                .filter((r) => r.leech)
                .map(
                  (r) =>
                    `<div class="row list-item"><span>${r.question}</span><button class="btn" data-relearn="${r.cardId}">标记已重学</button></div>`,
                )
                .join('')
            : '<p class="muted">暂无多日反复失败的薄弱卡</p>'
        }
      </section>
      <div class="stack">
        <button class="btn btn-primary" id="export-pkg">导出今日复习包</button>
        <a class="btn" href="#/" style="text-align:center;display:block;line-height:var(--tap);text-decoration:none">可以睡觉了 🌙</a>
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
    // 导出本身不清除未归档标记——归档确认后才清；但记录导出信息
    ctx.meta.hasUnarchivedChanges = true;
    alert(`已下载 ${pkg.packageId}。下载成功不等于已上传 GitHub。`);
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
