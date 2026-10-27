import './styles/main.css';
import 'highlight.js/styles/github-dark.css';
import { loadContent, loadProgressBundle } from './content/loader';
import { bootContext, type AppContext } from './app/state';
import { onRoute, type Route } from './router';
import { renderTonight, bindTonight } from './pages/tonight';
import { renderReview, bindReview } from './pages/review';
import { renderReport, bindReport } from './pages/report';
import { renderArchive, bindArchive } from './pages/archive';
import { renderSettings, bindSettings } from './pages/settings';
import { renderConflict, bindConflict } from './pages/conflict';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app missing');
const app: HTMLDivElement = root;

let ctx: AppContext | null = null;

async function boot(): Promise<void> {
  app.innerHTML = `<p class="caption page" style="padding:28px 8px">加载中…</p>`;
  try {
    const [content, progress] = await Promise.all([loadContent(), loadProgressBundle()]);
    ctx = bootContext(content, progress);
    onRoute((route) => render(route));
  } catch (e) {
    app.innerHTML = `<div class="page stack-lg" style="padding-top:24px">
      <div class="banner danger">
        <h1 style="font-size:1.2rem;margin-bottom:8px">无法加载数据</h1>
        <p>${e instanceof Error ? e.message : String(e)}</p>
        <p class="caption" style="margin-top:8px">请确认已运行 npm run content，并以正确子路径访问。</p>
      </div>
    </div>`;
  }
}

function render(route: Route): void {
  if (!ctx) return;
  const rerender = () => render(route);
  switch (route.name) {
    case 'tonight':
      app.innerHTML = renderTonight(ctx);
      bindTonight(ctx);
      break;
    case 'review':
      app.innerHTML = renderReview(ctx);
      bindReview(ctx, rerender);
      break;
    case 'report':
      app.innerHTML = renderReport(ctx, route.studyDate ?? ctx.studyDate);
      bindReport(ctx, route.studyDate ?? ctx.studyDate);
      break;
    case 'archive':
      app.innerHTML = renderArchive(ctx);
      bindArchive(ctx, rerender);
      break;
    case 'settings':
      app.innerHTML = renderSettings(ctx);
      bindSettings(ctx, rerender);
      break;
    case 'conflict':
      app.innerHTML = renderConflict(ctx);
      bindConflict(ctx);
      break;
    case 'weak':
      // 首版薄弱点入口并入报告
      location.hash = '#/report';
      break;
    default:
      app.innerHTML = renderTonight(ctx);
      bindTonight(ctx);
  }
}

void boot();
