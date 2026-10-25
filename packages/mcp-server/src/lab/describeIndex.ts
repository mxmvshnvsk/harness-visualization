// Где живут векторы базы — для шага «Где живут векторы» лаборатории RAG: файл индекса,
// его размер, одна настоящая запись из него и файл модели эмбеддингов. Запись в файле —
// «SHA-256 от текста, отправленного модели → вектор»: связь с фрагментом сервер
// восстанавливает при запуске, заново нарезая документы и считая хеши (embedChunks.ts).

import { readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import {
  EMBEDDING_MODEL_DTYPE,
  EMBEDDING_MODEL_ID,
  EMBEDDINGS_CACHE_DIRECTORY,
  hashPassage,
} from '@harness-visualization/embeddings';
import type { IndexedChunk } from '../semanticSearch/documentChunk.js';
import { toPassage } from '../semanticSearch/embedChunks.js';
import { MODEL_DIRECTORY, VECTOR_CACHE_PATH } from '../serverPaths.js';

const SAMPLE_NUMBERS = 6;
const SAMPLE_TEXT = 160;

export interface LabIndex {
  // Пути — от корня проекта.
  file: string;
  bytes: number;
  model: string;
  dtype: string;
  vectorCount: number;
  dimensions: number;
  modelDirectory: string;
  modelBytes: number;
  documentCount: number;
  // Одна запись файла: ключ, начало вектора и чей это фрагмент.
  sample: {
    hash: string;
    vectorHead: number[];
    documentId: string;
    position: number;
    passageHead: string;
  } | null;
}

export async function describeIndex(chunks: readonly IndexedChunk[]): Promise<LabIndex> {
  const root = dirname(dirname(EMBEDDINGS_CACHE_DIRECTORY));
  const first = chunks[0];
  return {
    file: relative(root, VECTOR_CACHE_PATH),
    bytes: (await stat(VECTOR_CACHE_PATH)).size,
    model: EMBEDDING_MODEL_ID,
    dtype: EMBEDDING_MODEL_DTYPE,
    vectorCount: chunks.length,
    dimensions: first?.vector.length ?? 0,
    modelDirectory: relative(root, MODEL_DIRECTORY),
    modelBytes: await directorySize(MODEL_DIRECTORY),
    documentCount: new Set(chunks.map((indexed) => indexed.chunk.document.id)).size,
    sample:
      first === undefined
        ? null
        : {
            hash: hashPassage(toPassage(first.chunk)),
            vectorHead: first.vector.slice(0, SAMPLE_NUMBERS),
            documentId: first.chunk.document.id,
            position: first.chunk.position,
            passageHead: toPassage(first.chunk).slice(0, SAMPLE_TEXT),
          },
  };
}

async function directorySize(directory: string): Promise<number> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const sizes = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => (await stat(join(entry.parentPath, entry.name))).size),
  );
  return sizes.reduce((sum, size) => sum + size, 0);
}
