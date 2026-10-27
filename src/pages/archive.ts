import type { AppContext } from '../app/state';
import { persist } from '../app/state';
import { promoteCard } from '../app/session';
import { subjectName } from '../content/loader';
import { shell } from './shell';
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
              let status = c.status;
              if (c.retired) status = 'retired' as typeof c.status;
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
                <div class="row">
                  <span class="tag">${c.level}</span>
                  <span class="tag">${c.tier}${promoted ? '+core' : ''}</span>
                  <span class="muted">${status} · ${dueLabel}</span>
                </div>
                <div>${c.question}</div>
                <div class="row" style="margin-top:8px">
                  <button class="btn" data-toggle-suspend="${c.id}">${suspended ? '恢复' : '暂停'}</button>
                  ${c.tier === 'general' && !promoted ? `<button class="btn" data-promote="${c.id}">升级核心</button>` : ''}
                </div>
              </div>`;
            })
            .join('');
          return `<div class="panel stack">
            <h3>${subjectName(ctx.content, t.subject)} · ${t.title}</h3>
            <div class="notes-box">${renderMarkdown(t.notes)}</div>
            ${day.tempNotes?.length ? `<p class="muted">临时：${day.tempNotes.join('；')}</p>` : ''}
            ${cardHtml}
          </div>`;
        })
        .join('');
      return `<h2>${day.date}</h2><p class="muted">${day.summary}</p>${topics}`;
    })
    .join('');

  return shell(
    'archive',
    `<div class="stack"><h1>学习档案</h1><p class="muted">首版按日期浏览；科目搜索可在试用后补充。</p>${sections || '<p>暂无内容</p>'}</div>`,
  );
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
