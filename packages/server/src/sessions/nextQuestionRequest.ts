// Тело следующего вопроса диалога: POST /api/sessions/:sessionId/messages.

import { z } from 'zod';

export const nextQuestionRequestSchema = z.object({
  text: z.string().trim().min(1).max(4000),
});
