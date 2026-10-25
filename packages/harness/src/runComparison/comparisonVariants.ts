// Варианты, которые сравнивает pnpm compare-runs: кто ищет в базе знаний и каким тулом.
// Тул у вариантов auto задан явно, а не берётся из конфига: иначе смена retrieval.toolName
// незаметно поменяла бы, что сравнивается.

import type { RetrievalMode } from '../settings/settingsSchema.js';

export interface RunVariant {
  name: string;
  retrievalMode: RetrievalMode;
  // null — модель ищет сама, харнесс ничего не подмешивает.
  retrievalToolName: string | null;
  description: string;
}

export const RUN_VARIANTS: RunVariant[] = [
  {
    name: 'tool',
    retrievalMode: 'tool',
    retrievalToolName: null,
    description: 'модель ищет сама',
  },
  {
    name: 'auto',
    retrievalMode: 'auto',
    retrievalToolName: 'kedr__semantic_search',
    description: 'харнесс делает semantic search словами пользователя и подмешивает',
  },
  {
    name: 'rewrite',
    retrievalMode: 'rewrite',
    retrievalToolName: 'kedr__semantic_search',
    description: 'модель составляет query, харнесс делает semantic search по нему и подмешивает',
  },
  {
    name: 'hybrid',
    retrievalMode: 'auto',
    retrievalToolName: 'kedr__hybrid_search',
    description: 'харнесс делает hybrid search словами пользователя и подмешивает',
  },
];

// Без флага --variants: урок «кто формулирует запрос» — пользователь, модель по просьбе
// харнесса или модель сама. hybrid — по запросу: он про поисковый движок, а не про автора запроса.
export const DEFAULT_VARIANT_NAMES = ['tool', 'auto', 'rewrite'];
