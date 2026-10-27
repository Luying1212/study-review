import fs from 'node:fs';
import path from 'node:path';
import {
  CONTENT_DIR,
  PROGRESS_DIR,
  PUBLIC_DATA,
  listDayFiles,
  readJson,
  writeJson,
} from './lib/content-utils';

interface Subject {
  id: string;
  name: string;
  color: string;
}

interface Card {
  id: string;
  [key: string]: unknown;
}

interface Topic {
  id: string;
  subject: string;
  title: string;
  cards?: Card[];
  cardRefs?: string[];
  [key: string]: unknown;
}

interface DayFile {
  date: string;
  summary: string;
  topics: Topic[];
  tempNotes?: string[];
}

function main(): void {
  const subjectsPath = path.join(CONTENT_DIR, 'subjects.json');
  const subjects = fs.existsSync(subjectsPath) ? readJson<Subject[]>(subjectsPath) : [];

  const days: DayFile[] = [];
  const cardsById: Record<string, Card> = {};
  const topicByCardId: Record<
    string,
    { topicId: string; topicTitle: string; date: string; subject: string }
  > = {};

  for (const file of listDayFiles()) {
    const day = readJson<DayFile>(file);
    days.push(day);
    for (const topic of day.topics) {
      for (const card of topic.cards ?? []) {
        cardsById[card.id] = card;
        topicByCardId[card.id] = {
          topicId: topic.id,
          topicTitle: topic.title,
          date: day.date,
          subject: topic.subject,
        };
      }
      for (const ref of topic.cardRefs ?? []) {
        if (cardsById[ref] && !topicByCardId[ref]) {
          topicByCardId[ref] = {
            topicId: topic.id,
            topicTitle: topic.title,
            date: day.date,
            subject: topic.subject,
          };
        }
      }
    }
  }

  // cardRefs 补充映射（定义日优先已写入；引用日也要可解析 topic）
  for (const day of days) {
    for (const topic of day.topics) {
      for (const ref of topic.cardRefs ?? []) {
        if (!topicByCardId[ref] && cardsById[ref]) {
          topicByCardId[ref] = {
            topicId: topic.id,
            topicTitle: topic.title,
            date: day.date,
            subject: topic.subject,
          };
        }
      }
    }
  }

  const latestPath = path.join(PROGRESS_DIR, 'latest.json');
  const receiptsPath = path.join(PROGRESS_DIR, 'receipts.json');
  const archive = fs.existsSync(latestPath) ? readJson<unknown>(latestPath) : null;
  const receipts = fs.existsSync(receiptsPath) ? readJson<unknown>(receiptsPath) : [];

  fs.mkdirSync(PUBLIC_DATA, { recursive: true });
  writeJson(path.join(PUBLIC_DATA, 'content.json'), {
    subjects,
    days,
    cardsById,
    topicByCardId,
  });
  writeJson(path.join(PUBLIC_DATA, 'progress.json'), {
    archive,
    receipts,
  });

  console.log(
    `已生成 public/data/content.json（${days.length} 日，${Object.keys(cardsById).length} 卡）与 progress.json`,
  );
}

main();
