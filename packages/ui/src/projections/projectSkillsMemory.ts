// Экран «Скиллы и память» (этап 6b): каталог скиллов и кто что загрузил, память на начало
// сессии и её правки, версии плана. Каждое событие — с номером и временем: экран показывает
// только то, до чего дошёл повтор, и перематывает по клику.

import type { HarnessEvent, SkillSummary } from '@harness-visualization/harness';

type EventOfType<Type extends HarnessEvent['type']> = Extract<HarnessEvent, { type: Type }>;

// Где в сессии случилось: «в2 ш1» — вопрос 2, шаг 1; «старт» — до первого вопроса.
export interface Moment {
  index: number;
  at: number;
  place: string;
}

export interface SkillLoad extends Moment {
  name: string;
  trigger: EventOfType<'skill_loaded'>['trigger'];
}

export interface MemoryChange extends Moment {
  command: EventOfType<'memory_updated'>['command'];
  path: string;
  newPath: string | null;
  // Что именно изменено — из аргументов вызова memory: текст, замена, вставка.
  detail: string;
}

export interface PlanVersion extends Moment {
  version: number;
  goal: string;
  steps: EventOfType<'progress_updated'>['steps'];
}

export interface SkillsMemoryView {
  // null — трейс до этапа 6b: каталога нет.
  catalog: {
    directory: string;
    skills: SkillSummary[];
    problems: { folder: string; message: string }[];
  } | null;
  loads: SkillLoad[];
  // memo.md на начало сессии — из system prompt первого запроса; null — пуст или трейс до 6b.
  memoAtStart: string | null;
  memoPath: string | null;
  memoryFiles: string[];
  changes: MemoryChange[];
  plans: PlanVersion[];
}

interface Cursor {
  startedAt: number;
  turn: number;
  step: number | null;
  // Аргументы последнего вызова memory — memory_updated приходит во время его выполнения.
  memoryArguments: Record<string, unknown> | null;
}

export function projectSkillsMemory(events: readonly HarnessEvent[]): SkillsMemoryView {
  const view: SkillsMemoryView = {
    catalog: null,
    loads: [],
    memoAtStart: null,
    memoPath: null,
    memoryFiles: [],
    changes: [],
    plans: [],
  };
  const first = events[0];
  const cursor: Cursor = {
    startedAt: first === undefined ? 0 : Date.parse(first.timestamp),
    turn: 0,
    step: null,
    memoryArguments: null,
  };
  events.forEach((event, index) => {
    advance(cursor, event);
    collect(view, event, momentOf(cursor, event, index), cursor);
  });
  return view;
}

function advance(cursor: Cursor, event: HarnessEvent): void {
  if (event.type === 'user_message') {
    cursor.turn += 1;
    cursor.step = null;
  }
  if (event.type === 'model_request' && event.purpose === 'agentStep') {
    cursor.step = event.iteration;
  }
  if (event.type === 'tool_call' && event.toolName === 'memory') {
    cursor.memoryArguments = asRecord(event.arguments);
  }
}

function momentOf(cursor: Cursor, event: HarnessEvent, index: number): Moment {
  const place =
    cursor.turn === 0
      ? 'старт'
      : `в${String(cursor.turn)}${cursor.step === null ? '' : ` ш${String(cursor.step)}`}`;
  return { index, at: Date.parse(event.timestamp) - cursor.startedAt, place };
}

function collect(
  view: SkillsMemoryView,
  event: HarnessEvent,
  moment: Moment,
  cursor: Cursor,
): void {
  switch (event.type) {
    case 'skill_catalog':
      view.catalog = { directory: event.directory, skills: event.skills, problems: event.problems };
      break;
    case 'skill_loaded':
      view.loads.push({ ...moment, name: event.name, trigger: event.trigger });
      break;
    case 'memory_loaded':
      view.memoPath = event.memoPath;
      view.memoryFiles = event.files;
      break;
    case 'model_request':
      view.memoAtStart ??= memoFromRequest(event.body);
      break;
    case 'memory_updated':
      view.changes.push({
        ...moment,
        command: event.command,
        path: event.path,
        newPath: event.newPath,
        detail: describeChange(event.command, cursor.memoryArguments),
      });
      break;
    case 'progress_updated':
      view.plans.push({ ...moment, version: event.version, goal: event.goal, steps: event.steps });
      break;
    default:
      break;
  }
}

// memo.md харнесс кладёт в system prompt между пометками (packages/harness/src/memory/memoryPrompt.ts).
function memoFromRequest(body: Record<string, unknown>): string | null {
  const messages = Array.isArray(body.messages) ? (body.messages as unknown[]) : [];
  const content = asRecord(messages[0]).content;
  if (typeof content !== 'string') {
    return null;
  }
  const match =
    /\/memories\/memo\.md на начало сессии:\n([\s\S]*?)\n\[Конец \/memories\/memo\.md\]/.exec(
      content,
    );
  return match?.[1] ?? null;
}

function describeChange(command: string, args: Record<string, unknown> | null): string {
  const text = (key: string): string => (typeof args?.[key] === 'string' ? args[key] : '');
  switch (command) {
    case 'create':
      return text('file_text');
    case 'str_replace':
      return `«${text('old_str')}» → «${text('new_str')}»`;
    case 'insert':
      return `после строки ${lineOf(args)}: ${text('insert_text')}`;
    default:
      return '';
  }
}

function lineOf(args: Record<string, unknown> | null): string {
  return typeof args?.insert_line === 'number' ? String(args.insert_line) : '?';
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

// Состояние скилла к моменту повтора: загружен (кем и где) или только в каталоге.
export function skillLoadAt(view: SkillsMemoryView, name: string, shown: number): SkillLoad | null {
  return view.loads.find((load) => load.name === name && load.index < shown) ?? null;
}
