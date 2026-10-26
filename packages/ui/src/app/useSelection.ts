// Что открыто: живая сессия сервера, записанный трейс или лаборатория (RAG, MCP). Хранится в адресе
// (?session=…, ?trace=… или ?lab=rag | mcp | evals), поэтому ссылкой можно поделиться, а «назад» работает.
// null — ничего не открыто: стартовый экран. Лабораторию открыли из сессии или трейса — адрес
// помнит и его (?lab=rag&trace=…): «назад» из лаборатории возвращает туда, а не на старт.

import { useCallback, useEffect, useState } from 'react';

export type LabName = 'rag' | 'mcp' | 'evals';
const LABS: readonly LabName[] = ['rag', 'mcp', 'evals'];

// Открытый поток событий: живая сессия или записанный трейс.
export type OpenedSelection =
  { kind: 'session'; sessionId: string } | { kind: 'trace'; file: string };

export type Selection =
  OpenedSelection | { kind: 'lab'; lab: LabName; back: OpenedSelection | null };

export function useSelection(): [Selection | null, (selection: Selection | null) => void] {
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
    const query = next === null ? '' : queryOf(next);
    window.history.pushState(null, '', query === '' ? window.location.pathname : `?${query}`);
    setSelection(next);
  }, []);

  return [selection, select];
}

function queryOf(selection: Selection): string {
  const params = new URLSearchParams();
  const opened = selection.kind === 'lab' ? selection.back : selection;
  if (selection.kind === 'lab') {
    params.set('lab', selection.lab);
  }
  if (opened?.kind === 'session') {
    params.set('session', opened.sessionId);
  } else if (opened?.kind === 'trace') {
    params.set('trace', opened.file);
  }
  return params.toString();
}

function readSelection(): Selection | null {
  const params = new URLSearchParams(window.location.search);
  const lab = LABS.find((name) => name === params.get('lab'));
  const opened = readOpened(params);
  return lab === undefined ? opened : { kind: 'lab', lab, back: opened };
}

function readOpened(params: URLSearchParams): OpenedSelection | null {
  const sessionId = params.get('session');
  if (sessionId !== null) {
    return { kind: 'session', sessionId };
  }
  const file = params.get('trace');
  return file === null ? null : { kind: 'trace', file };
}
