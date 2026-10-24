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

export const harnessSettingsSchema = z.object({
  model: modelSettingsSchema,
  agent: agentSettingsSchema,
  workspace: workspaceSettingsSchema,
  prices: z.record(z.string(), modelPricesSchema).default({}),
  traces: tracesSettingsSchema,
});

export type HarnessSettings = z.infer<typeof harnessSettingsSchema>;
export type ModelSettings = z.infer<typeof modelSettingsSchema>;
export type ReasoningStyle = ModelSettings['reasoningStyle'];
export type ModelPrices = z.infer<typeof modelPricesSchema>;
export type Tariff = z.infer<typeof tariffSchema>;
export type Weekday = z.infer<typeof weekdaySchema>;
