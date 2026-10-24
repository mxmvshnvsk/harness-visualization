// Схема файла harness.config.json.
// Zod проверяет файл при запуске и сразу даёт TypeScript-типы,
// поэтому ошибка в конфиге видна до первого запроса к модели.

import { z } from 'zod';
import { REASONING_EFFORTS } from '../model/chatTypes.js';

const modelSettingsSchema = z.object({
  // Человекочитаемое имя провайдера — только для отображения.
  providerName: z.string().min(1),
  baseUrl: z.url(),
  model: z.string().min(1),
  // Имя переменной окружения, в которой лежит ключ (или ссылка keychain:...).
  apiKeyVariable: z.string().min(1),
  requestTimeoutMs: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  // Как провайдер управляет рассуждениями: deepseek — параметры thinking и reasoning_effort,
  // none — провайдер не умеет регулировать рассуждения, уровень effort не передаётся.
  reasoningStyle: z.enum(['deepseek', 'none']).default('none'),
  defaultReasoningEffort: z.enum(REASONING_EFFORTS).default('high'),
  // Поля, которые понимает только конкретный провайдер.
  // Добавляются в тело запроса как есть.
  requestExtras: z.record(z.string(), z.unknown()).default({}),
});

const weekdaySchema = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

const hourRangeSchema = z.object({
  // Начало включительно, конец не включительно: { fromHour: 1, toHour: 4 } — это 01:00–03:59.
  fromHour: z.number().int().min(0).max(23),
  toHour: z.number().int().min(1).max(24),
});

const tariffScheduleSchema = z.object({
  weekdaysUtc: z.array(weekdaySchema).min(1),
  hoursUtc: z.array(hourRangeSchema).min(1),
});

const tariffSchema = z.object({
  name: z.string().min(1),
  inputCacheHitPerMillion: z.number().nonnegative(),
  inputCacheMissPerMillion: z.number().nonnegative(),
  outputPerMillion: z.number().nonnegative(),
  // Тариф без расписания действует всё остальное время.
  schedule: tariffScheduleSchema.optional(),
});

const modelPricesSchema = z.object({
  currency: z.string().min(1),
  // Цены меняются, поэтому храним, когда и где их проверили.
  checkedAt: z.string().min(1),
  source: z.url(),
  tariffs: z.array(tariffSchema).min(1),
});

const tracesSettingsSchema = z.object({
  directory: z.string().min(1),
});

const agentSettingsSchema = z.object({
  // Сколько раз подряд агент может обратиться к модели за один ход.
  // Защищает от бесконечного цикла, если модель зациклится на тулах.
  maxIterations: z.number().int().positive().default(10),
});

const workspaceSettingsSchema = z.object({
  // Песочница, в которой работают файловые тулы.
  directory: z.string().min(1),
  // Откуда взять файлы, если песочницы ещё нет.
  seedDirectory: z.string().min(1),
});

const webFetchSettingsSchema = z.object({
  requestTimeoutMs: z.number().int().positive(),
  // Больше этого страницу не скачиваем: огромные страницы не нужны модели и съедают память.
  maxDownloadBytes: z.number().int().positive(),
  // Столько символов текста страницы получит модель, остальное обрезается.
  maxCharacters: z.number().int().positive(),
  maxRedirects: z.number().int().min(0),
  // false — адреса локальной сети и localhost запрещены,
  // чтобы модель не добралась до сервисов на вашем компьютере и в вашей сети.
  allowPrivateNetwork: z.boolean(),
});

// Названия поисковых провайдеров, которые умеет харнесс.
export const SEARCH_PROVIDER_NAMES = ['tavily', 'yandex'] as const;

const tavilySettingsSchema = z.object({
  baseUrl: z.url(),
  // Имя переменной окружения с ключом. Если переменная пуста, провайдер недоступен.
  apiKeyVariable: z.string().min(1),
  requestTimeoutMs: z.number().int().positive(),
  // basic — 1 кредит Tavily за запрос, advanced — 2.
  searchDepth: z.enum(['basic', 'advanced', 'fast', 'ultra-fast']),
});

const yandexSearchPricesSchema = z.object({
  currency: z.string().min(1),
  // Цена за 1000 синхронных запросов: днём и ночью (00:00–08:00 по Москве).
  synchronousDayPerThousand: z.number().nonnegative(),
  synchronousNightPerThousand: z.number().nonnegative(),
  checkedAt: z.string().min(1),
  source: z.url(),
});

const yandexSearchSettingsSchema = z.object({
  baseUrl: z.url(),
  apiKeyVariable: z.string().min(1),
  // Каталог Yandex Cloud у каждого свой, поэтому его ID тоже берётся из .env.
  folderIdVariable: z.string().min(1),
  requestTimeoutMs: z.number().int().positive(),
  // Сегмент поиска: SEARCH_TYPE_RU — русскоязычный, SEARCH_TYPE_COM — международный.
  searchType: z.string().min(1),
  // Сколько фрагментов текста страницы вернуть для каждого результата (1–5).
  maxPassages: z.number().int().min(1).max(5),
  prices: yandexSearchPricesSchema,
});

const searchSettingsSchema = z.object({
  // Какой провайдер использовать по умолчанию; для одного запуска меняется флагом --search.
  provider: z.enum(SEARCH_PROVIDER_NAMES),
  defaultMaxResults: z.number().int().min(1).max(20),
  tavily: tavilySettingsSchema.optional(),
  yandex: yandexSearchSettingsSchema.optional(),
});

export const harnessSettingsSchema = z.object({
  model: modelSettingsSchema,
  agent: agentSettingsSchema,
  workspace: workspaceSettingsSchema,
  webFetch: webFetchSettingsSchema,
  // Если раздела нет, веб-поиска нет.
  search: searchSettingsSchema.optional(),
  prices: z.record(z.string(), modelPricesSchema).default({}),
  traces: tracesSettingsSchema,
});

export type HarnessSettings = z.infer<typeof harnessSettingsSchema>;
export type ModelSettings = z.infer<typeof modelSettingsSchema>;
export type ReasoningStyle = ModelSettings['reasoningStyle'];
export type ModelPrices = z.infer<typeof modelPricesSchema>;
export type Tariff = z.infer<typeof tariffSchema>;
export type Weekday = z.infer<typeof weekdaySchema>;
export type WebFetchSettings = z.infer<typeof webFetchSettingsSchema>;
export type SearchSettings = z.infer<typeof searchSettingsSchema>;
export type SearchProviderName = SearchSettings['provider'];
export type TavilySettings = z.infer<typeof tavilySettingsSchema>;
export type YandexSearchSettings = z.infer<typeof yandexSearchSettingsSchema>;
export type YandexSearchPrices = z.infer<typeof yandexSearchPricesSchema>;
