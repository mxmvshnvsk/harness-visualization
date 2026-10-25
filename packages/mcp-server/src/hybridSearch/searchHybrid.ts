// Гибридный поиск для тула hybrid_search: выдачи по словам и по смыслу объединяются
// по местам (Reciprocal Rank Fusion, см. fuseByReciprocalRank), и у каждого найденного
// документа берётся его лучший по смыслу фрагмент. Фрагмент есть у любого документа:
// поиск по смыслу ранжирует все фрагменты, даже если документ нашёлся только по словам —
// как старый FAQ кадров, у которого «удалёнка» есть лишь в тегах.

import type { SemanticHit } from '../semanticSearch/rankChunks.js';
import { fuseByReciprocalRank, type RankedDocument } from './fuseByReciprocalRank.js';
import { rankByWordsAndMeaning, type SearchSources } from './rankByWordsAndMeaning.js';

export interface HybridHit {
  documentId: string;
  fusedScore: number;
  // Место документа в выдаче по словам и по смыслу, с единицы; null — по словам не нашёлся.
  wordsPlace: number | null;
  meaningPlace: number | null;
  bestChunk: SemanticHit;
}

export async function searchHybrid(
  query: string,
  limit: number,
  sources: SearchSources,
): Promise<HybridHit[]> {
  const { words, meaning, chunkHits } = await rankByWordsAndMeaning(query, sources);
  const hits: HybridHit[] = [];
  for (const fused of fuseByReciprocalRank([words, meaning]).slice(0, limit)) {
    const bestChunk = chunkHits.find((hit) => hit.indexed.chunk.document.id === fused.documentId);
    if (bestChunk === undefined) {
      continue;
    }
    hits.push({
      documentId: fused.documentId,
      fusedScore: fused.score,
      wordsPlace: placeOf(words, fused.documentId),
      meaningPlace: placeOf(meaning, fused.documentId),
      bestChunk,
    });
  }
  return hits;
}

function placeOf(ranking: RankedDocument[], documentId: string): number | null {
  const index = ranking.findIndex((ranked) => ranked.documentId === documentId);
  return index === -1 ? null : index + 1;
}
