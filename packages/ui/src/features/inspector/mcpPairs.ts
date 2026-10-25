// Пары сообщений MCP по вызовам тулов — для блока «через MCP» в панели вызова. Инспектор
// кладёт их в контекст один раз, чтобы не протаскивать через карточки этапов.

import type { HarnessEvent } from '@harness-visualization/harness';
import { createContext, useContext, useMemo } from 'react';
import { projectMcp, type McpPair } from '../../projections/projectMcp';

export const McpPairsContext = createContext<ReadonlyMap<string, McpPair>>(new Map());

// Пары tools/call до курсора повтора: ответ, который ещё не пришёл, — null.
export function useMcpPairs(
  events: readonly HarnessEvent[],
  shown: number,
): ReadonlyMap<string, McpPair> {
  const view = useMemo(() => projectMcp(events), [events]);
  return useMemo(() => {
    const pairs = new Map<string, McpPair>();
    for (const item of view.journal) {
      if (item.kind === 'pair' && item.pair.call !== null && item.pair.index < shown) {
        const response =
          item.pair.response !== null && item.pair.response.index < shown
            ? item.pair.response
            : null;
        pairs.set(item.pair.call.toolCallId, { ...item.pair, response });
      }
    }
    return pairs;
  }, [view, shown]);
}

export function useMcpPair(toolCallId: string): McpPair | null {
  return useContext(McpPairsContext).get(toolCallId) ?? null;
}
