// Лаборатория RAG (этап 8b): то же, чем ищет MCP-сервер, но наружу — для экрана интерфейса.
// Документы, их нарезка и векторы, три выдачи по своему запросу и векторы любых фраз.
// Код поиска — тот же, что у тулов сервера и у pnpm compare-search, поэтому лаборатория
// показывает настоящую работу поиска, а не её пересказ.
//
// Модель эмбеддингов грузится при первом запросе, который её требует, и остаётся в памяти.
// Не скачана — ошибка ModelMissingError из пакета embeddings: сервер ответит, как её скачать.

import { fuseByReciprocalRank, type RankedDocument } from '../hybridSearch/fuseByReciprocalRank.js';
import { loadKnowledgeBase } from '../knowledgeBase/loadKnowledgeBase.js';
import type { KnowledgeDocument } from '../knowledgeBase/documentTypes.js';
import { searchDocuments } from '../knowledgeBase/searchDocuments.js';
import { SEARCH_QUESTIONS, QUESTION_GROUP_TITLES } from '../searchComparison/searchQuestions.js';
import { rankChunks } from '../semanticSearch/rankChunks.js';
import { rankDocumentsByBestChunk } from '../semanticSearch/rankDocumentsByBestChunk.js';
import { CHUNK_TARGET_LENGTH } from '../semanticSearch/splitIntoChunks.js';
import { SemanticIndex, type ReadyIndex } from '../semanticSearch/SemanticIndex.js';
import { DATA_DIRECTORY, MODEL_DIRECTORY, VECTOR_CACHE_PATH } from '../serverPaths.js';
import { EMBEDDING_MODEL_ID } from '@harness-visualization/embeddings';
import { describeIndex, type LabIndex } from './describeIndex.js';

export interface LabDocument {
  id: string;
  title: string;
  type: string;
  date: string | null;
  tags: string[];
  chunks: LabChunk[];
}

export interface LabChunk {
  position: number;
  text: string;
  // Вектор, округлённый до 4 знаков: для карты и сходства точности хватает, а ответ в 2 раза меньше.
  vector: number[];
}

export interface LabQuestion {
  query: string;
  group: string;
  checks: string;
  expectedDocumentIds: string[];
}

export interface LabBase {
  model: string;
  chunkTargetLength: number;
  documents: LabDocument[];
  // Вопросы pnpm compare-search — готовые примеры с известными документами-ответами.
  questions: LabQuestion[];
}

export interface LabSearch {
  query: string;
  queryVector: number[];
  words: RankedDocument[];
  meaning: RankedDocument[];
  hybrid: RankedDocument[];
  // Сходство запроса с каждым фрагментом, от самого близкого.
  chunks: { documentId: string; position: number; similarity: number }[];
}

export class KnowledgeBaseLab {
  private readonly index: SemanticIndex;

  private constructor(private readonly documents: KnowledgeDocument[]) {
    this.index = new SemanticIndex({
      documents,
      modelDirectory: MODEL_DIRECTORY,
      vectorCachePath: VECTOR_CACHE_PATH,
      log: () => undefined,
    });
  }

  static async open(): Promise<KnowledgeBaseLab> {
    return new KnowledgeBaseLab(await loadKnowledgeBase(DATA_DIRECTORY));
  }

  async base(): Promise<LabBase> {
    const { chunks } = await this.index.ready();
    return {
      model: EMBEDDING_MODEL_ID,
      chunkTargetLength: CHUNK_TARGET_LENGTH,
      documents: this.documents.map((document) => ({
        id: document.id,
        title: document.title,
        type: document.type,
        date: document.date,
        tags: document.tags,
        chunks: chunks
          .filter((indexed) => indexed.chunk.document.id === document.id)
          .map((indexed) => ({
            position: indexed.chunk.position,
            text: indexed.chunk.text,
            vector: round(indexed.vector),
          })),
      })),
      questions: SEARCH_QUESTIONS.map((question) => ({
        query: question.query,
        group: QUESTION_GROUP_TITLES[question.group],
        checks: question.checks,
        expectedDocumentIds: question.expectedDocumentIds,
      })),
    };
  }

  // Три выдачи — как у rankWithAllMethods, плюс вектор запроса и сходство с каждым фрагментом.
  async search(query: string): Promise<LabSearch> {
    const index = await this.index.ready();
    const queryVector = await index.embedder.embedQuery(query);
    const hits = rankChunks(index.chunks, queryVector, Number.POSITIVE_INFINITY);
    const words = searchDocuments(this.documents, query, this.documents.length).map((hit) => ({
      documentId: hit.document.id,
      score: hit.score,
    }));
    const meaning = rankDocumentsByBestChunk(hits);
    return {
      query,
      queryVector: round(queryVector),
      words,
      meaning,
      hybrid: fuseByReciprocalRank([words, meaning]),
      chunks: hits.map((hit) => ({
        documentId: hit.indexed.chunk.document.id,
        position: hit.indexed.chunk.position,
        similarity: hit.similarity,
      })),
    };
  }

  // Векторы фраз — как у вопроса (префикс «query: »): для «двух фраз» и учебной карты.
  async embed(texts: readonly string[]): Promise<number[][]> {
    const index = await this.index.ready();
    return (await index.embedder.embedQueries([...texts])).map(round);
  }

  // Где живут векторы: файл индекса, запись из него, модель.
  async indexFile(): Promise<LabIndex> {
    return describeIndex((await this.index.ready()).chunks);
  }

  // Модель для проверки опоры ответа (сходство claims с увиденным) — та же, что у поиска.
  async embedder(): Promise<ReadyIndex['embedder']> {
    return (await this.index.ready()).embedder;
  }
}

function round(vector: number[]): number[] {
  return vector.map((value) => Math.round(value * 1e4) / 1e4);
}
