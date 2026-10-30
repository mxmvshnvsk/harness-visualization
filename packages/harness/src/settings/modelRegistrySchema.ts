// Общие настройки соединения можно вынести в providers; у модели — только отличия.
import { z } from 'zod';
import { REASONING_EFFORTS } from '../model/chatTypes.js';

export const modelDialectSchema = z.enum(['deepseek', 'openrouter', 'openai']);

const connectionFields = {
  providerName: z.string().min(1).optional(),
  baseUrl: z.url().optional(),
  apiKeyVariable: z.string().min(1).nullable().optional(),
  dialect: modelDialectSchema.optional(),
  requestTimeoutMs: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  stream: z.boolean().optional(),
  reasoningStyle: z.enum(['deepseek', 'openrouter', 'openai', 'none']).optional(),
  defaultReasoningEffort: z.enum(REASONING_EFFORTS).optional(),
  requestExtras: z.record(z.string(), z.unknown()).optional(),
  // Для некоторых OpenAI reasoning-моделей вместо max_tokens.
  outputTokenParameter: z.enum(['max_tokens', 'max_completion_tokens']).optional(),
};

export const registryProviderSchema = z.object({
  ...connectionFields,
  baseUrl: z.url(),
  apiKeyVariable: z.string().min(1).nullable(),
});

export const registryModelSchema = z.object({
  ...connectionFields,
  model: z.string().min(1),
  label: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  topLogprobs: z.number().int().min(0).max(20).optional(),
  prefixCompletionBaseUrl: z.url().nullable().optional(),
  capabilities: z
    .object({
      // Отсутствие значения — неизвестно, false — явно не поддерживается.
      reasoning: z.boolean().optional(),
      cache: z.boolean().optional(),
      logprobs: z.boolean().optional(),
      reasoningEfforts: z.array(z.enum(REASONING_EFFORTS)).min(1).optional(),
    })
    .optional(),
});

export type ModelDialect = z.infer<typeof modelDialectSchema>;
