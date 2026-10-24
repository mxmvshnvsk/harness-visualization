// Схема ответа OpenAI-совместимого API (/chat/completions).
// Поля названы так, как их присылает API, — в snake_case.
// Проверяем только то, что нам нужно; остальные поля сохраняются в трейсе как есть.

import { z } from 'zod';

const wireToolCallSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  function: z.object({
    name: z.string(),
    // Аргументы — строка с JSON, а не объект.
    arguments: z.string(),
  }),
});

const wireMessageSchema = z.object({
  role: z.string(),
  content: z.string().nullable().optional(),
  // Есть у моделей с рассуждениями, например у DeepSeek в режиме thinking.
  reasoning_content: z.string().nullable().optional(),
  tool_calls: z.array(wireToolCallSchema).nullish(),
});

const wireChoiceSchema = z.object({
  index: z.number(),
  finish_reason: z.string().nullable(),
  message: wireMessageSchema,
});

const wireUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number().optional(),
  // Поля кэша у DeepSeek.
  prompt_cache_hit_tokens: z.number().optional(),
  prompt_cache_miss_tokens: z.number().optional(),
  // Те же данные в формате OpenAI.
  prompt_tokens_details: z.object({ cached_tokens: z.number().optional() }).nullish(),
  completion_tokens_details: z.object({ reasoning_tokens: z.number().optional() }).nullish(),
});

export const wireChatCompletionSchema = z.object({
  id: z.string(),
  model: z.string(),
  choices: z.array(wireChoiceSchema).min(1),
  usage: wireUsageSchema,
});

// Так OpenAI-совместимые API описывают ошибку: { "error": { "message": "..." } }.
export const wireErrorSchema = z.object({
  error: z.object({ message: z.string() }),
});

export type WireChatCompletion = z.infer<typeof wireChatCompletionSchema>;
export type WireUsage = z.infer<typeof wireUsageSchema>;
export type WireToolCall = z.infer<typeof wireToolCallSchema>;
