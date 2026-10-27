import type { AppContext } from '../app/state';
import { persist } from '../app/state';
import { promoteCard } from '../app/session';
import { subjectName } from '../content/loader';
import { shell, levelLabel, tierLabel } from './shell';
import { renderMarkdown, highlightCodeBlocks } from '../utils/markdown';

export function renderArchive(ctx: AppContext): string {
  const days = [...ctx.content.days].sort((a, b) => b.date.localeCompare(a.date));
  const sections = days
    .map((day) => {
      const topics = day.topics
        .map((t) => {
          const cards = [
            ...(t.cards ?? []),
            ...(t.cardRefs ?? []).map((id) => ctx.content.cardsById[id]).filter(Boolean),
          ];
          const cardHtml = cards
            .map((c) => {
              const cs = ctx.state.cards[c.id];
              const suspended = ctx.state.suspended.includes(c.id);
              const promoted = ctx.state.promoted.includes(c.id);
              let statusLabel = c.status === 'ready' ? '可复习' : c.status;
              if (c.retired) statusLabel = '已废弃';
              const dueLabel =
                c.retired || c.status !== 'ready'
                  ? '不出题'
                  : suspended
                    ? '已暂停'
                    : cs?.due
                      ? `下次 ${cs.due}`
                      : cs?.reps
                        ? '一般卡已完成'
                        : '待首次';
              return `<div class="list-item">
                <div class="row" style="margin-bottom:8px">
                  <span class="tag">${levelLabel(c.level)}</span>
                  <span class="tag ${c.tier === 'core' || promoted ? 'tag-core' : 'tag-general'}">${tierLabel(c.tier)}${promoted ? ' · 已升级' : ''}</span>
                  <span class="caption">${statusLabel} · ${dueLabel}</span>
                </div>
                <div class="cell-title">${c.question}</div>
                <div class="toolbar" style="margin-top:12px">
                  <button class="btn" data-toggle-suspend="${c.id}">${suspended ? '恢复' : '暂停'}</button>
                  ${c.tier === 'general' && !promoted ? `<button class="btn" data-promote="${c.id}">升级核心</button>` : ''}
                </div>
              </div>`;
            })
            .join('');
          return `<section>
            <div class="group-label">${subjectName(ctx.content, t.subject)}</div>
            <div class="group" style="padding:16px">
              <h2 style="font-size:1.15rem;margin-bottom:6px">${t.title}</h2>
              <div class="notes-box" style="margin:12px 0">${renderMarkdown(t.notes)}</div>
              ${day.tempNotes?.length ? `<p class="caption" style="margin-bottom:8px">临时：${day.tempNotes.join('；')}</p>` : ''}
              ${cardHtml}
            </div>
          </section>`;
        })
        .join('');
      return `<h2 class="day-heading">${day.date}</h2><p class="caption" style="margin:-4px 0 12px">${day.summary}</p>${topics}`;
    })
    .join('');

  const body = `
    <header class="hero-meta">
      <p class="caption">学习档案</p>
      <h1 class="large-title">内容库</h1>
      <p class="caption">按日期浏览；暂停与升级在此操作</p>
    </header>
    ${sections || `<div class="group"><div class="cell"><div class="cell-sub">暂无内容</div></div></div>`}
  `;
  return shell('archive', body);
}

export function bindArchive(ctx: AppContext, rerender: () => void): void {
  highlightCodeBlocks(document);
  document.querySelectorAll('[data-toggle-suspend]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.toggleSuspend!;
      const i = ctx.state.suspended.indexOf(id);
      if (i >= 0) ctx.state.suspended.splice(i, 1);
      else ctx.state.suspended.push(id);
      persist(ctx);
      rerender();
    });
  });
  document.querySelectorAll('[data-promote]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.promote!;
      ctx.state = promoteCard(ctx.state, ctx.content, id, ctx.studyDate);
      persist(ctx);
      rerender();
    });
  });
}
