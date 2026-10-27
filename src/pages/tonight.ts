import type { AppContext } from '../app/state';
import { buildQueueForTonight } from '../app/session';
import { subjectName } from '../content/loader';
import { navigate } from '../router';
import { formatMinutes, shell, weekdayLabel } from './shell';

export function renderTonight(ctx: AppContext): string {
  const q = buildQueueForTonight(ctx.content, ctx.state, ctx.studyDate);
  const day = ctx.content.days.find((d) => d.date === ctx.studyDate);
  const todayTitles =
    day?.topics.map((t) => `${subjectName(ctx.content, t.subject)} · ${t.title}`).join(' · ') ||
    '今天还没有新的学习记录';

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
    ? new Date(ctx.progress.archive.archivedAt).toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '尚无归档';

  const est = formatMinutes(q.reservedFreeRecallSeconds + q.reservedCardSeconds);
  const estNum = est.replace(' 分钟', '');

  const leechHint = Object.keys(ctx.state.cards).some((id) => {
    const logs = ctx.state.logs.filter(
      (l) => l.cardId === id && l.kind === 'scheduled' && !l.voidedAt && l.rating === 1,
    );
    return new Set(logs.map((l) => l.studyDate)).size >= 3;
  });

  const body = `
    <header class="hero-meta">
      <p class="caption">晚间复习</p>
      <h1 class="large-title">${ctx.studyDate}<span class="muted" style="font-weight:600;font-size:1.1rem"> · 周${weekdayLabel(ctx.studyDate)}</span></h1>
      ${
        ctx.meta.hasUnarchivedChanges
          ? `<span class="status-chip warn">未归档 · ${archiveTime}</span>`
          : `<span class="status-chip">已同步基线 · ${archiveTime}</span>`
      }
    </header>

    ${ctx.loadError ? `<div class="banner danger">${ctx.loadError}</div>` : ''}
    ${ctx.conflict ? `<div class="banner danger">进度冲突，请先 <a href="#/conflict">处理冲突</a></div>` : ''}
    ${q.consecutiveDeferHint ? `<div class="banner">核心卡连续顺延：建议减少新增，优先重学薄弱内容。</div>` : ''}

    <section>
      <div class="group-label">今晚概览</div>
      <div class="group">
        <div class="stat-grid">
          <div class="stat"><div class="label">今日新学</div><div class="n">${newCount}<span style="font-size:0.9rem;font-weight:600;color:var(--text-secondary)"> 张</span></div></div>
          <div class="stat"><div class="label">到期复习</div><div class="n">${dueCount}<span style="font-size:0.9rem;font-weight:600;color:var(--text-secondary)"> 张</span></div></div>
          <div class="stat"><div class="label">预计用时</div><div class="n">${estNum}<span style="font-size:0.9rem;font-weight:600;color:var(--text-secondary)"> 分</span></div></div>
          <div class="stat"><div class="label">顺延</div><div class="n">${q.deferredCards.length}<span style="font-size:0.9rem;font-weight:600;color:var(--text-secondary)"> 张</span></div></div>
        </div>
      </div>
    </section>

    <section>
      <div class="group-label">详情</div>
      <div class="group">
        <div class="cell">
          <div class="cell-main">
            <div class="cell-title">今日学习</div>
            <div class="cell-sub">${todayTitles}</div>
          </div>
        </div>
        <div class="cell">
          <div class="cell-main">
            <div class="cell-title">待复习构成</div>
            <div class="cell-sub">已遗忘 ${forgotten} · 需巩固 ${consolidate} · 正常 ${normal}</div>
          </div>
        </div>
        <div class="cell">
          <div class="cell-main">
            <div class="cell-title">未排入本晚</div>
            <div class="cell-sub">自由回忆 ${q.unfinishedFreeRecall.length} · 转档案一般卡 ${q.archivedGeneral.length}</div>
          </div>
        </div>
        ${
          leechHint
            ? `<div class="cell"><div class="cell-main"><div class="cell-title">薄弱点</div><div class="cell-sub">报告中可标记已重学</div></div></div>`
            : ''
        }
      </div>
    </section>

    <div class="footer-actions">
      <button class="btn btn-primary" id="start-review" ${ctx.conflict ? 'disabled' : ''}>开始今晚复习</button>
      ${!day ? `<p class="caption" style="text-align:center">没有新内容时，仍可复习到期卡</p>` : ''}
    </div>
  `;

  return shell('tonight', body);
}

export function bindTonight(ctx: AppContext): void {
  document.getElementById('start-review')?.addEventListener('click', () => {
    navigate('#/review');
  });
  void ctx;
}
