import type { Route } from '../router';

export function shell(active: Route['name'], body: string): string {
  const link = (name: string, href: string, label: string) =>
    `<a href="${href}" class="${active === name ? 'active' : ''}">${label}</a>`;
  return `
    ${body}
    <nav class="nav" aria-label="主导航">
      ${link('tonight', '#/', '今晚')}
      ${link('report', '#/report', '报告')}
      ${link('archive', '#/archive', '档案')}
      ${link('settings', '#/settings', '设置')}
    </nav>
  `;
}

export function weekdayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const names = ['日', '一', '二', '三', '四', '五', '六'];
  return names[dt.getUTCDay()];
}

export function formatMinutes(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} 分钟`;
}
