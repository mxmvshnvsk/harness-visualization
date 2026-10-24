// Гибридный поиск: объединяет выдачи разных способов поиска по местам, а не по оценкам.
// Оценки несравнимы — у поиска по словам это число совпадений, у поиска по смыслу косинус, —
// а места сравнимы всегда. Документ получает 1 / (k + место) от каждой выдачи, где он есть.
//
// Идея — Reciprocal Rank Fusion: G. V. Cormack, C. L. A. Clarke, S. Büttcher,
// «Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods»,
// SIGIR 2009, https://doi.org/10.1145/1571941.1572114. Реализация своя.

// k из статьи: сглаживает разницу между первыми местами, чтобы одна выдача не перевешивала.
export const RECIPROCAL_RANK_CONSTANT = 60;

export interface RankedDocument {
  documentId: string;
  // Оценка способа поиска: больше — ближе к запросу. Между способами не сравнивается.
  score: number;
}

export function fuseByReciprocalRank(rankings: RankedDocument[][]): RankedDocument[] {
  const fusedScores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((ranked, index) => {
      const place = index + 1;
      const previous = fusedScores.get(ranked.documentId) ?? 0;
      fusedScores.set(ranked.documentId, previous + 1 / (RECIPROCAL_RANK_CONSTANT + place));
    });
  }
  return [...fusedScores.entries()]
    .map(([documentId, score]) => ({ documentId, score }))
    .sort((first, second) => second.score - first.score);
}
