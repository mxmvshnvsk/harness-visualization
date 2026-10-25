// Две полные выдачи по документам для одного запроса — по словам и по смыслу.
// Общая часть сравнения поиска (pnpm compare-search) и тула hybrid_search.

import type { KnowledgeDocument } from '../knowledgeBase/documentTypes.js';
import { searchDocuments } from '../knowledgeBase/searchDocuments.js';
import type { SemanticHit } from '../semanticSearch/rankChunks.js';
import { rankDocumentsByBestChunk } from '../semanticSearch/rankDocumentsByBestChunk.js';
import type { SemanticIndex } from '../semanticSearch/SemanticIndex.js';
import type { RankedDocument } from './fuseByReciprocalRank.js';

export interface SearchSources {
  documents: KnowledgeDocument[];
  semanticIndex: SemanticIndex;
}

export interface WordsAndMeaningRankings {
  words: RankedDocument[];
  meaning: RankedDocument[];
  // Все фрагменты по убыванию сходства — из них берётся лучший фрагмент документа.
  chunkHits: SemanticHit[];
}

export async function rankByWordsAndMeaning(
  query: string,
  sources: SearchSources,
): Promise<WordsAndMeaningRankings> {
  const words = searchDocuments(sources.documents, query, sources.documents.length).map((hit) => ({
    documentId: hit.document.id,
    score: hit.score,
  }));
  // Без ограничения: нужны все фрагменты, чтобы у каждого документа было место в выдаче.
  const chunkHits = await sources.semanticIndex.search(query, Number.POSITIVE_INFINITY);
  return { words, meaning: rankDocumentsByBestChunk(chunkHits), chunkHits };
}
