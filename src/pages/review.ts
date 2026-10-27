import type { AppContext } from '../app/state';
import { persist } from '../app/state';
import {
  applyRating,
  buildQueueForTonight,
  clearSessionUi,
  createSession,
  finalizeSession,
  loadSessionUi,
  nextLabelForRating,
  promoteCard,
  reportIssue,
  saveSessionUi,
  undoLast,
  type SessionUiState,
} from '../app/session';
import { subjectName } from '../content/loader';
import { navigate } from '../router';
import { highlightCodeBlocks, renderClozeQuestion, renderMarkdown } from '../utils/markdown';
import { levelLabel, shell, tierLabel } from './shell';

let ui: SessionUiState | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;

function ensureUi(ctx: AppContext): SessionUiState {
  const existing = loadSessionUi();
  if (existing && existing.studyDate === ctx.studyDate) {
    ui = existing;
    return existing;
  }
  const queue = buildQueueForTonight(ctx.content, ctx.state, ctx.studyDate);
  ui = createSession(queue, ctx.studyDate);
  saveSessionUi(ui);
  return ui;
}

function totalSteps(u: SessionUiState): number {
  return u.queue.freeRecall.length + u.queue.cards.length + u.retryQueue.length + 1;
}

function doneSteps(u: SessionUiState): number {
  if (u.phase === 'free-recall') return u.freeRecallIndex;
  if (u.phase === 'cards') return u.queue.freeRecall.length + u.cardIndex;
  if (u.phase === 'notes') return u.queue.freeRecall.length + u.queue.cards.length;
  return totalSteps(u);
}

