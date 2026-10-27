import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CONTENT_DIR = path.join(ROOT, 'content');
export const DAYS_DIR = path.join(CONTENT_DIR, 'days');
export const PROGRESS_DIR = path.join(CONTENT_DIR, 'progress');
export const PUBLIC_DATA = path.join(ROOT, 'public', 'data');

export const CARD_ID_RE = /^[a-z0-9-]+$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const CARD_TYPES = new Set(['qa', 'code', 'cloze', 'explain']);
export const CARD_LEVELS = new Set(['recall', 'explain', 'apply']);
export const CARD_TIERS = new Set(['core', 'general']);
export const CARD_STATUSES = new Set(['draft', 'needs-review', 'ready']);
export const CARD_ORIGINS = new Set(['user-studied', 'ai-supplement']);

export interface ValidationError {
  file: string;
  path: string;
  message: string;
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function isValidDate(ymd: string): boolean {
  if (!DATE_RE.test(ymd)) return false;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function listDayFiles(): string[] {
  if (!fs.existsSync(DAYS_DIR)) return [];
  return fs
    .readdirSync(DAYS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(DAYS_DIR, f))
    .sort();
}

export function formatErrors(errors: ValidationError[]): string {
  return errors.map((e) => `[${e.file}] ${e.path}: ${e.message}`).join('\n');
}
