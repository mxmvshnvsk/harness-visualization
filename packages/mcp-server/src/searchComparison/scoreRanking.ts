// Насколько выдача хороша для вопроса с известными нужными документами.
// Три простые меры вместо одной сложной: их легко проверить глазами по таблице.

import type { RankedDocument } from '../hybridSearch/fuseByReciprocalRank.js';

const TOP_THREE = 3;
export const TOP_FIVE = 5;

export interface RankingScore {
  // Первым в выдаче стоит нужный документ.
  firstIsExpected: boolean;
  // Хотя бы один нужный документ — в первой тройке.
  expectedInTopThree: boolean;
  // Сколько нужных документов попало в первую пятёрку.
  foundInTopFive: number;
  expectedCount: number;
  // Место каждого нужного документа, с единицы; null — документа в выдаче нет вовсе.
  places: (number | null)[];
}

export function scoreRanking(ranking: RankedDocument[], expectedIds: string[]): RankingScore {
  const places = expectedIds.map((expectedId) => {
    const index = ranking.findIndex((ranked) => ranked.documentId === expectedId);
    return index === -1 ? null : index + 1;
  });
  const placesFound = places.filter((place) => place !== null);
  return {
    firstIsExpected: placesFound.includes(1),
    expectedInTopThree: placesFound.some((place) => place <= TOP_THREE),
    foundInTopFive: placesFound.filter((place) => place <= TOP_FIVE).length,
    expectedCount: expectedIds.length,
    places,
  };
}
