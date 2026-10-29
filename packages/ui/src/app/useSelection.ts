// Что открыто: живая сессия сервера, записанный трейс или лаборатория (RAG, MCP). Хранится в адресе
// (?session=…, ?trace=… или ?lab=rag | mcp | evals), поэтому ссылкой можно поделиться, а «назад» работает.
// null — ничего не открыто: стартовый экран. Лабораторию открыли из сессии или трейса — адрес
// помнит и его (?lab=rag&trace=…): «назад» из лаборатории возвращает туда, а не на старт.
// Шаг урока лаборатории — тоже в адресе (?lab=rag&step=check): ссылку на шаг можно дать студентам.
// Открыли с экрана «Лаборатории» — ?lab=rag&from=labs: «назад» ведёт к списку.
// Переход внутри приложения запоминает в записи истории, откуда пришли (prev): если «назад» на
// экране ведёт туда же — это шаг назад в истории браузера, и кнопки браузера не расходятся с
// кнопками экрана.

import { useCallback, useEffect, useState } from 'react';

export type LabName = 'rag' | 'mcp' | 'evals' | 'arena' | 'tokens';
const LABS: readonly LabName[] = ['rag', 'mcp', 'evals', 'arena', 'tokens'];

// Открытый поток событий: живая сессия или записанный трейс.
export type OpenedSelection =
  { kind: 'session'; sessionId: string } | { kind: 'trace'; file: string };

// Откуда открыли лабораторию, если не из сессии или трейса: со старта или с экрана «Лаборатории».
export type LabOrigin = 'start' | 'labs';

// step — id шага урока лаборатории (RAG, MCP); null — с начала. labs — экран «Лаборатории»
// со списком и вопросом каждой (?labs).
export type Selection =
  | OpenedSelection
  | {
      kind: 'lab';
      lab: LabName;
      back: OpenedSelection | null;
      from: LabOrigin;
      step: string | null;
    }
  | { kind: 'labs' };

// Куда ведёт «назад» из лаборатории.
export function labBackOf(selection: Selection & { kind: 'lab' }): Selection | null {
  if (selection.back !== null) {
    return selection.back;
  }
  return selection.from === 'labs' ? { kind: 'labs' } : null;
}

// Прошлая запись истории — этот самый экран target: вернуться к нему можно шагом назад.
export function cameFrom(target: Selection | null): boolean {
  const state: unknown = window.history.state;
  if (typeof state !== 'object' || state === null || !('prev' in state)) {
    return false;
  }
  const prev = typeof state.prev === 'string' ? state.prev : null;
  return prev !== null && urlOf(selectionOf(prev)) === urlOf(target);
}

// Открытая сессия или трейс под выбором: у лаборатории — откуда её открыли.
export function openedOf(selection: Selection | null): OpenedSelection | null {
  if (selection === null || selection.kind === 'labs') {
    return null;
  }
  return selection.kind === 'lab' ? selection.back : selection;
}

type SetSelection = (selection: Selection | null) => void;

// select — новая запись в истории браузера; replace — та же запись (шаг урока сменился).
export function useSelection(): [Selection | null, SetSelection, SetSelection] {
  const [selection, setSelection] = useState(readSelection);

  useEffect(() => {
    const onPopState = (): void => {
      setSelection(readSelection());
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  const select = useCallback((next: Selection | null) => {
    window.history.pushState({ prev: window.location.search }, '', urlOf(next));
    setSelection(next);
  }, []);
  const replace = useCallback((next: Selection | null) => {
    window.history.replaceState(window.history.state, '', urlOf(next));
    setSelection(next);
  }, []);

  return [selection, select, replace];
}

function urlOf(selection: Selection | null): string {
  const query = selection === null ? '' : queryOf(selection);
  return query === '' ? window.location.pathname : `?${query}`;
}

function queryOf(selection: Selection): string {
  if (selection.kind === 'labs') {
    return 'labs';
  }
  const params = new URLSearchParams();
  const opened = openedOf(selection);
  if (selection.kind === 'lab') {
    params.set('lab', selection.lab);
    if (selection.step !== null) {
      params.set('step', selection.step);
    }
    if (selection.back === null && selection.from === 'labs') {
      params.set('from', 'labs');
    }
  }
  if (opened?.kind === 'session') {
    params.set('session', opened.sessionId);
  } else if (opened?.kind === 'trace') {
    params.set('trace', opened.file);
  }
  return params.toString();
}

function readSelection(): Selection | null {
  return selectionOf(window.location.search);
}

function selectionOf(search: string): Selection | null {
  const params = new URLSearchParams(search);
  if (params.has('labs')) {
    return { kind: 'labs' };
  }
  const lab = LABS.find((name) => name === params.get('lab'));
  const opened = readOpened(params);
  if (lab === undefined) {
    return opened;
  }
  const from = params.get('from') === 'labs' ? 'labs' : 'start';
  return { kind: 'lab', lab, back: opened, from, step: params.get('step') };
}

function readOpened(params: URLSearchParams): OpenedSelection | null {
  const sessionId = params.get('session');
  if (sessionId !== null) {
    return { kind: 'session', sessionId };
  }
  const file = params.get('trace');
  return file === null ? null : { kind: 'trace', file };
}
