// Вход пакета для лаборатории RAG (сервер интерфейса, этап 8b): import from
// '@harness-visualization/mcp-server/lab'. Сам MCP-сервер запускается из dist/main.js, как раньше.

export {
  KnowledgeBaseLab,
  type LabBase,
  type LabChunk,
  type LabDocument,
  type LabQuestion,
  type LabSearch,
} from './KnowledgeBaseLab.js';
export type { RankedDocument } from '../hybridSearch/fuseByReciprocalRank.js';
