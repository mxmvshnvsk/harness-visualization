// Превращает документы базы знаний во фрагменты с векторами: нарезка, кэш, эмбеддинги.
// Общий код для команды pnpm rag-index и для фонового построения индекса в MCP-сервере.

import type { KnowledgeDocument } from '../knowledgeBase/documentTypes.js';
import type { DocumentChunk, IndexedChunk } from './documentChunk.js';
import { splitIntoChunks } from './splitIntoChunks.js';
import type { TextEmbedder } from './TextEmbedder.js';
import { hashPassage, readVectorCache, writeVectorCache } from './vectorCache.js';

// Сколько фрагментов отправлять в модель за раз: больше — быстрее, но дольше
// нет вестей о ходе работы.
const EMBEDDING_BATCH_SIZE = 16;

export interface EmbedChunksOptions {
  documents: KnowledgeDocument[];
  embedder: TextEmbedder;
  vectorCachePath: string;
  onProgress: (embeddedCount: number, totalToEmbed: number) => void;
}

export interface EmbedChunksResult {
  chunks: IndexedChunk[];
  reusedCount: number;
  embeddedCount: number;
}

interface PendingChunk {
  chunk: DocumentChunk;
  passageHash: string;
}

export async function embedChunks(options: EmbedChunksOptions): Promise<EmbedChunksResult> {
  const pending = options.documents.flatMap(splitIntoChunks).map((chunk) => ({
    chunk,
    passageHash: hashPassage(toPassage(chunk)),
  }));
  const cachedVectors = await readVectorCache(options.vectorCachePath);
  const missing = pending.filter((item) => !cachedVectors.has(item.passageHash));
  const freshVectors = await embedMissing(missing, options);

  const usedVectors = new Map<string, number[]>();
  const chunks = pending.map((item) => {
    const vector = freshVectors.get(item.passageHash) ?? cachedVectors.get(item.passageHash);
    if (vector === undefined) {
      throw new Error(
        `Нет вектора для фрагмента ${item.chunk.position} в ${item.chunk.document.id}`,
      );
    }
    usedVectors.set(item.passageHash, vector);
    return { chunk: item.chunk, vector };
  });
  // В кэш пишутся только векторы нынешних фрагментов: старые версии текста там не копятся.
  if (missing.length > 0 || usedVectors.size !== cachedVectors.size) {
    await writeVectorCache(options.vectorCachePath, usedVectors);
  }
  return {
    chunks,
    reusedCount: pending.length - missing.length,
    embeddedCount: missing.length,
  };
}

// Модели отправляется фрагмент вместе с названием документа: фраза «не более 14 дней»
// без слова «отпуск» из названия значила бы что угодно.
export function toPassage(chunk: DocumentChunk): string {
  return `${chunk.document.title}\n\n${chunk.text}`;
}

async function embedMissing(
  missing: PendingChunk[],
  options: EmbedChunksOptions,
): Promise<Map<string, number[]>> {
  const vectors = new Map<string, number[]>();
  for (let start = 0; start < missing.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = missing.slice(start, start + EMBEDDING_BATCH_SIZE);
    const batchVectors = await options.embedder.embedPassages(
      batch.map((item) => toPassage(item.chunk)),
    );
    batch.forEach((item, index) => {
      const vector = batchVectors[index];
      if (vector !== undefined) {
        vectors.set(item.passageHash, vector);
      }
    });
    options.onProgress(start + batch.length, missing.length);
  }
  return vectors;
}
