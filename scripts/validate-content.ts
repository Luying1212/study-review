import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  CARD_ID_RE,
  CARD_LEVELS,
  CARD_ORIGINS,
  CARD_STATUSES,
  CARD_TIERS,
  CARD_TYPES,
  CONTENT_DIR,
  PROGRESS_DIR,
  ROOT,
  type ValidationError,
  formatErrors,
  isValidDate,
  listDayFiles,
  readJson,
} from './lib/content-utils';

interface Subject {
  id: string;
  name: string;
  color: string;
}

interface Card {
  id: string;
  type: string;
  level: string;
  tier: string;
  status: string;
  origin: string;
  retired?: boolean;
  question: string;
  answer: string;
  rubric?: string[];
  estSeconds?: number;
  hint?: string;
  tags?: string[];
}

interface Topic {
  id: string;
  subject: string;
  title: string;
  selfAssessment: string;
  sources: Array<{ label: string; locator?: string }>;
  freeRecallPrompt: string;
  freeRecallEstSeconds?: number;
  notesEstSeconds?: number;
  notes: string;
  cards?: Card[];
  cardRefs?: string[];
}

interface DayFile {
  date: string;
  summary: string;
  topics: Topic[];
  tempNotes?: string[];
}

const errors: ValidationError[] = [];
const warnings: string[] = [];

function err(file: string, p: string, message: string): void {
  errors.push({ file, path: p, message });
}

function parseArgs(argv: string[]): { base?: string; firstInit: boolean } {
  let base: string | undefined;
  let firstInit = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base' && argv[i + 1]) {
      base = argv[++i];
    } else if (argv[i] === '--first-init') {
      firstInit = true;
    }
  }
  if (!base && process.env.VALIDATE_BASE && process.env.VALIDATE_BASE !== '0000000000000000000000000000000000000000') {
    base = process.env.VALIDATE_BASE;
  }
  return { base, firstInit };
}

function loadSubjects(): Map<string, Subject> {
  const file = path.join(CONTENT_DIR, 'subjects.json');
  if (!fs.existsSync(file)) {
    err('subjects.json', '/', '缺少 subjects.json');
    return new Map();
  }
  const data = readJson<Subject[]>(file);
  if (!Array.isArray(data)) {
    err('subjects.json', '/', '必须是数组');
    return new Map();
  }
  const map = new Map<string, Subject>();
  data.forEach((s, i) => {
    if (!s?.id || !s?.name || !s?.color) {
      err('subjects.json', `[${i}]`, '需要 id/name/color');
      return;
    }
    if (map.has(s.id)) err('subjects.json', `[${i}].id`, `重复科目 id: ${s.id}`);
    map.set(s.id, s);
  });
  return map;
}

function validateCard(
  card: Card,
  file: string,
  basePath: string,
  definedIds: Map<string, string>,
): void {
  if (!card.id || !CARD_ID_RE.test(card.id)) {
    err(file, `${basePath}.id`, `卡片 id 非法（需匹配 ^[a-z0-9-]+$）: ${String(card.id)}`);
  } else if (definedIds.has(card.id)) {
    err(file, `${basePath}.id`, `卡片 id 重复: ${card.id}（先前定义于 ${definedIds.get(card.id)}）`);
  } else {
    definedIds.set(card.id, `${file}:${basePath}`);
  }

  if (!CARD_TYPES.has(card.type)) err(file, `${basePath}.type`, `非法 type: ${card.type}`);
  if (!CARD_LEVELS.has(card.level)) err(file, `${basePath}.level`, `非法 level: ${card.level}`);
  if (!CARD_TIERS.has(card.tier)) err(file, `${basePath}.tier`, `非法 tier: ${card.tier}`);
  if (!CARD_STATUSES.has(card.status)) err(file, `${basePath}.status`, `非法 status: ${card.status}`);
  if (!CARD_ORIGINS.has(card.origin)) err(file, `${basePath}.origin`, `非法 origin: ${card.origin}`);
  if (typeof card.question !== 'string' || !card.question.trim()) {
    err(file, `${basePath}.question`, 'question 必填');
  }
  if (typeof card.answer !== 'string') err(file, `${basePath}.answer`, 'answer 必填');
  if (card.retired != null && typeof card.retired !== 'boolean') {
    err(file, `${basePath}.retired`, 'retired 必须是布尔值');
  }
  const est = card.estSeconds ?? 60;
  if (!Number.isInteger(est) || est <= 0) {
    err(file, `${basePath}.estSeconds`, 'estSeconds 须为正整数');
  }
  if ((card.type === 'explain' || card.type === 'code') && (!card.rubric || card.rubric.length === 0)) {
    err(file, `${basePath}.rubric`, `${card.type} 题必须提供 rubric`);
  }
}

