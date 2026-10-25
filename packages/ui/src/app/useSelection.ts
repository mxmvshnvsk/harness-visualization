// Что открыто: живая сессия сервера, записанный трейс или лаборатория RAG. Хранится в адресе
// (?session=…, ?trace=… или ?lab=rag), поэтому ссылкой можно поделиться, а «назад» работает.
// null — ничего не открыто: стартовый экран.

import { useCallback, useEffect, useState } from 'react';

export type Selection =
  { kind: 'session'; sessionId: string } | { kind: 'trace'; file: string } | { kind: 'lab' };

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
  if (selection.kind === 'session') {
    params.set('session', selection.sessionId);
  } else if (selection.kind === 'trace') {
    params.set('trace', selection.file);
  } else {
    params.set('lab', 'rag');
  }
  return params.toString();
}

function readSelection(): Selection | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get('lab') === 'rag') {
    return { kind: 'lab' };
  }
  const sessionId = params.get('session');
  if (sessionId !== null) {
    return { kind: 'session', sessionId };
  }
  const file = params.get('trace');
  return file === null ? null : { kind: 'trace', file };
}
