// Кэш векторов на диске. Считать эмбеддинги всех фрагментов — от нескольких секунд
// до минуты, а документы меняются редко. Вектор берётся из кэша, только если совпали
// модель и текст, который ей отправляется (сверяем по хешу SHA-256). Изменился
// документ — пересчитываются только его изменившиеся фрагменты.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { EMBEDDING_MODEL_DTYPE, EMBEDDING_MODEL_ID } from './TextEmbedder.js';

const vectorCacheSchema = z.object({
  model: z.string(),
  dtype: z.string(),
  // Хеш текста → вектор.
  vectors: z.record(z.string(), z.array(z.number())),
});

export type CachedVectors = Map<string, number[]>;

export function hashPassage(passage: string): string {
  return createHash('sha256').update(passage).digest('hex');
}

// Нет файла, файл испорчен или посчитан другой моделью — кэш пуст, всё посчитаем заново.
export async function readVectorCache(cachePath: string): Promise<CachedVectors> {
  let fileText: string;
  try {
    fileText = await readFile(cachePath, 'utf8');
  } catch {
    return new Map();
  }
  const validation = vectorCacheSchema.safeParse(parseJsonSafely(fileText));
  if (!validation.success) {
    return new Map();
  }
  const cache = validation.data;
  if (cache.model !== EMBEDDING_MODEL_ID || cache.dtype !== EMBEDDING_MODEL_DTYPE) {
    return new Map();
  }
  return new Map(Object.entries(cache.vectors));
}

export async function writeVectorCache(cachePath: string, vectors: CachedVectors): Promise<void> {
  const cache: z.infer<typeof vectorCacheSchema> = {
    model: EMBEDDING_MODEL_ID,
    dtype: EMBEDDING_MODEL_DTYPE,
    vectors: Object.fromEntries(vectors),
  };
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache), 'utf8');
}

function parseJsonSafely(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
