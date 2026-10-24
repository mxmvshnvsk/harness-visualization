// Локальная модель эмбеддингов: текст → вектор из 384 чисел.
// Модель — Xenova/multilingual-e5-small, ONNX-версия intfloat/multilingual-e5-small
// (https://huggingface.co/intfloat/multilingual-e5-small, лицензия MIT), запускается
// библиотекой transformers.js (https://github.com/huggingface/transformers.js).
//
// Модель e5 обучена с префиксами: вопрос начинается с «query: », текст, среди которого
// ищут, — с «passage: ». Без префиксов качество поиска падает — это требование модели.

import {
  env,
  ModelFileNotFoundError,
  pipeline,
  type FeatureExtractionPipeline,
  type ProgressCallback,
} from '@huggingface/transformers';

export const EMBEDDING_MODEL_ID = 'Xenova/multilingual-e5-small';
// q8 — веса, сжатые до 8 бит: файл модели около 120 МБ вместо 470 МБ, качество почти то же.
export const EMBEDDING_MODEL_DTYPE = 'q8';

// Уровень журнала ONNX Runtime: 3 — только ошибки. Иначе каждый запуск сервера
// сыпал бы в журнал технические предупреждения об оптимизации графа модели.
const ONNX_LOG_LEVEL_ERROR = 3;

export interface EmbedderOptions {
  // Папка, где лежит модель (и куда она скачивается).
  modelDirectory: string;
  // Можно ли скачать модель, если её нет в папке. MCP-сервер не скачивает — только pnpm rag-index.
  allowDownload: boolean;
  onLoadProgress?: ProgressCallback;
}

export class ModelMissingError extends Error {
  constructor(modelDirectory: string) {
    super(
      `Модель эмбеддингов ${EMBEDDING_MODEL_ID} не найдена в ${modelDirectory}. ` +
        'Скачайте её командой pnpm rag-index в корне проекта.',
    );
    this.name = 'ModelMissingError';
  }
}

export class TextEmbedder {
  private readonly extractor: FeatureExtractionPipeline;

  private constructor(extractor: FeatureExtractionPipeline) {
    this.extractor = extractor;
  }

  static async load(options: EmbedderOptions): Promise<TextEmbedder> {
    configureModelStorage(options);
    try {
      const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL_ID, {
        dtype: EMBEDDING_MODEL_DTYPE,
        session_options: { logSeverityLevel: ONNX_LOG_LEVEL_ERROR },
        progress_callback: options.onLoadProgress,
      });
      return new TextEmbedder(extractor);
    } catch (error) {
      if (error instanceof ModelFileNotFoundError) {
        throw new ModelMissingError(options.modelDirectory);
      }
      throw error;
    }
  }

  async embedQuery(query: string): Promise<number[]> {
    const [vector] = await this.embed([`query: ${query}`]);
    if (vector === undefined) {
      throw new Error('Модель эмбеддингов не вернула вектор запроса');
    }
    return vector;
  }

  async embedPassages(passages: string[]): Promise<number[][]> {
    return this.embed(passages.map((passage) => `passage: ${passage}`));
  }

  // Вектор текста — среднее векторов его токенов, нормализованное до длины 1,
  // как советуют авторы e5. У векторов длины 1 косинусное сходство равно
  // скалярному произведению — его и считает поиск.
  private async embed(texts: string[]): Promise<number[][]> {
    const tensor = await this.extractor(texts, { pooling: 'mean', normalize: true });
    return tensor.tolist() as number[][];
  }
}

// Модель хранится в папке пакета, а не внутри node_modules, как по умолчанию:
// так она переживает переустановку зависимостей и лежит рядом с кэшем векторов.
// Скачанный файл и «локальная модель» для transformers.js — одна и та же папка.
function configureModelStorage(options: EmbedderOptions): void {
  env.cacheDir = options.modelDirectory;
  env.localModelPath = options.modelDirectory;
  env.allowLocalModels = true;
  env.allowRemoteModels = options.allowDownload;
}
