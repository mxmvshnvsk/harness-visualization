// Каталог записанных трейсов в папке traces/. Для списка каждый трейс читается целиком
// (в папке их сотни, мегабайты), поэтому сводка запоминается по размеру и времени изменения
// файла: пока файл тот же, повторно его не читаем.
//
// Имя файла из адреса принимается только как имя в самой папке traces/: без «/», «..»
// и с расширением .jsonl — иначе через адрес можно было бы прочитать любой файл на диске.

import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { HarnessEvent } from '@harness-visualization/harness';
import { readTraceFile, type TraceContents } from './readTraceFile.js';

const TRACE_FILE_NAME = /^[\w.-]+\.jsonl$/u;
// Трейсы, собранные руками для учебных сюжетов (например, ответ с подложенными ошибками).
// Интерфейс обязан показывать их как ненастоящие.
const SYNTHETIC_PREFIX = 'synthetic-';

// session — сессия агента; groundingCheck — проверка опоры ответа судьёй (pnpm check-grounding --judge).
export type TraceKind = 'session' | 'groundingCheck' | 'unknown';

export interface TraceSummary {
  file: string;
  kind: TraceKind;
  synthetic: boolean;
  sessionId: string | null;
  // Вопрос пользователя; у проверки опоры — путь к проверенному трейсу.
  title: string | null;
  model: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  eventCount: number;
  // Есть session_finished: трейс дописан до конца, а не оборван сбоем.
  finished: boolean;
  hasError: boolean;
  skippedLines: number;
  sizeBytes: number;
  // Ветка (этап 9): от какого трейса и с какого шага; null — не ветка.
  branch: TraceBranch | null;
}

export interface TraceBranch {
  // Имя файла исходного трейса в той же папке.
  sourceFile: string;
  step: number;
  change: 'replay' | 'toolResult';
}

interface CachedSummary {
  sizeBytes: number;
  modifiedAtMs: number;
  summary: TraceSummary;
}

export class TraceCatalog {
  private readonly cache = new Map<string, CachedSummary>();

  constructor(private readonly directory: string) {}

  // Новые сверху: имя файла начинается со времени записи.
  async list(): Promise<TraceSummary[]> {
    const names = await this.traceFileNames();
    const summaries = await Promise.all(names.map((name) => this.summarize(name)));
    return summaries.sort((left, right) =>
      (right.startedAt ?? '').localeCompare(left.startedAt ?? ''),
    );
  }

  // null — такого трейса нет или имя недопустимо.
  async read(file: string): Promise<TraceContents | null> {
    const path = this.pathOf(file);
    if (path === null) {
      return null;
    }
    try {
      return await readTraceFile(path);
    } catch {
      return null;
    }
  }

  private pathOf(file: string): string | null {
    return TRACE_FILE_NAME.test(file) ? join(this.directory, file) : null;
  }

  private async traceFileNames(): Promise<string[]> {
    try {
      const entries = await readdir(this.directory, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && TRACE_FILE_NAME.test(entry.name))
        .map((entry) => entry.name);
    } catch {
      // Папки ещё нет: ни одной сессии не было.
      return [];
    }
  }

  private async summarize(file: string): Promise<TraceSummary> {
    const path = join(this.directory, file);
    const info = await stat(path);
    const cached = this.cache.get(file);
    if (cached?.sizeBytes === info.size && cached.modifiedAtMs === info.mtimeMs) {
      return cached.summary;
    }
    const contents = await readTraceFile(path);
    const summary = buildSummary(file, contents, info.size);
    this.cache.set(file, { sizeBytes: info.size, modifiedAtMs: info.mtimeMs, summary });
    return summary;
  }
}

function buildSummary(file: string, contents: TraceContents, sizeBytes: number): TraceSummary {
  const { events, skippedLines } = contents;
  const first = events.at(0);
  return {
    file,
    kind: traceKind(first),
    synthetic: file.startsWith(SYNTHETIC_PREFIX),
    sessionId: first?.sessionId ?? null,
    title: traceTitle(events),
    model: first?.type === 'session_started' ? first.model : null,
    startedAt: first?.timestamp ?? null,
    finishedAt: events.at(-1)?.timestamp ?? null,
    eventCount: events.length,
    finished: events.some((event) => event.type === 'session_finished'),
    hasError: events.some((event) => event.type === 'error'),
    skippedLines,
    sizeBytes,
    branch: branchOf(events),
  };
}

function branchOf(events: HarnessEvent[]): TraceBranch | null {
  const started = events.find((event) => event.type === 'branch_started');
  if (started?.type !== 'branch_started') {
    return null;
  }
  return {
    sourceFile: basename(started.sourceTracePath),
    step: started.step,
    change: started.change.kind,
  };
}

function traceKind(first: HarnessEvent | undefined): TraceKind {
  switch (first?.type) {
    case 'session_started':
      return 'session';
    case 'grounding_check_started':
      return 'groundingCheck';
    default:
      return 'unknown';
  }
}

function traceTitle(events: HarnessEvent[]): string | null {
  for (const event of events) {
    if (event.type === 'user_message') {
      return event.text;
    }
    if (event.type === 'grounding_check_started') {
      return event.sourceTracePath;
    }
  }
  return null;
}
