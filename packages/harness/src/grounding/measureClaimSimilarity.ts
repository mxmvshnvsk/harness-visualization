// Уровень 2 проверки опоры (этап 5b.2): для каждого claim — ближайшая строка того, что
// видела модель, по сходству embeddings. Стабильно, но приблизительно: высокое сходство
// значит «про то же», а не «то же утверждает». На трейсе 53863eac противоречащие источнику
// claims («отпуск 35 дней» при 28, «до 2 дней» при 3) дали 0.87–0.91 — столько же, сколько
// верные (0.88–0.95), а выдуманные («бесплатные обеды») — 0.84–0.86. Отличить верное
// от противоречащего — задача модели-судьи (5b.3) или человека.
//
// Claim — запрос (префикс query:), строки увиденного — passages, как требует модель e5.

import { cosineSimilarity, type TextEmbedder } from '@harness-visualization/embeddings';
import type { ClaimCheck, SeenText, SimilarityMatch } from './claimTypes.js';
import { LEVEL_STRENGTH } from './findQuotes.js';
import { splitSeenTextIntoLines } from './splitSeenTextIntoLines.js';

// Сколько ближайших строк сохранять для судьи: одна строка часто без контекста
// («до трёх дней» — чего?), три — уже видно, о чём речь.
const CLOSEST_LINES_COUNT = 3;

interface SeenPassage {
  passage: string;
  documentId: string | null;
  seen: SeenText;
}

export async function measureClaimSimilarity(
  claims: ClaimCheck[],
  seenTexts: SeenText[],
  embedder: TextEmbedder,
): Promise<ClaimCheck[]> {
  const passages = collectPassages(seenTexts);
  if (claims.length === 0 || passages.length === 0) {
    return claims;
  }
  const claimVectors = await embedder.embedQueries(claims.map((checked) => checked.claim.text));
  const passageVectors = await embedder.embedPassages(passages.map((item) => item.passage));
  return claims.map((checked, index) => {
    const closestLines = rankLines(claimVectors[index] ?? [], passages, passageVectors);
    return { ...checked, similarity: closestLines[0] ?? null, closestLines };
  });
}

// Одну и ту же строку модель могла получить несколько раз — snippet-ом в выдаче и в документе
// целиком. Считаем её один раз и запоминаем самое сильное появление, как и для цитат.
function collectPassages(seenTexts: SeenText[]): SeenPassage[] {
  const byText = new Map<string, SeenPassage>();
  for (const seen of seenTexts) {
    for (const line of splitSeenTextIntoLines(seen.text)) {
      const known = byText.get(line.text);
      if (known === undefined || LEVEL_STRENGTH[seen.level] < LEVEL_STRENGTH[known.seen.level]) {
        byText.set(line.text, { passage: line.text, documentId: line.documentId, seen });
      }
    }
  }
  return [...byText.values()];
}

function rankLines(
  claimVector: number[],
  passages: SeenPassage[],
  passageVectors: number[][],
): SimilarityMatch[] {
  return passages
    .map((item, index) => ({
      score: cosineSimilarity(claimVector, passageVectors[index] ?? []),
      passage: item.passage,
      documentId: item.documentId,
      seen: item.seen,
    }))
    .sort((first, second) => second.score - first.score)
    .slice(0, CLOSEST_LINES_COUNT);
}
