// Вопросы о разрешении, которые ждут ответа из браузера. Харнесс спрашивает через confirmAction
// и ждёт промис; браузер видит permission_requested в потоке событий и отвечает
// POST /api/sessions/:sessionId/permissions. Если ответа нет до срока, действие запрещается —
// молчание не согласие, а сессия не должна висеть вечно из-за закрытой вкладки.
//
// Харнесс выполняет тулы по одному, поэтому у сессии ждёт не больше одного вопроса;
// но ищем всё равно по toolCallId — чтобы опоздавший ответ не попал в чужой вопрос.

import type { ConfirmationRequest, PermissionAnswer } from '@harness-visualization/harness';

export interface PendingPermissionSummary {
  toolCallId: string;
  toolName: string;
  actionDescription: string;
  // Когда вопрос закроется отказом сам — чтобы интерфейс показал обратный отсчёт.
  expiresAt: string;
}

export type AnswerOutcome = 'answered' | 'notPending';

interface PendingEntry {
  summary: PendingPermissionSummary;
  resolve: (answer: PermissionAnswer) => void;
  timer: NodeJS.Timeout;
}

export class PendingPermissions {
  private readonly pending = new Map<string, PendingEntry>();

  constructor(private readonly timeoutMs: number) {}

  ask(sessionId: string, request: ConfirmationRequest): Promise<PermissionAnswer> {
    return new Promise((resolve) => {
      const key = pendingKey(sessionId, request.toolCallId);
      const timer = setTimeout(() => {
        this.pending.delete(key);
        resolve({ approved: false, answeredBy: 'timeout' });
      }, this.timeoutMs);
      this.pending.set(key, {
        summary: {
          toolCallId: request.toolCallId,
          toolName: request.toolName,
          actionDescription: request.actionDescription,
          expiresAt: new Date(Date.now() + this.timeoutMs).toISOString(),
        },
        resolve,
        timer,
      });
    });
  }

  // notPending — такого вопроса нет: уже ответили, истёк срок или toolCallId чужой.
  answer(sessionId: string, toolCallId: string, approved: boolean): AnswerOutcome {
    const key = pendingKey(sessionId, toolCallId);
    const entry = this.pending.get(key);
    if (entry === undefined) {
      return 'notPending';
    }
    clearTimeout(entry.timer);
    this.pending.delete(key);
    entry.resolve({ approved, answeredBy: 'user' });
    return 'answered';
  }

  forSession(sessionId: string): PendingPermissionSummary[] {
    const prefix = pendingKey(sessionId, '');
    return [...this.pending.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, entry]) => ({ ...entry.summary }));
  }

  // При остановке сервера: отказать во всём, что ждёт, чтобы сессии дописали трейсы.
  denyAll(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.resolve({ approved: false, answeredBy: 'noOneToAsk' });
    }
    this.pending.clear();
  }
}

function pendingKey(sessionId: string, toolCallId: string): string {
  return `${sessionId}/${toolCallId}`;
}
