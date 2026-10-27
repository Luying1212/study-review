import type { Route } from '../router';

const NAV_ICONS: Record<string, string> = {
  tonight: '◎',
  report: '☰',
  archive: '▢',
  settings: '⚙',
};

export function shell(active: Route['name'], body: string): string {
  const link = (name: string, href: string, label: string) =>
    `<a href="${href}" class="${active === name ? 'active' : ''}" aria-current="${active === name ? 'page' : 'false'}">
      <span class="nav-icon" aria-hidden="true">${NAV_ICONS[name] ?? '·'}</span>
      <span>${label}</span>
    </a>`;
  return `
    <div class="page stack-lg">
      ${body}
    </div>
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
  const m = Math.max(1, Math.round(seconds / 60));
  return `${m} 分钟`;
}

export function levelLabel(level: string): string {
  if (level === 'recall') return '回忆';
  if (level === 'explain') return '解释';
  if (level === 'apply') return '应用';
  return level;
}

export function tierLabel(tier: string): string {
  if (tier === 'core') return '核心';
  if (tier === 'general') return '一般';
  return tier;
}
