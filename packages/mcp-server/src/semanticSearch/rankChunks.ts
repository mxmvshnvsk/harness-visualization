// Поиск перебором: сходство запроса считается с каждым фрагментом.
// Фрагментов около сотни, поэтому перебор быстрый — и честнее специальных
// структур для приближённого поиска: здесь видно, что поиск по смыслу — это просто
// «сравнить вектор вопроса со всеми векторами и взять самые близкие».

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
    .map((indexed) => ({ indexed, similarity: dotProduct(indexed.vector, queryVector) }))
    .sort((first, second) => second.similarity - first.similarity)
    .slice(0, limit);
}

function dotProduct(first: number[], second: number[]): number {
  let sum = 0;
  for (let index = 0; index < first.length; index += 1) {
    sum += (first[index] ?? 0) * (second[index] ?? 0);
  }
  return sum;
}
