// Поиск по смыслу находит фрагменты, а сравнивать его с поиском по словам нужно
// по документам. Документ получает сходство своего лучшего фрагмента: если хоть один
// фрагмент близок к вопросу, документ подходит, сколько бы в нём ни было остального.

import type { RankedDocument } from '../hybridSearch/fuseByReciprocalRank.js';
import type { SemanticHit } from './rankChunks.js';

// hits уже отсортированы по убыванию сходства, поэтому первый фрагмент документа — лучший.
export function rankDocumentsByBestChunk(hits: SemanticHit[]): RankedDocument[] {
  const ranked: RankedDocument[] = [];
  const seenDocumentIds = new Set<string>();
  for (const hit of hits) {
    const documentId = hit.indexed.chunk.document.id;
    if (seenDocumentIds.has(documentId)) {
      continue;
    }
    seenDocumentIds.add(documentId);
    ranked.push({ documentId, score: hit.similarity });
  }
  return ranked;
}
