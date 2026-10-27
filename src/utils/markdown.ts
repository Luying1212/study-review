import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import java from 'highlight.js/lib/languages/java';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';

hljs.registerLanguage('python', python);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('java', java);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('py', python);

marked.setOptions({
  gfm: true,
  breaks: true,
});

export function renderMarkdown(md: string): string {
  const dirty = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(dirty);
}

export function highlightCodeBlocks(root: ParentNode): void {
  root.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightElement(block as HTMLElement);
  });
}

/** cloze: {{c1::答案}} → 挖空展示 */
export function renderClozeQuestion(question: string, revealed: boolean): string {
  return question.replace(/\{\{c\d+::([^}]+)\}\}/g, (_m, ans: string) =>
    revealed ? `<mark class="cloze-ans">${escapeHtml(ans)}</mark>` : `<span class="cloze-blank">____</span>`,
  );
}

/** 报告等纯文本场景：把挖空标记展成「答案」或下划线 */
export function plainClozeQuestion(question: string, fillWithAnswer = true): string {
  return question.replace(/\{\{c\d+::([^}]+)\}\}/g, (_m, ans: string) =>
    fillWithAnswer ? ans : '____',
  );
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
