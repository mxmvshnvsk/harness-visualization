// Список с сервера (сессии, трейсы) с перезагрузкой по требованию.

import { useCallback, useEffect, useState } from 'react';

export interface ServerList<Item> {
  items: Item[];
  error: string | null;
  reload: () => void;
}

export function useServerList<Item>(load: () => Promise<Item[]>): ServerList<Item> {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    load()
      .then((loaded) => {
        setItems(loaded);
        setError(null);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
  }, [load]);

  useEffect(reload, [reload]);

  return { items, error, reload };
}
