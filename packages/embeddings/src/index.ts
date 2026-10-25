// Пакет эмбеддингов: модель, кэш векторов, сходство и пути к кэшу.

export { EMBEDDING_MODEL_DIRECTORY, EMBEDDINGS_CACHE_DIRECTORY } from './embeddingPaths.js';
export {
  EMBEDDING_MODEL_DTYPE,
  EMBEDDING_MODEL_ID,
  ModelMissingError,
  TextEmbedder,
  type EmbedderOptions,
} from './TextEmbedder.js';
export {
  hashPassage,
  readVectorCache,
  writeVectorCache,
  type CachedVectors,
} from './vectorCache.js';
export { cosineSimilarity } from './vectorSimilarity.js';
// Ход скачивания модели — для команды pnpm rag-index.
export type { ProgressInfo } from '@huggingface/transformers';
