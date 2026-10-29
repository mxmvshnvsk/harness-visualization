// Переходы между видами открытой сессии — одна цепочка с разных сторон: шаг в инспекторе
// (просьба модели, политика, результат), пара сообщений в журнале MCP и тот же поиск в «RAG»
// (как запрос стал вектором), запрос к модели в «Контексте», скилл, память и план в «Скиллах
// и памяти», файл в «Коде». Вызов узнаётся по toolCallId, запрос к модели — по requestId,
// поиск харнесса до модели, у которого просьбы модели нет, — по запросу, файл — по пути.

import { createContext, useContext } from 'react';

export interface SearchLink {
  toolCallId: string | null;
  query: string;
  // Запрос к модели: раскрыть в инспекторе, выбрать в «Контексте».
  requestId?: string;
  // Файл, который открыть в «Коде».
  path?: string;
}

export interface ViewLinks {
  toRag: (link: SearchLink) => void;
  toMcp: (link: SearchLink) => void;
  // В инспектор: раскрыть вызов тула (или поиск харнесса, если toolCallId — null).
  toInspector: (link: SearchLink) => void;
  // В «Контекст»: выбрать запрос к модели (requestId).
  toContext: (link: SearchLink) => void;
  // В «Скиллы и память»: подсветить то, что сделал вызов (toolCallId).
  toSkills: (link: SearchLink) => void;
  // В «Код»: открыть файл (path).
  toCode: (link: SearchLink) => void;
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