export function renderReview(ctx: AppContext): string {
  const u = ensureUi(ctx);
  const pct = Math.min(100, Math.round((doneSteps(u) / Math.max(1, totalSteps(u))) * 100));
  let main = '';

  if (u.phase === 'free-recall') {
    const fr = u.queue.freeRecall[u.freeRecallIndex];
    if (!fr) {
      u.phase = u.queue.cards.length ? 'cards' : 'notes';
      saveSessionUi(u);
      return renderReview(ctx);
    }
    main = `
      <div class="review-card stack">
        <div class="review-meta">
          <span class="tag">自由回忆</span>
          <span class="tag">${subjectName(ctx.content, fr.subject)}</span>
        </div>
        <div class="review-question">${fr.title}</div>
        <p class="muted">${fr.prompt}</p>
        <textarea id="fr-text" rows="5" placeholder="可选：写下回忆要点"></textarea>
        <button class="btn btn-primary" id="fr-done">我回忆完了</button>
      </div>`;
  } else if (u.phase === 'cards') {
    const inRetry = u.cardIndex >= u.queue.cards.length;
    const cardId = inRetry
      ? u.retryQueue[u.cardIndex - u.queue.cards.length]
      : u.queue.cards[u.cardIndex]?.cardId;
    if (!cardId) {
      u.phase = 'notes';
      saveSessionUi(u);
      return renderReview(ctx);
    }
    const card = ctx.content.cardsById[cardId];
    const meta = ctx.content.topicByCardId[cardId];
    const kind = inRetry ? 'retry' : 'scheduled';
    const qHtml =
      card.type === 'cloze'
        ? renderClozeQuestion(card.question, u.answerRevealed)
        : `<p>${card.question}</p>`;
    const assist = u.usedHint || u.viewedNotesTopics.includes(meta?.topicId ?? '');
    const questionBody =
      card.type === 'cloze' ? qHtml : `<div class="review-question">${card.question}</div>`;
    main = `
      <div class="review-card stack">
        <div class="review-meta">
          <span class="tag">${subjectName(ctx.content, meta?.subject ?? '')}</span>
          <span class="tag">${levelLabel(card.level)}</span>
          <span class="tag ${card.tier === 'core' ? 'tag-core' : 'tag-general'}">${tierLabel(card.tier)}</span>
          ${kind === 'retry' ? '<span class="tag tag-warn">补练</span>' : ''}
        </div>
        <p class="caption">${meta?.topicTitle ?? ''}</p>
        ${questionBody}
        <textarea id="answer-input" class="${card.type === 'code' ? 'mono' : ''}" rows="4" placeholder="可选作答">${u.typedAnswer}</textarea>
        <div class="toolbar">
          <button class="btn" id="btn-hint" ${u.usedHint || !card.hint ? 'disabled' : ''}>提示</button>
          <button class="btn" id="btn-peek-notes">先看笔记</button>
          <button class="btn" id="btn-issue">题目有问题</button>
          ${card.tier === 'general' && !ctx.state.promoted.includes(cardId) ? '<button class="btn" id="btn-promote">加入长期复习</button>' : ''}
        </div>
        ${u.usedHint && card.hint ? `<p class="caption">提示：${card.hint}</p>` : ''}
        ${
          u.answerRevealed
            ? `<div class="answer-box reveal">
                 <p class="caption" style="margin-bottom:8px">参考答案</p>
                 <div id="answer-md">${renderMarkdown(card.answer)}</div>
                 ${card.rubric ? `<p class="caption" style="margin-top:10px">要点：${card.rubric.join('；')}</p>` : ''}
                 ${u.typedAnswer ? `<p class="caption" style="margin-top:12px">你的回答</p><pre>${escape(u.typedAnswer)}</pre>` : ''}
               </div>
               <div class="rating-grid" id="rating-grid">
                 ${[1, 2, 3, 4]
                   .map((r) => {
                     const labels = ['忘记', '困难', '掌握', '熟练'];
                     const next =
                       kind === 'retry'
                         ? '不改日期'
                         : nextLabelForRating(ctx.content, ctx.state, cardId, r as 1 | 2 | 3 | 4, assist);
                     return `<button class="btn rating-btn" data-rating="${r}"><strong>${labels[r - 1]}</strong><small>下次：${next}</small></button>`;
                   })
                   .join('')}
               </div>`
            : `<button class="btn btn-primary" id="btn-reveal">查看答案</button>`
        }
        <div class="row" style="justify-content:space-between">
          <button class="btn btn-ghost" id="btn-undo" ${u.undoSnapshot ? '' : 'disabled'}>撤销上一步</button>
          <button class="btn btn-ghost" id="btn-abort">提前结束</button>
        </div>
      </div>`;
  } else if (u.phase === 'notes') {
    const topicIds = [
      ...new Set([
        ...u.queue.freeRecall.map((f) => f.topicId),
        ...u.queue.cards.map((c) => c.topicId),
      ]),
    ];
    const blocks = topicIds
      .map((tid) => {
        let topic = null as
          | { title: string; notes: string; selfAssessment: string; subject: string }
          | null;
        for (const day of ctx.content.days) {
          const t = day.topics.find((x) => x.id === tid);
          if (t) {
            topic = t;
            break;
          }
        }
        if (!topic) return '';
        return `<div class="group" style="padding:16px">
          <h2 style="font-size:1.1rem;margin-bottom:6px">${topic.title}</h2>
          <p class="caption" style="margin-bottom:12px">自评：${topic.selfAssessment}</p>
          <div class="notes-box" data-notes="${tid}">${renderMarkdown(topic.notes)}</div>
        </div>`;
      })
      .join('');
    main = `
      <div class="stack-lg">
        <header class="hero-meta">
          <h1 class="large-title" style="font-size:1.6rem">总结对照</h1>
          <p class="caption">先答完再看笔记，避免先读答案再自评。</p>
        </header>
        ${blocks || '<div class="group"><div class="cell"><div class="cell-sub">本晚无总结可对照</div></div></div>'}
        <button class="btn btn-primary" id="btn-finish">进入每日报告</button>
      </div>`;
  } else {
    main = `<div class="group stack" style="padding:20px">
      <p>会话已结束</p>
      <a class="btn btn-primary" href="#/report" style="display:grid;place-items:center">查看报告</a>
    </div>`;
  }

  const body = `
    <div class="stack-lg">
      <div>
        <div class="progress-track" aria-label="进度"><span style="width:${pct}%"></span></div>
        <p class="caption" style="margin-top:8px">进度 ${pct}% · 预算 ${ctx.state.settings.budgetMinutes} 分钟</p>
      </div>
      ${main}
    </div>`;
  return shell('tonight', body);
}