function collectBaselineCardIds(baseRef: string): Set<string> | null {
  try {
    const out = execSync(`git show ${baseRef}:content/days`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // git show on directory may fail; list via ls-tree
    void out;
  } catch {
    // fall through to ls-tree
  }
  try {
    const listed = execSync(`git ls-tree -r --name-only ${baseRef} -- content/days`, {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
    const ids = new Set<string>();
    for (const rel of listed) {
      if (!rel.endsWith('.json')) continue;
      const raw = execSync(`git show ${baseRef}:${rel}`, { cwd: ROOT, encoding: 'utf8' });
      const day = JSON.parse(raw) as DayFile;
      for (const topic of day.topics ?? []) {
        for (const card of topic.cards ?? []) {
          if (card.id) ids.add(card.id);
        }
      }
    }
    return ids;
  } catch (e) {
    return null;
  }
}

function main(): void {
  const { base, firstInit } = parseArgs(process.argv.slice(2));
  const subjects = loadSubjects();
  const definedIds = new Map<string, string>();
  const allCardIds = new Set<string>();

  for (const file of listDayFiles()) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const basename = path.basename(file, '.json');
    let day: DayFile;
    try {
      day = readJson<DayFile>(file);
    } catch {
      err(rel, '/', 'JSON 无法解析');
      continue;
    }
    if (day.date !== basename) {
      err(rel, 'date', `文件名日期 ${basename} 与 date 字段 ${day.date} 不一致`);
    }
    if (!isValidDate(day.date)) err(rel, 'date', `非法日期: ${day.date}`);
    if (typeof day.summary !== 'string') err(rel, 'summary', 'summary 必填');
    if (!Array.isArray(day.topics)) {
      err(rel, 'topics', 'topics 必须是数组');
      continue;
    }

    const topicIds = new Set<string>();
    day.topics.forEach((topic, ti) => {
      const tp = `topics[${ti}]`;
      if (!topic.id) err(rel, `${tp}.id`, 'topic.id 必填');
      if (topicIds.has(topic.id)) err(rel, `${tp}.id`, `同日 topic 重复: ${topic.id}`);
      topicIds.add(topic.id);
      if (!subjects.has(topic.subject)) {
        err(rel, `${tp}.subject`, `科目不存在: ${topic.subject}`);
      }
      if (!topic.title) err(rel, `${tp}.title`, 'title 必填');
      if (!topic.freeRecallPrompt) err(rel, `${tp}.freeRecallPrompt`, 'freeRecallPrompt 必填');
      if (typeof topic.notes !== 'string') err(rel, `${tp}.notes`, 'notes 必填');
      if (!Array.isArray(topic.sources) || topic.sources.length === 0) {
        err(rel, `${tp}.sources`, 'sources 至少一项');
      }
      const fr = topic.freeRecallEstSeconds ?? 90;
      const ne = topic.notesEstSeconds ?? 60;
      if (!Number.isInteger(fr) || fr <= 0) err(rel, `${tp}.freeRecallEstSeconds`, '须为正整数');
      if (!Number.isInteger(ne) || ne <= 0) err(rel, `${tp}.notesEstSeconds`, '须为正整数');

      if (topic.cards) {
        topic.cards.forEach((card, ci) => {
          validateCard(card, rel, `${tp}.cards[${ci}]`, definedIds);
          allCardIds.add(card.id);
        });
      }
      if (topic.cardRefs) {
        for (const ref of topic.cardRefs) {
          if (!CARD_ID_RE.test(ref)) {
            err(rel, `${tp}.cardRefs`, `非法 cardRef: ${ref}`);
          }
        }
      }
    });
  }

  // 第二遍：检查 cardRefs 指向已定义卡
  for (const file of listDayFiles()) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const day = readJson<DayFile>(file);
    day.topics.forEach((topic, ti) => {
      for (const ref of topic.cardRefs ?? []) {
        if (!definedIds.has(ref)) {
          err(rel, `topics[${ti}].cardRefs`, `cardRef 指向不存在的卡片: ${ref}`);
        }
      }
    });
  }

  // 基线：已有 card.id 不得删除
  let baselineIds: Set<string> | null = null;
  if (base) {
    baselineIds = collectBaselineCardIds(base);
    if (baselineIds === null) {
      if (firstInit) {
        warnings.push(`基线 ${base} 无 content/days，按首次初始化跳过删除检查。`);
      } else {
        // 尝试 HEAD
        const headIds = collectBaselineCardIds('HEAD');
        if (headIds && !base) {
          baselineIds = headIds;
        } else if (!firstInit && fs.existsSync(path.join(ROOT, '.git'))) {
          // 若指定基线失败且非首次，报错
          const hasDays = listDayFiles().length > 0;
          if (hasDays && baselineIds === null) {
            // 本地默认对比 HEAD
            baselineIds = collectBaselineCardIds('HEAD');
            if (baselineIds === null) {
              err('git', 'base', `无法读取校验基线 ${base}，且非首次初始化，不能静默跳过。`);
            }
          }
        }
      }
    }
  } else if (fs.existsSync(path.join(ROOT, '.git'))) {
    baselineIds = collectBaselineCardIds('HEAD');
    if (baselineIds === null && !firstInit) {
      warnings.push('无可用 git 基线（可能是首次提交），跳过卡片删除检查。使用 --first-init 明确标记。');
    }
  }

  if (baselineIds) {
    for (const id of baselineIds) {
      if (!definedIds.has(id)) {
        err('content/days', id, `已存在的 card.id 被删除或改名: ${id}（应设 retired=true 保留定义）`);
      }
    }
  }

  // 进度归档浅校验（可为空）
  const latestPath = path.join(PROGRESS_DIR, 'latest.json');
  const receiptsPath = path.join(PROGRESS_DIR, 'receipts.json');
  if (fs.existsSync(latestPath)) {
    try {
      const latest = readJson<Record<string, unknown>>(latestPath);
      if (latest.appId && latest.appId !== 'study-review-workbench') {
        err('content/progress/latest.json', 'appId', 'appId 不匹配');
      }
      // 公开字段不得含 typedAnswer
      const text = fs.readFileSync(latestPath, 'utf8');
      if (text.includes('"typedAnswer"')) {
        err('content/progress/latest.json', '/', '公开归档不得包含 typedAnswer');
      }
      if (latest.dayFeedback && typeof latest.dayFeedback === 'object') {
        if (Object.keys(latest.dayFeedback as object).length > 0) {
          err('content/progress/latest.json', 'dayFeedback', '公开归档 dayFeedback 应为空对象');
        }
      }
    } catch {
      err('content/progress/latest.json', '/', 'JSON 无法解析');
    }
  }
  if (fs.existsSync(receiptsPath)) {
    try {
      const receipts = readJson<unknown>(receiptsPath);
      if (!Array.isArray(receipts)) err('content/progress/receipts.json', '/', '必须是数组');
    } catch {
      err('content/progress/receipts.json', '/', 'JSON 无法解析');
    }
  }

  if (warnings.length) {
    console.warn(warnings.join('\n'));
  }
  if (errors.length) {
    console.error(formatErrors(errors));
    process.exit(1);
  }
  console.log(`校验通过：${definedIds.size} 张卡片定义，${listDayFiles().length} 个学习日。`);
}

main();
