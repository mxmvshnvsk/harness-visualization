// Где лежат модель эмбеддингов и кэши векторов: в корне проекта, в .cache/embeddings.
// Ими пользуются и MCP-сервер, и харнесс, поэтому кэш не принадлежит ни одному пакету.
// Код собирается в packages/embeddings/dist — пути считаются от этой папки.

import { fileURLToPath } from 'node:url';

export const EMBEDDINGS_CACHE_DIRECTORY = fileURLToPath(
  new URL('../../../.cache/embeddings', import.meta.url),
);
// Модель скачивается сюда один раз командой pnpm rag-index.
export const EMBEDDING_MODEL_DIRECTORY = fileURLToPath(
  new URL('../../../.cache/embeddings/models', import.meta.url),
);
