// Вкладка «Код» (этап 10): что агент сделал с файлами — по самому трейсу, без папки копии.
// Исходный текст файла — из результата read_file, новый — из аргументов write_file, удаление —
// из delete_file. Поэтому вид работает и в повторе (diff на шаге, где стоит бегунок),
// и на примерах из репозитория. Файл, который агент записал, не прочитав, — для нас новый:
// исходного текста в трейсе нет.
// Импорт чужого харнесса (9.4): тулы там свои, и адаптер кладёт в details.fileEffect, что тул
// сделал с файлом, — чтение, запись или правку фрагментом. Здесь их понимаем одинаково.

import type {
  AcceptanceCheckedPayload,
  ArenaRun,
  FileEffect,
  HarnessEvent,
} from '@harness-visualization/harness';

export interface CodeFile {
  path: string;
  // Текст до первой записи агентом; null — не знаем (не читал) или файла не было.
  original: string | null;
  // Текст сейчас; null — файл удалён.
  current: string | null;
  status: 'read' | 'created' | 'modified' | 'deleted';
  writes: number;
  // Шаг агента, на котором файл менялся последний раз; у прочитанного — когда прочитан.
  step: number;
  // original — только прочитанный кусок файла (чтение с offset или обрезанное).
  partial: boolean;
  // Правки фрагментом, когда текста файла в трейсе нет: показываем их сами по себе.
  fragments: { oldText: string; newText: string }[];
}

export interface TestRun {
  step: number;
  passed: number;
  failed: number;
  failedTests: { name: string; file: string | null; error: string | null }[];
  timedOut: boolean;
  network: string | null;
}

// Запуск программы агентом — run_node (этап 10.4).
export interface ProgramRun {
  step: number;
  command: string;
  exitCode: number | null;
  timedOut: boolean;
  // Начало вывода; null — запуск не состоялся (пользователь не разрешил или ошибка тула).
  output: string | null;
  status: string;
}

export interface CodeView {
  arena: ArenaRun | null;
  files: CodeFile[];
  testRuns: TestRun[];
  programRuns: ProgramRun[];
  acceptance: (AcceptanceCheckedPayload & { sequence: number }) | null;
}

interface Builder {
  step: number;
  calls: Map<string, Call>;
  files: Map<string, CodeFile>;
  testRuns: TestRun[];
  programRuns: ProgramRun[];
}

export function projectCode(events: readonly HarnessEvent[], shown: number): CodeView {
  const builder: Builder = {
    step: 0,
    calls: new Map(),
    files: new Map(),
    testRuns: [],
    programRuns: [],
  };
  let arena: ArenaRun | null = null;
  let acceptance: CodeView['acceptance'] = null;
  for (const event of events.slice(0, shown)) {
    if (event.agentId !== undefined) {
      continue;
    }
    if (event.type === 'session_started') {
      arena = event.arena ?? null;
    } else if (event.type === 'acceptance_checked') {
      acceptance = event;
    } else {
      apply(builder, event);
    }
  }
  return {
    arena,
    files: sortFiles([...builder.files.values()]),
    testRuns: builder.testRuns,
    programRuns: builder.programRuns,
    acceptance,
  };
}

function apply(builder: Builder, event: HarnessEvent): void {
  if (event.type === 'model_request' && event.purpose === 'agentStep') {
    builder.step += 1;
  } else if (event.type === 'tool_call') {
    builder.calls.set(event.toolCallId, {
      name: event.toolName,
      path: stringField(event.arguments, 'path'),
      content: stringField(event.arguments, 'content'),
      arguments: event.arguments,
    });
  } else if (event.type === 'tool_result' && event.toolName === 'run_node') {
    builder.programRuns.push(
      programRunOf(builder.step, builder.calls.get(event.toolCallId), event),
    );
  } else if (event.type === 'tool_result' && event.status === 'success') {
    const effect = fileEffectOf(event.details);
    if (effect !== null) {
      applyEffect(builder, effect);
      return;
    }
    const call = builder.calls.get(event.toolCallId);
    if (call !== undefined) {
      applyResult(builder, call, event);
    }
  }
}

type Call = { name: string; path: string | null; content: string | null; arguments: unknown };
type ToolResult = Extract<HarnessEvent, { type: 'tool_result' }>;

// Что делает с видом успешный результат каждого тула; остальные тулы вид не меняют.
const RESULT_HANDLERS: Record<string, (builder: Builder, call: Call, result: ToolResult) => void> =
  {
    run_tests: (builder, _call, result) => {
      builder.testRuns.push(testRunOf(builder.step, result));
    },
    read_file: (builder, call, result) => {
      const path = normalizePath(call.path ?? '');
      if (!builder.files.has(path)) {
        builder.files.set(path, {
          ...newFile(path, builder.step),
          original: result.content,
          current: result.content,
        });
      }
    },
    write_file: (builder, call) => {
      if (call.content !== null) {
        write(builder, normalizePath(call.path ?? ''), call.content);
      }
    },
    delete_file: (builder, call) => {
      const path = normalizePath(call.path ?? '');
      const file = builder.files.get(path) ?? newFile(path, builder.step);
      builder.files.set(path, { ...file, current: null, status: 'deleted', step: builder.step });
    },
  };

function applyResult(builder: Builder, call: Call, result: ToolResult): void {
  if (call.name !== 'run_tests' && call.path === null) {
    return;
  }
  RESULT_HANDLERS[call.name]?.(builder, call, result);
}

