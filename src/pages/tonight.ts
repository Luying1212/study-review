import type { AppContext } from '../app/state';
import { buildQueueForTonight } from '../app/session';
import { subjectName } from '../content/loader';
import { navigate } from '../router';
import { formatMinutes, shell, weekdayLabel } from './shell';

export function renderTonight(ctx: AppContext): string {
  const q = buildQueueForTonight(ctx.content, ctx.state, ctx.studyDate);
  const day = ctx.content.days.find((d) => d.date === ctx.studyDate);
  const todayTitles =
    day?.topics.map((t) => `${subjectName(ctx.content, t.subject)} · ${t.title}`).join(' | ') ||
    'Codex 今天还没有上传学习记录';

  const dueCount = q.cards.length;
  const newCount = day
    ? day.topics.reduce((n, t) => n + (t.cards?.filter((c) => c.status === 'ready').length ?? 0), 0)
    : 0;

  let forgotten = 0;
  let consolidate = 0;
  let normal = 0;
  for (const item of q.cards) {
    const cs = ctx.state.cards[item.cardId];
    if (cs?.lastRating === 1) forgotten += 1;
    else if (cs?.lastRating === 2) consolidate += 1;
    else normal += 1;
  }

  const archiveTime = ctx.progress.archive?.archivedAt
    ? new Date(ctx.progress.archive.archivedAt).toLocaleString('zh-CN')
    : '尚无归档';

  const leechHint = Object.keys(ctx.state.cards).some((id) => {
    const logs = ctx.state.logs.filter((l) => l.cardId === id && l.kind === 'scheduled' && !l.voidedAt && l.rating === 1);
    const days = new Set(logs.map((l) => l.studyDate));
    return days.size >= 3;
  });

  const body = `
    <header class="stack">
      <h1>今晚复习 · ${ctx.studyDate}（周${weekdayLabel(ctx.studyDate)}）</h1>
      ${ctx.loadError ? `<div class="banner danger">${ctx.loadError}</div>` : ''}
      ${ctx.conflict ? `<div class="banner danger">进度冲突：请先到设置页处理，或 <a href="#/conflict">查看冲突</a></div>` : ''}
      ${ctx.meta.hasUnarchivedChanges ? `<div class="banner">本地有未归档进度 · 最近归档：${archiveTime}</div>` : `<p class="muted">最近归档：${archiveTime}</p>`}
      ${q.consecutiveDeferHint ? `<div class="banner">连续多日有核心卡因预算未完成：建议减少新增核心卡，并重学反复失败内容。</div>` : ''}
    </header>
    <section class="panel stack" style="margin-top:16px">
      <div class="stat-grid">
        <div class="stat"><div class="muted">今日新学</div><div class="n">${newCount} 张</div></div>
        <div class="stat"><div class="muted">到期复习</div><div class="n">${dueCount} 张</div></div>
        <div class="stat"><div class="muted">预计用时</div><div class="n">${formatMinutes(q.reservedFreeRecallSeconds + q.reservedCardSeconds)}</div></div>
        <div class="stat"><div class="muted">顺延</div><div class="n">${q.deferredCards.length} 张</div></div>
      </div>
      <p><strong>今日学习：</strong>${todayTitles}</p>
      <p class="muted">待复习：已遗忘 ${forgotten} · 需巩固 ${consolidate} · 正常 ${normal}</p>
      <p class="muted">未安排自由回忆 ${q.unfinishedFreeRecall.length} 项 · 已转档案一般卡 ${q.archivedGeneral.length} 张</p>
      <button class="btn btn-primary" id="start-review" ${ctx.conflict ? 'disabled' : ''}>开始今晚复习</button>
      ${leechHint ? `<p class="muted">⚠️ 存在薄弱点（详见报告）</p>` : ''}
      ${!day ? `<p class="muted">仍可复习到期卡。</p>` : ''}
    </section>
  `;

  return shell('tonight', body);
}

export function bindTonight(ctx: AppContext): void {
  document.getElementById('start-review')?.addEventListener('click', () => {
    navigate('#/review');
  });
  void ctx;
}
