import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PROGRESS_DIR, readJson, writeJson } from './lib/content-utils';
import { APP_ID, PACKAGE_SCHEMA_VERSION, type AppState, type ReviewPackage } from '../src/types';
import { sanitizePublicState, validateReviewPackage } from '../src/storage/backup';

interface Receipt {
  packageId: string;
  sha256: string;
  previousArchiveId: string | null;
  archivedAt: string;
  studyDate: string;
}

interface LatestArchive {
  schemaVersion: number;
  appId: string;
  archiveId: string;
  previousArchiveId: string | null;
  exportedAt: string;
  archivedAt: string;
  source: { deviceId: string; revision: number };
  state: AppState;
  reportSummary: ReviewPackage['report'];
}

function parseArgs(argv: string[]): { input?: string } {
  let input: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && argv[i + 1]) input = argv[++i];
  }
  return { input };
}

function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

function loadReceipts(): Receipt[] {
  const p = path.join(PROGRESS_DIR, 'receipts.json');
  if (!fs.existsSync(p)) return [];
  return readJson<Receipt[]>(p);
}

function loadLatest(): LatestArchive | null {
  const p = path.join(PROGRESS_DIR, 'latest.json');
  if (!fs.existsSync(p)) return null;
  return readJson<LatestArchive>(p);
}

function main(): void {
  const { input } = parseArgs(process.argv.slice(2));
  if (!input) {
    console.error('用法: npm run archive:progress -- --input <复习包路径>');
    process.exit(1);
  }
  const abs = path.resolve(input);
  if (!fs.existsSync(abs)) {
    console.error(`找不到文件: ${abs}`);
    process.exit(1);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    console.error('复习包 JSON 无法解析');
    process.exit(1);
  }

  const checked = validateReviewPackage(raw);
  if (!checked.ok) {
    console.error(`复习包校验失败: ${checked.message}`);
    process.exit(1);
  }
  const pkg = checked.pkg;
  if (pkg.schemaVersion !== PACKAGE_SCHEMA_VERSION || pkg.appId !== APP_ID) {
    console.error('schemaVersion 或 appId 不匹配');
    process.exit(1);
  }

  const digest = sha256File(abs);
  const receipts = loadReceipts();
  const existing = receipts.find((r) => r.packageId === pkg.packageId);
  if (existing) {
    if (existing.sha256 === digest) {
      console.log(`同包同摘要已归档（packageId=${pkg.packageId}），无副作用。`);
      process.exit(0);
    }
    console.error(`同 packageId 但内容摘要不同，拒绝归档: ${pkg.packageId}`);
    // 保留上传文件供人工处理；不改仓库
    process.exit(1);
  }

  const latest = loadLatest();
  const currentArchiveId = latest?.archiveId ?? null;
  if (pkg.baseArchiveId !== currentArchiveId) {
    console.error(
      `基线不匹配：包 baseArchiveId=${String(pkg.baseArchiveId)}，当前 archiveId=${String(currentArchiveId)}。请先在网站处理冲突并重新导出。`,
    );
    process.exit(1);
  }

  const archivedAt = new Date().toISOString();
  const publicState = sanitizePublicState(pkg.state);
  const next: LatestArchive = {
    schemaVersion: 1,
    appId: APP_ID,
    archiveId: pkg.packageId,
    previousArchiveId: currentArchiveId,
    exportedAt: pkg.exportedAt,
    archivedAt,
    source: { ...pkg.source },
    state: publicState,
    reportSummary: pkg.report,
  };

  const nextReceipts: Receipt[] = [
    ...receipts,
    {
      packageId: pkg.packageId,
      sha256: digest,
      previousArchiveId: currentArchiveId,
      archivedAt,
      studyDate: pkg.studyDate,
    },
  ];

  // 校验通过后才一起替换
  const latestPath = path.join(PROGRESS_DIR, 'latest.json');
  const receiptsPath = path.join(PROGRESS_DIR, 'receipts.json');
  fs.mkdirSync(PROGRESS_DIR, { recursive: true });
  const tmpLatest = `${latestPath}.tmp`;
  const tmpReceipts = `${receiptsPath}.tmp`;
  writeJson(tmpLatest, next);
  writeJson(tmpReceipts, nextReceipts);
  fs.renameSync(tmpLatest, latestPath);
  fs.renameSync(tmpReceipts, receiptsPath);

  console.log(`已归档 packageId=${pkg.packageId} → content/progress/latest.json`);
}

main();