function write(builder: Builder, path: string, content: string): void {
  const file = builder.files.get(path) ?? { ...newFile(path, builder.step), status: 'created' };
  const status = file.status === 'read' || file.status === 'modified' ? 'modified' : 'created';
  builder.files.set(path, {
    ...file,
    current: content,
    status: content === file.original ? 'read' : status,
    writes: file.writes + 1,
    step: builder.step,
  });
}

function newFile(path: string, step: number): CodeFile {
  return {
    path,
    original: null,
    current: null,
    status: 'read',
    writes: 0,
    step,
    partial: false,
    fragments: [],
  };
}

function fileEffectOf(details: Record<string, unknown> | null): FileEffect | null {
  const effect = details?.fileEffect;
  return typeof effect === 'object' && effect !== null ? (effect as FileEffect) : null;
}

const EFFECT_HANDLERS: {
  [Kind in FileEffect['kind']]: (
    builder: Builder,
    effect: Extract<FileEffect, { kind: Kind }>,
  ) => void;
} = {
  read: (builder, effect) => {
    const file = builder.files.get(effect.path);
    // Целиком прочитанный файл заменяет кусок, прочитанный раньше, пока агент его не менял.
    if (file === undefined || (file.partial && !effect.partial && file.writes === 0)) {
      builder.files.set(effect.path, {
        ...newFile(effect.path, builder.step),
        original: effect.content,
        current: effect.content,
        partial: effect.partial,
      });
    }
  },
  write: (builder, effect) => {
    const file = builder.files.get(effect.path);
    // Claude Code пишет файл до правки — он точнее того, что агент успел прочитать.
    if (effect.before !== undefined && (file === undefined || file.writes === 0)) {
      builder.files.set(effect.path, {
        ...newFile(effect.path, file?.step ?? builder.step),
        original: effect.before,
        current: effect.before,
        status: effect.before === null ? 'created' : 'read',
      });
    }
    write(builder, effect.path, effect.after);
  },
  edit: (builder, effect) => {
    const file = builder.files.get(effect.path) ?? newFile(effect.path, builder.step);
    const after = file.current === null ? null : replaceText(file.current, effect);
    if (after !== null) {
      builder.files.set(effect.path, file);
      write(builder, effect.path, after);
      return;
    }
    builder.files.set(effect.path, {
      ...file,
      status: 'modified',
      writes: file.writes + 1,
      step: builder.step,
      // Есть diff от самого тула — показываем его куски с соседними строками.
      fragments: [
        ...file.fragments,
        ...(effect.hunks ?? [{ oldText: effect.oldString, newText: effect.newString }]),
      ],
    });
  },
};

function applyEffect(builder: Builder, effect: FileEffect): void {
  (EFFECT_HANDLERS[effect.kind] as (builder: Builder, effect: FileEffect) => void)(builder, effect);
}

// Правка фрагментом; null — фрагмента в известном тексте нет (например, прочитан кусок).
function replaceText(
  text: string,
  edit: { oldString: string; newString: string; replaceAll: boolean },
): string | null {
  if (!text.includes(edit.oldString)) {
    return null;
  }
  return edit.replaceAll
    ? text.split(edit.oldString).join(edit.newString)
    : text.replace(edit.oldString, () => edit.newString);
}

function testRunOf(step: number, result: Extract<HarnessEvent, { type: 'tool_result' }>): TestRun {
  const details = result.details ?? {};
  const tests = Array.isArray(details.tests) ? (details.tests as unknown[]) : [];
  return {
    step,
    passed: numberField(details, 'passed'),
    failed: numberField(details, 'failed'),
    failedTests: tests.filter(isFailedTest).map((test) => ({
      name: stringField(test, 'name') ?? 'тест',
      file: stringField(test, 'file'),
      error: stringField(test, 'error'),
    })),
    timedOut: details.timedOut === true,
    network: stringField(details, 'network'),
  };
}

// Команда — из аргументов вызова: у запрещённого запуска подробностей в результате нет.
function programRunOf(step: number, call: Call | undefined, result: ToolResult): ProgramRun {
  const details = result.details ?? {};
  const file = stringField(call?.arguments, 'file');
  const rawArgs = (call?.arguments as { args?: unknown } | undefined)?.args;
  const args = Array.isArray(rawArgs) ? rawArgs.map(String) : [];
  const output = stringField(details, 'output');
  return {
    step,
    command: file === null ? 'node …' : ['node', file, ...args].join(' '),
    exitCode: typeof details.exitCode === 'number' ? details.exitCode : null,
    timedOut: details.timedOut === true,
    output: result.status === 'success' ? (output ?? '').slice(0, 600) : null,
    status: result.status,
  };
}

function isFailedTest(test: unknown): boolean {
  return typeof test === 'object' && test !== null && (test as { ok?: unknown }).ok === false;
}

// Изменённые — первыми, в порядке пути; прочитанные — после.
function sortFiles(files: CodeFile[]): CodeFile[] {
  const rank = (file: CodeFile): number => (file.status === 'read' ? 1 : 0);
  return files.sort(
    (left, right) => rank(left) - rank(right) || left.path.localeCompare(right.path),
  );
}

function normalizePath(path: string): string {
  return path.replace(/^\.\//, '');
}

function stringField(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : null;
}

function numberField(value: Record<string, unknown>, key: string): number {
  const field = value[key];
  return typeof field === 'number' ? field : 0;
}