function escape(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function bindReview(ctx: AppContext, rerender: () => void): void {
  const u = ensureUi(ctx);
  highlightCodeBlocks(document);

  const input = document.getElementById('answer-input') as HTMLTextAreaElement | null;
  input?.addEventListener('input', () => {
    u.typedAnswer = input.value;
    saveSessionUi(u);
  });

  document.getElementById('fr-done')?.addEventListener('click', () => {
    const fr = u.queue.freeRecall[u.freeRecallIndex];
    if (fr) u.freeRecallDone.push(fr.topicId);
    u.freeRecallIndex += 1;
    if (u.freeRecallIndex >= u.queue.freeRecall.length) {
      u.phase = u.queue.cards.length ? 'cards' : 'notes';
    }
    saveSessionUi(u);
    rerender();
  });

  document.getElementById('btn-hint')?.addEventListener('click', () => {
    u.usedHint = true;
    saveSessionUi(u);
    rerender();
  });

  document.getElementById('btn-peek-notes')?.addEventListener('click', () => {
    const cardId =
      u.cardIndex >= u.queue.cards.length
        ? u.retryQueue[u.cardIndex - u.queue.cards.length]
        : u.queue.cards[u.cardIndex]?.cardId;
    const topicId = cardId ? ctx.content.topicByCardId[cardId]?.topicId : null;
    if (topicId && !u.viewedNotesTopics.includes(topicId)) u.viewedNotesTopics.push(topicId);
    const topic = ctx.content.days.flatMap((d) => d.topics).find((t) => t.id === topicId);
    if (topic) alert(`笔记预览：\n\n${topic.notes.slice(0, 500)}`);
    saveSessionUi(u);
    rerender();
  });

  document.getElementById('btn-reveal')?.addEventListener('click', () => {
    u.answerRevealed = true;
    saveSessionUi(u);
    rerender();
  });

  document.getElementById('btn-promote')?.addEventListener('click', () => {
    const cardId = u.queue.cards[u.cardIndex]?.cardId;
    if (!cardId) return;
    ctx.state = promoteCard(ctx.state, ctx.content, cardId, ctx.studyDate);
    const err = persist(ctx);
    if (err) alert(err);
    rerender();
  });

  document.getElementById('btn-issue')?.addEventListener('click', () => {
    const cardId =
      u.cardIndex >= u.queue.cards.length
        ? u.retryQueue[u.cardIndex - u.queue.cards.length]
        : u.queue.cards[u.cardIndex]?.cardId;
    if (!cardId) return;
    const reason = prompt('问题原因：wrong-answer / ambiguous / typo / duplicate / out-of-scope / other', 'ambiguous');
    if (!reason) return;
    const note = prompt('可选备注（仅本地包保留）') ?? undefined;
    ctx.state = reportIssue(ctx.state, cardId, reason as 'ambiguous', note || undefined);
    // 跳过当前卡
    if (u.cardIndex < u.queue.cards.length) u.cardIndex += 1;
    else u.retryQueue.shift();
    const err = persist(ctx);
    if (err) alert(err);
    saveSessionUi(u);
    rerender();
  });

  document.querySelectorAll('[data-rating]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rating = Number((btn as HTMLElement).dataset.rating) as 1 | 2 | 3 | 4;
      rate(ctx, u, rating, rerender);
    });
  });

  document.getElementById('btn-undo')?.addEventListener('click', () => {
    const result = undoLast(ctx.state, u);
    ctx.state = result.state;
    ui = result.ui;
    persist(ctx);
    saveSessionUi(result.ui);
    rerender();
  });

  document.getElementById('btn-abort')?.addEventListener('click', () => {
    finish(ctx, u, 'aborted');
  });

  document.getElementById('btn-finish')?.addEventListener('click', () => {
    for (const el of document.querySelectorAll('[data-notes]')) {
      const tid = (el as HTMLElement).dataset.notes;
      if (tid && !u.notesDone.includes(tid)) u.notesDone.push(tid);
    }
    finish(ctx, u, 'completed');
  });

  if (keyHandler) window.removeEventListener('keydown', keyHandler);
  keyHandler = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    if (e.code === 'Space' && u.phase === 'cards' && !u.answerRevealed) {
      e.preventDefault();
      u.answerRevealed = true;
      saveSessionUi(u);
      rerender();
    }
    if (u.answerRevealed && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
      const rating = Number(e.code.replace('Digit', '')) as 1 | 2 | 3 | 4;
      rate(ctx, u, rating, rerender);
    }
  };
  window.addEventListener('keydown', keyHandler);
}

function rate(ctx: AppContext, u: SessionUiState, rating: 1 | 2 | 3 | 4, rerender: () => void): void {
  const inRetry = u.cardIndex >= u.queue.cards.length;
  const cardId = inRetry
    ? u.retryQueue[0]
    : u.queue.cards[u.cardIndex]?.cardId;
  if (!cardId || !u.answerRevealed) return;
  const actionId = crypto.randomUUID();
  const result = applyRating({
    state: ctx.state,
    content: ctx.content,
    ui: u,
    cardId,
    rating,
    kind: inRetry ? 'retry' : 'scheduled',
    actionId,
  });
  if (result.duplicate) return;
  ctx.state = result.state;
  ui = result.ui;
  if (!inRetry) ui.cardIndex += 1;
  // 进入补练阶段
  if (ui.cardIndex >= ui.queue.cards.length && ui.retryQueue.length === 0) {
    ui.phase = 'notes';
  }
  const err = persist(ctx);
  if (err) alert(err);
  saveSessionUi(ui);
  rerender();
}

function finish(ctx: AppContext, u: SessionUiState, status: 'completed' | 'aborted'): void {
  ctx.state = finalizeSession(ctx.state, u, status);
  persist(ctx);
  clearSessionUi();
  ui = null;
  navigate('#/report');
}
