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
    description: 'харнесс подмешивает поиск по смыслу',
  },
  {
    name: 'hybrid',
    retrievalMode: 'auto',
    retrievalToolName: 'kedr__hybrid_search',
    description: 'харнесс подмешивает гибридный поиск',
  },
];
