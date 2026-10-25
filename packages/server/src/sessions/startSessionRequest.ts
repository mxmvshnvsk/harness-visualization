// Тело запроса на запуск сессии: POST /api/sessions. Всё, кроме вопроса, необязательно —
// по умолчанию берётся из harness.config.json, как у pnpm chat без флагов.

import { REASONING_EFFORTS } from '@harness-visualization/harness';
import { z } from 'zod';

const RETRIEVAL_MODES = ['tool', 'auto', 'rewrite'] as const;
const SEARCH_PROVIDERS = ['tavily', 'yandex'] as const;

export const startSessionRequestSchema = z.object({
  question: z.string().trim().min(1),
  reasoningEffort: z.enum(REASONING_EFFORTS).optional(),
  retrievalMode: z.enum(RETRIEVAL_MODES).optional(),
  retrievalToolName: z.string().min(1).optional(),
  searchProvider: z.enum(SEARCH_PROVIDERS).optional(),
  freshWorkspace: z.boolean().optional(),
  // Дать ли модели субагентов (этап 6c); нет поля — как в harness.config.json.
  subagents: z.boolean().optional(),
});

export type StartSessionRequest = z.infer<typeof startSessionRequestSchema>;
