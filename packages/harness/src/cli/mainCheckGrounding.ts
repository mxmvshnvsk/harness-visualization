// Точка входа команды pnpm check-grounding <файл трейса>:
// печатает, на какие источники сослался ответ и что модель видела по каждому (уровень 1),
// и на что опирается каждый claim ответа: дословные цитаты и сходство embeddings (уровень 2).

import { styleText } from 'node:util';
import {
  EMBEDDING_MODEL_DIRECTORY,
  ModelMissingError,
  TextEmbedder,
} from '@harness-visualization/embeddings';
import type { ClaimCheck, SeenText } from '../grounding/claimTypes.js';
import { checkGrounding } from '../grounding/checkGrounding.js';
import { collectSeenTexts } from '../grounding/collectSeenTexts.js';
import { describeClaimsReport } from '../grounding/describeClaimsReport.js';
import { describeGroundingReport } from '../grounding/describeGroundingReport.js';
import { measureClaimSimilarity } from '../grounding/measureClaimSimilarity.js';
import { readTrace } from '../grounding/readTrace.js';
import { readConfigFile } from '../settings/loadSettings.js';

interface SimilarityOutcome {
  claims: ClaimCheck[];
  skippedReason: string | null;
}

async function main(): Promise<void> {
  const tracePath = process.argv[2];
  if (tracePath === undefined) {
    console.error('Укажите файл трейса: pnpm check-grounding traces/<файл>.jsonl');
    process.exitCode = 1;
    return;
  }
  const settings = await readConfigFile(process.cwd());
  const events = await readTrace(tracePath);
  const report = checkGrounding(events);
  const similarity = await addSimilarity(report.claims, collectSeenTexts(events));

  console.log(styleText('bold', `Grounding check (проверка опоры ответа) по трейсу ${tracePath}`));
  for (const line of describeGroundingReport(report)) {
    console.log(line);
  }
  console.log('');
  const claimLines = describeClaimsReport(similarity.claims, {
    similarityThreshold: settings.grounding.similarityThreshold,
    similaritySkippedReason: similarity.skippedReason,
  });
  for (const line of claimLines) {
    console.log(line);
  }
}

// Без скачанной модели эмбеддингов отчёт всё равно полезен: ссылки и цитаты проверяются кодом.
async function addSimilarity(
  claims: ClaimCheck[],
  seenTexts: SeenText[],
): Promise<SimilarityOutcome> {
  try {
    const embedder = await TextEmbedder.load({
      modelDirectory: EMBEDDING_MODEL_DIRECTORY,
      allowDownload: false,
    });
    return {
      claims: await measureClaimSimilarity(claims, seenTexts, embedder),
      skippedReason: null,
    };
  } catch (error) {
    if (error instanceof ModelMissingError) {
      return { claims, skippedReason: error.message };
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
