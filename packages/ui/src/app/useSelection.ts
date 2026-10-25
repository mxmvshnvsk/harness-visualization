// Что открыто: живая сессия сервера или записанный трейс. Хранится в адресе
// (?session=… или ?trace=…), поэтому ссылкой можно поделиться, а «назад» в браузере работает.

import { useCallback, useEffect, useState } from 'react';

export type Selection = { kind: 'session'; sessionId: string } | { kind: 'trace'; file: string };

export function useSelection(): [Selection | null, (selection: Selection) => void] {
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

  const select = useCallback((next: Selection) => {
    const params = new URLSearchParams();
    if (next.kind === 'session') {
      params.set('session', next.sessionId);
    } else {
      params.set('trace', next.file);
    }
    window.history.pushState(null, '', `?${params.toString()}`);
    setSelection(next);
  }, []);

  return [selection, select];
}

function readSelection(): Selection | null {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session');
  if (sessionId !== null) {
    return { kind: 'session', sessionId };
  }
  const file = params.get('trace');
  return file === null ? null : { kind: 'trace', file };
}
