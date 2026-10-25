// Пути пакета. Код собирается в dist, поэтому data считается от этой папки.
// Модель эмбеддингов и кэш векторов — в .cache/embeddings в корне проекта (пакет embeddings):
// ими пользуется и харнесс. В git они не попадают.

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMBEDDING_MODEL_DIRECTORY,
  EMBEDDINGS_CACHE_DIRECTORY,
} from '@harness-visualization/embeddings';

export const DATA_DIRECTORY = fileURLToPath(new URL('../data', import.meta.url));
export const MODEL_DIRECTORY = EMBEDDING_MODEL_DIRECTORY;
// Векторы chunks базы знаний.
export const VECTOR_CACHE_PATH = join(EMBEDDINGS_CACHE_DIRECTORY, 'knowledgeBaseVectors.json');
