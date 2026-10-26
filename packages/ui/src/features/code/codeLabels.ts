// Подписи вкладки «Код» — отдельно от разметки, чтобы проверять их тестами.

import type { ArenaRun, HarnessEvent } from '@harness-visualization/harness';
import type { CodeFile } from '../../projections/projectCode';

export function describeArena(arena: ArenaRun): string {
  const task =
    arena.taskId === null
      ? `свободный режим · проект ${arena.project ?? '?'}`
      : `задача ${arena.taskId}`;
  const tests = `${arena.runTests ? 'с run_tests' : 'вслепую, без run_tests'}${arena.runNode === true ? ', run_node с подтверждением' : ''}`;
  const network = arena.network === 'closed' ? 'сеть закрыта' : 'сеть открыта';
  // Трейсы первых прогонов (до 26.10.2026, 12:40) пресета и лимита не записывали.
  const limits =
    (arena.contextPreset as string | undefined) === undefined
      ? ''
      : ` · контекст ${arena.contextPreset}, до ${String(arena.maxIterations)} шагов`;
  return `Код-арена · ${task} · ${tests}${limits} · Node ${arena.nodeVersion}, ${network}`;
}

export const STATUS_LABELS: Record<CodeFile['status'], string> = {
  read: 'прочитан',
  created: 'новый',
  modified: 'изменён',
  deleted: 'удалён',
};

// Чего о файле в трейсе нет — честно, под заголовком diff.
export function describeFileNote(file: CodeFile): string {
  if (file.fragments.length > 0) {
    return ' · текста файла целиком в записи нет: ниже — правки фрагментами, номера строк — от начала фрагмента';
  }
  if (file.partial) {
    return ' · прочитана часть файла: номера строк — от начала прочитанного куска';
  }
  return file.status === 'created' && file.original === null
    ? ' · агент записал файл, не прочитав: исходного текста в трейсе нет'
    : '';
}

// Вкладка видна всегда, как «Агенты»: пустая — объясняет почему.
export function describeNoCode(events: readonly HarnessEvent[]): string {
  const started = events.find((event) => event.type === 'session_started');
  if (started?.type === 'session_started' && (started.arena ?? null) !== null) {
    return 'Агент ещё не открыл ни одного файла проекта. Файлы, diff и запуски тестов появятся здесь по ходу прогона.';
  }
  const imported = started?.type === 'session_started' ? (started.importedFrom ?? null) : null;
  if (imported !== null) {
    return `В этой записи ${imported.harness} агент не читал и не менял файлов — или делал это тулами, которых адаптер не знает (например, через shell).`;
  }
  return 'В этой сессии код не писали. Вкладка — для прогонов Код-арены (Лаборатории → Код-арена): файлы копии проекта, что агент в них поменял, запуски тестов и приёмка.';
}
