// Загрузка данных лаборатории: база (документы, фрагменты, векторы) и векторы учебных фраз.
// Модели эмбеддингов на сервере нет — понятная ошибка с подсказкой, а не пустой экран.

import type { LabBase, LabIndex, LabSearch } from '@harness-visualization/mcp-server/lab';
import type { GroundingReportResponse } from '@harness-visualization/server';
import { useEffect, useState } from 'react';
import {
  embedTexts,
  getCourseGrounding,
  getGrounding,
  getRagIndex,
  getRagBase,
  searchRag,
  ServerError,
} from '../../api/serverApi';

export type Loaded<Value> =
  { status: 'loading' } | { status: 'ready'; value: Value } | { status: 'error'; message: string };

export function useRagBase(): Loaded<LabBase> {
  return useLoaded(getRagBase, []);
}

// Векторы фраз — один запрос на набор; набор не меняется, пока шаг открыт.
export function useEmbeddings(texts: readonly string[]): Loaded<number[][]> {
  const key = texts.join('\n');
  return useLoaded(() => embedTexts(key.split('\n')), [key]);
}

export function useRagIndex(): Loaded<LabIndex> {
  return useLoaded(getRagIndex, []);
}

// Три выдачи поиска по запросу; запрос сменился — ищем заново.
export function useSearch(query: string): Loaded<LabSearch> {
  return useLoaded(() => searchRag(query), [query]);
}

// Опора ответа записанной сессии: код и сходство, мнения судьи — если трейс проверяли.
export function useGrounding(file: string): Loaded<GroundingReportResponse> {
  return useLoaded(() => getGrounding(file), [file]);
}

export function useCourseGrounding(): Loaded<GroundingReportResponse> {
  return useLoaded(getCourseGrounding, []);
}

function useLoaded<Value>(load: () => Promise<Value>, deps: readonly unknown[]): Loaded<Value> {
  const [state, setState] = useState<Loaded<Value>>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    load().then(
      (value) => {
        if (!cancelled) {
          setState({ status: 'ready', value });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', message: describe(error) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // load — функция-обёртка, её смена не означает новых данных: зависимость — deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function describe(error: unknown): string {
  if (error instanceof ServerError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
