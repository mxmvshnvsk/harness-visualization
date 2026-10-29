// Переходы между видами открытой сессии — одна цепочка с разных сторон: шаг в инспекторе
// (просьба модели, политика, результат), пара сообщений в журнале MCP и тот же поиск в «RAG»
// (как запрос стал вектором). Вызов узнаётся по toolCallId, а поиск харнесса до модели,
// у которого просьбы модели нет, — по запросу.

import { createContext, useContext } from 'react';

export interface SearchLink {
  toolCallId: string | null;
  query: string;
  // Запрос к модели, который раскрыть в инспекторе (экскурсия: «Подробнее» на шаге).
  requestId?: string;
}

export interface ViewLinks {
  toRag: (link: SearchLink) => void;
  toMcp: (link: SearchLink) => void;
  // В инспектор: раскрыть вызов тула (или поиск харнесса, если toolCallId — null).
  toInspector: (link: SearchLink) => void;
}

export const ViewLinksContext = createContext<ViewLinks | null>(null);

export function useViewLinks(): ViewLinks | null {
  return useContext(ViewLinksContext);
}

export function sameSearch(link: SearchLink, toolCallId: string | null, query: string): boolean {
  return link.toolCallId === null
    ? toolCallId === null && query === link.query
    : link.toolCallId === toolCallId;
}
