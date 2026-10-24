// Фрагмент документа для поиска по смыслу.

import type { KnowledgeDocument } from '../knowledgeBase/documentTypes.js';

export interface DocumentChunk {
  document: KnowledgeDocument;
  // Номер фрагмента в документе, с единицы.
  position: number;
  // Сколько всего фрагментов у документа — чтобы показать модели «фрагмент 2 из 5».
  totalInDocument: number;
  text: string;
}

// Фрагмент вместе с его вектором — то, по чему идёт поиск.
export interface IndexedChunk {
  chunk: DocumentChunk;
  vector: number[];
}
