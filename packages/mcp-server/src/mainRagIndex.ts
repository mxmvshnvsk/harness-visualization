// Команда pnpm rag-index: скачивает модель эмбеддингов, если её ещё нет,
// и считает векторы фрагментов базы знаний в кэш.
//
// Скачивание — отдельной командой, а не при старте MCP-сервера: иначе первый pnpm chat
// молча тянул бы около 120 МБ, а подпроцесс сервера ещё и не получает сетевые настройки
// харнесса. Здесь же сеть идёт через прокси из HTTPS_PROXY (команда задаёт NODE_USE_ENV_PROXY=1).

import type { ProgressInfo } from '@huggingface/transformers';
import { loadKnowledgeBase } from './knowledgeBase/loadKnowledgeBase.js';
import type { IndexedChunk } from './semanticSearch/documentChunk.js';
import { embedChunks } from './semanticSearch/embedChunks.js';
import { CHUNK_TARGET_LENGTH } from './semanticSearch/splitIntoChunks.js';
import {
  EMBEDDING_MODEL_DTYPE,
  EMBEDDING_MODEL_ID,
  TextEmbedder,
} from './semanticSearch/TextEmbedder.js';
import { DATA_DIRECTORY, MODEL_DIRECTORY, VECTOR_CACHE_PATH } from './serverPaths.js';

async function main(): Promise<void> {
  const startedAt = performance.now();
  const documents = await loadKnowledgeBase(DATA_DIRECTORY);
  console.log(`Документов в базе знаний: ${documents.length}`);
  console.log(`Модель ${EMBEDDING_MODEL_ID} (${EMBEDDING_MODEL_DTYPE}), папка ${MODEL_DIRECTORY}`);

  const embedder = await TextEmbedder.load({
    modelDirectory: MODEL_DIRECTORY,
    allowDownload: true,
    onLoadProgress: printDownloadProgress,
  });
  const result = await embedChunks({
    documents,
    embedder,
    vectorCachePath: VECTOR_CACHE_PATH,
    onProgress: (embeddedCount, totalToEmbed) => {
      console.log(`Векторы: ${embeddedCount} из ${totalToEmbed}`);
    },
  });

  printChunkStatistics(result.chunks);
  console.log(`Из кэша: ${result.reusedCount}, посчитано заново: ${result.embeddedCount}`);
  console.log(`Vector cache: ${VECTOR_CACHE_PATH}`);
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  console.log(`Готово за ${seconds} с`);
}

// Показываем только скачивание: файлы, уже лежащие в папке модели, загружаются молча.
function printDownloadProgress(progress: ProgressInfo): void {
  if (progress.status === 'download') {
    console.log(`Скачивается ${progress.file}…`);
  }
}

function printChunkStatistics(chunks: IndexedChunk[]): void {
  const lengths = chunks.map((indexed) => indexed.chunk.text.length);
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  const averageLength = chunks.length === 0 ? 0 : Math.round(totalLength / chunks.length);
  const longest = Math.max(0, ...lengths);
  const overLimit = lengths.filter((length) => length > CHUNK_TARGET_LENGTH).length;
  console.log(
    `Chunks: ${chunks.length}, средняя длина ${averageLength} символов, ` +
      `самый длинный ${longest}, длиннее ${CHUNK_TARGET_LENGTH}: ${overLimit}`,
  );
}

// fetch пишет просто «fetch failed», а настоящая причина (DNS, отказ соединения,
// прокси) лежит в error.cause — показываем её и подсказываем, что проверить.
function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  if (error.cause instanceof Error) {
    return (
      `${error.message} (${error.cause.message}). Модель скачивается с huggingface.co: ` +
      'проверьте доступ к сайту, а если нужен прокси — переменную HTTPS_PROXY.'
    );
  }
  return error.message;
}

main().catch((error: unknown) => {
  console.error(describeFailure(error));
  process.exitCode = 1;
});
