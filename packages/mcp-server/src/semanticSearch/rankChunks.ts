// Поиск перебором: сходство запроса считается с каждым фрагментом.
// Фрагментов около сотни, поэтому перебор быстрый — и честнее специальных
// структур для приближённого поиска: здесь видно, что поиск по смыслу — это просто
// «сравнить вектор вопроса со всеми векторами и взять самые близкие».

import { cosineSimilarity } from '@harness-visualization/embeddings';
import type { IndexedChunk } from './documentChunk.js';

export interface SemanticHit {
  indexed: IndexedChunk;
  // Скалярное произведение векторов длины 1 — косинус угла между ними.
  similarity: number;
}

export function rankChunks(
  chunks: IndexedChunk[],
  queryVector: number[],
  limit: number,
): SemanticHit[] {
  return chunks
    .map((indexed) => ({ indexed, similarity: cosineSimilarity(indexed.vector, queryVector) }))
    .sort((first, second) => second.similarity - first.similarity)
    .slice(0, limit);
}
