// Один запрос — три выдачи по документам: по словам, по смыслу и гибридная.
// Каждая выдача полная, без отсечения: так видно, на каком месте нужный документ,
// даже если в первую пятёрку он не попал.

import { fuseByReciprocalRank, type RankedDocument } from '../hybridSearch/fuseByReciprocalRank.js';
import type { KnowledgeDocument } from '../knowledgeBase/documentTypes.js';
import { searchDocuments } from '../knowledgeBase/searchDocuments.js';
import { rankDocumentsByBestChunk } from '../semanticSearch/rankDocumentsByBestChunk.js';
import type { SemanticIndex } from '../semanticSearch/SemanticIndex.js';

export type SearchMethod = 'words' | 'meaning' | 'hybrid';

export const SEARCH_METHODS: SearchMethod[] = ['words', 'meaning', 'hybrid'];

export const SEARCH_METHOD_TITLES: Record<SearchMethod, string> = {
  words: 'по словам',
  meaning: 'по смыслу',
  hybrid: 'гибрид',
};

export type SearchRankings = Record<SearchMethod, RankedDocument[]>;

export interface SearchSources {
  documents: KnowledgeDocument[];
  semanticIndex: SemanticIndex;
}

export async function rankWithAllMethods(
  query: string,
  sources: SearchSources,
): Promise<SearchRankings> {
  const words = searchDocuments(sources.documents, query, sources.documents.length).map((hit) => ({
    documentId: hit.document.id,
    score: hit.score,
  }));
  // Без ограничения: нужны все фрагменты, чтобы у каждого документа было место в выдаче.
  const chunkHits = await sources.semanticIndex.search(query, Number.POSITIVE_INFINITY);
  const meaning = rankDocumentsByBestChunk(chunkHits);
  const hybrid = fuseByReciprocalRank([words, meaning]);
  return { words, meaning, hybrid };
}
