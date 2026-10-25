// Индекс для поиска по смыслу. MCP-сервер строит его в фоне после старта: загрузка
// модели и векторов занимает секунды, и рукопожатие MCP не должно их ждать.
// Если поиск попросят раньше, вызов тула дождётся построения.
// Не получилось построить (например, модель не скачана) — следующий поиск попробует снова:
// пользователь может запустить pnpm rag-index, не перезапуская сессию.

import type { KnowledgeDocument } from '../knowledgeBase/documentTypes.js';
import type { IndexedChunk } from './documentChunk.js';
import { embedChunks } from './embedChunks.js';
import { rankChunks, type SemanticHit } from './rankChunks.js';
import { TextEmbedder } from '@harness-visualization/embeddings';

export interface SemanticIndexOptions {
  documents: KnowledgeDocument[];
  modelDirectory: string;
  vectorCachePath: string;
  // Куда писать ход построения. У MCP-сервера это stderr — харнесс видит его как журнал сервера.
  log: (message: string) => void;
}

export interface ReadyIndex {
  embedder: TextEmbedder;
  chunks: IndexedChunk[];
}

export class SemanticIndex {
  private readonly options: SemanticIndexOptions;
  private building: Promise<ReadyIndex> | null = null;

  constructor(options: SemanticIndexOptions) {
    this.options = options;
  }

  startBuilding(): void {
    this.whenReady().catch(() => {
      // Ошибка уже записана в журнал, а следующий поиск попробует построить индекс снова.
    });
  }

  async search(query: string, limit: number): Promise<SemanticHit[]> {
    const index = await this.whenReady();
    const queryVector = await index.embedder.embedQuery(query);
    return rankChunks(index.chunks, queryVector, limit);
  }

  // Готовый индекс: модель и фрагменты с векторами. Нужен лаборатории RAG (lab/), чтобы
  // показывать ровно те фрагменты и векторы, по которым ищет сервер.
  ready(): Promise<ReadyIndex> {
    return this.whenReady();
  }

  private whenReady(): Promise<ReadyIndex> {
    if (this.building === null) {
      this.building = this.buildAndReport();
    }
    return this.building;
  }

  private async buildAndReport(): Promise<ReadyIndex> {
    try {
      return await this.build();
    } catch (error) {
      this.building = null;
      const reason = error instanceof Error ? error.message : String(error);
      this.options.log(`Semantic search index не построен: ${reason}`);
      throw error;
    }
  }

  private async build(): Promise<ReadyIndex> {
    const { log } = this.options;
    const startedAt = performance.now();
    log('Semantic search index: загрузка embedding model');
    const embedder = await TextEmbedder.load({
      modelDirectory: this.options.modelDirectory,
      allowDownload: false,
    });
    const result = await embedChunks({
      documents: this.options.documents,
      embedder,
      vectorCachePath: this.options.vectorCachePath,
      onProgress: (embeddedCount, totalToEmbed) => {
        log(`Semantic search index: embeddings ${embeddedCount} из ${totalToEmbed}`);
      },
    });
    const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
    log(
      `Semantic search index готов за ${seconds} с: ${result.chunks.length} chunks, ` +
        `из кэша ${result.reusedCount}, посчитано ${result.embeddedCount}`,
    );
    return { embedder, chunks: result.chunks };
  }
}
