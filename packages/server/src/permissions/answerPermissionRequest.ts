// Тело ответа на запрос разрешения: POST /api/sessions/:sessionId/permissions.

import { z } from 'zod';

export const answerPermissionRequestSchema = z.object({
  toolCallId: z.string().min(1),
  approved: z.boolean(),
});

export type AnswerPermissionRequest = z.infer<typeof answerPermissionRequestSchema>;
