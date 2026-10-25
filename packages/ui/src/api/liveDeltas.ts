// Напечатанное моделью вживую (этап 8d.3) — через контекст, чтобы не тянуть его через все
// экраны до «Диалога». У трейса и законченной сессии — пусто.

import { createContext, useContext } from 'react';
import type { LiveDeltas } from './useEventStream';

export const LiveDeltasContext = createContext<LiveDeltas>({});

export function useLiveDeltas(): LiveDeltas {
  return useContext(LiveDeltasContext);
}
