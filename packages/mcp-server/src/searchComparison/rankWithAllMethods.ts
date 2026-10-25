// Один запрос — три выдачи по документам: по словам, по смыслу и гибридная.
// Каждая выдача полная, без отсечения: так видно, на каком месте нужный документ,
// даже если в первую пятёрку он не попал.

import { fuseByReciprocalRank, type RankedDocument } from '../hybridSearch/fuseByReciprocalRank.js';
import {
  rankByWordsAndMeaning,
  type SearchSources,
} from '../hybridSearch/rankByWordsAndMeaning.js';

export type { SearchSources };

export type SearchMethod = 'words' | 'meaning' | 'hybrid';

export const SEARCH_METHODS: SearchMethod[] = ['words', 'meaning', 'hybrid'];

export const SEARCH_METHOD_TITLES: Record<SearchMethod, string> = {
  words: 'по словам',
  meaning: 'по смыслу',
  hybrid: 'гибрид',
};

export type SearchRankings = Record<SearchMethod, RankedDocument[]>;

export async function rankWithAllMethods(
  query: string,
  sources: SearchSources,
): Promise<SearchRankings> {
  const { words, meaning } = await rankByWordsAndMeaning(query, sources);
  const hybrid = fuseByReciprocalRank([words, meaning]);
  return { words, meaning, hybrid };
}
