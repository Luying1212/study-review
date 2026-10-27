import type { BuiltContent, ProgressBundle } from '../types';

function dataUrl(name: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return `${normalized}data/${name}`;
}

export async function loadContent(): Promise<BuiltContent> {
  const res = await fetch(dataUrl('content.json'), { cache: 'no-store' });
  if (!res.ok) throw new Error(`无法加载 content.json（${res.status}）`);
  return (await res.json()) as BuiltContent;
}

export async function loadProgressBundle(): Promise<ProgressBundle> {
  const res = await fetch(dataUrl('progress.json'), { cache: 'no-store' });
  if (!res.ok) throw new Error(`无法加载 progress.json（${res.status}）`);
  return (await res.json()) as ProgressBundle;
}

export function subjectName(content: BuiltContent, id: string): string {
  return content.subjects.find((s) => s.id === id)?.name ?? id;
}

export function subjectColor(content: BuiltContent, id: string): string {
  return content.subjects.find((s) => s.id === id)?.color ?? '#888';
}
