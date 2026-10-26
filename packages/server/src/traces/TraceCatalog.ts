// Каталог записанных трейсов: папка traces/ и примеры из репозитория (examples/traces, этап 9.3) —
// эталонные трейсы по урокам, чтобы у склонировавшего проект было что смотреть и от чего
// ветвиться. Одноимённый трейс из traces/ главнее примера. Для списка каждый трейс читается целиком
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
  // Пример из репозитория (examples/traces), а не своя сессия из traces/.
  example: boolean;
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
  // Запись чужого харнесса, переведённая адаптером (этап 9.4): его название; null — наша.
  importedFrom: string | null;
  // Прогон лаборатории «Выбор токена» (этап 11).
  tokenLab: boolean;
  // …и это развилка от другого прогона (этап 11.3).
  tokenLabFork?: boolean;
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

// Папка трейсов; example — примеры из репозитория.
export interface TraceSource {
  directory: string;
  example: boolean;
}

export class TraceCatalog {
  private readonly cache = new Map<string, CachedSummary>();

  private readonly sources: TraceSource[];

  constructor(sources: string | TraceSource[]) {
    this.sources = typeof sources === 'string' ? [{ directory: sources, example: false }] : sources;
  }

  // Новые сверху: имя файла начинается со времени записи.
  async list(): Promise<TraceSummary[]> {
    const located = await this.locateAll();
    const summaries = await Promise.all(
      [...located.entries()].map(([file, source]) => this.summarize(file, source)),
    );
    return summaries.sort((left, right) =>
      (right.startedAt ?? '').localeCompare(left.startedAt ?? ''),
    );
  }

  // null — такого трейса нет или имя недопустимо.
  async read(file: string): Promise<TraceContents | null> {
    if (!TRACE_FILE_NAME.test(file)) {
      return null;
    }
    for (const source of this.sources) {
      try {
        return await readTraceFile(join(source.directory, file));
      } catch {
        // В этой папке нет — ищем в следующей.
      }
    }
    return null;
  }

  // Файл → папка, где он лежит; одноимённый в первой папке главнее.
  private async locateAll(): Promise<Map<string, TraceSource>> {
    const located = new Map<string, TraceSource>();
    for (const source of this.sources) {
      for (const name of await traceFileNames(source.directory)) {
        if (!located.has(name)) {
          located.set(name, source);
        }
      }
    }
    return located;
  }

  private async summarize(file: string, source: TraceSource): Promise<TraceSummary> {
    const path = join(source.directory, file);
    const info = await stat(path);
    const key = `${source.directory}/${file}`;
    const cached = this.cache.get(key);
    if (cached?.sizeBytes === info.size && cached.modifiedAtMs === info.mtimeMs) {
      return cached.summary;
    }
    const contents = await readTraceFile(path);
    const summary = { ...buildSummary(file, contents, info.size), example: source.example };
    this.cache.set(key, { sizeBytes: info.size, modifiedAtMs: info.mtimeMs, summary });
    return summary;
  }
}

async function traceFileNames(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && TRACE_FILE_NAME.test(entry.name))
      .map((entry) => entry.name);
  } catch {
    // Папки ещё нет: ни одной сессии не было.
    return [];
  }
}

function buildSummary(
  file: string,
  contents: TraceContents,
  sizeBytes: number,
): Omit<TraceSummary, 'example'> {
  const { events, skippedLines } = contents;
  return {
    file,
    kind: traceKind(events.at(0)),
    synthetic: file.startsWith(SYNTHETIC_PREFIX),
    ...sessionFacts(events),
    title: traceTitle(events),
    eventCount: events.length,
    finished: events.some((event) => event.type === 'session_finished'),
    hasError: events.some((event) => event.type === 'error'),
    skippedLines,
    sizeBytes,
    branch: branchOf(events),
  };
}

type SessionFacts = Pick<
  TraceSummary,
  'sessionId' | 'model' | 'startedAt' | 'finishedAt' | 'importedFrom' | 'tokenLab' | 'tokenLabFork'
>;

function sessionFacts(events: HarnessEvent[]): SessionFacts {
  const first = events.at(0);
  return {
    sessionId: first?.sessionId ?? null,
    startedAt: first?.timestamp ?? null,
    finishedAt: events.at(-1)?.timestamp ?? null,
    ...startedFacts(first),
  };
}

function startedFacts(
  first: HarnessEvent | undefined,
): Pick<TraceSummary, 'model' | 'importedFrom' | 'tokenLab' | 'tokenLabFork'> {
  if (first?.type !== 'session_started') {
    return { model: null, importedFrom: null, tokenLab: false };
  }
  return {
    model: first.model,
    importedFrom: first.importedFrom?.harness ?? null,
    tokenLab: (first.tokenLab ?? null) !== null,
    tokenLabFork: first.tokenLab?.fork !== undefined,
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

// Вопрос-документ (задача арены — TASK.md с заголовком «# …») — заголовком, а не целиком.
// То же правило у интерфейса в шапке сессии (App.tsx).
function questionTitle(text: string): string {
  const firstLine = text.trimStart().split('\n', 1)[0] ?? '';
  return firstLine.startsWith('# ') && text.includes('\n') ? firstLine.slice(2).trim() : text;
}

function traceTitle(events: HarnessEvent[]): string | null {
  for (const event of events) {
    if (event.type === 'user_message') {
      return questionTitle(event.text);
    }
    if (event.type === 'grounding_check_started') {
      return event.sourceTracePath;
    }
  }
  // Запись Claude Code после компакции начинается со сводки, а не с вопроса.
  const compacted = events.find((event) => event.type === 'history_compacted');
  return compacted?.type === 'history_compacted' ? 'Продолжение после компакции' : null;
}
