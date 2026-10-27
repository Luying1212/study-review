export type Route =
  | { name: 'tonight' }
  | { name: 'review' }
  | { name: 'report'; studyDate?: string }
  | { name: 'archive' }
  | { name: 'weak' }
  | { name: 'settings' }
  | { name: 'conflict' };

export function parseHash(hash = location.hash): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const path = raw.split('?')[0];
  const qs = new URLSearchParams(raw.includes('?') ? raw.split('?')[1] : '');
  if (path === '/' || path === '') return { name: 'tonight' };
  if (path === '/review') return { name: 'review' };
  if (path === '/report') return { name: 'report', studyDate: qs.get('date') ?? undefined };
  if (path === '/archive') return { name: 'archive' };
  if (path === '/weak') return { name: 'weak' };
  if (path === '/settings') return { name: 'settings' };
  if (path === '/conflict') return { name: 'conflict' };
  return { name: 'tonight' };
}

export function navigate(to: string): void {
  location.hash = to;
}

export function onRoute(handler: (route: Route) => void): () => void {
  const run = () => handler(parseHash());
  window.addEventListener('hashchange', run);
  run();
  return () => window.removeEventListener('hashchange', run);
}
