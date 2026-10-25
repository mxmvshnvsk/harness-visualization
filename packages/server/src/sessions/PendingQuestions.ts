// Следующий вопрос диалога, которого ждёт сессия (этап 6.1). Харнесс после ответа вызывает
// nextQuestion и ждёт промис; браузер видит awaiting_question и присылает вопрос
// POST /api/sessions/:sessionId/messages или заканчивает сессию POST …/finish.
// Нет ни того, ни другого до срока — сессия заканчивается сама: закрытая вкладка
// не должна держать её открытой вечно.

export type QuestionOutcome = 'answered' | 'notPending';

export interface PendingQuestionSummary {
  // Какой ход закончился.
  turn: number;
  // Когда сессия закончится сама, если вопроса не будет.
  expiresAt: string;
}

interface PendingEntry {
  summary: PendingQuestionSummary;
  resolve: (question: string | null) => void;
  timer: NodeJS.Timeout;
}

export class PendingQuestions {
  private readonly pending = new Map<string, PendingEntry>();

  constructor(private readonly timeoutMs: number) {}

  ask(sessionId: string, turn: number): Promise<string | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(sessionId);
        resolve(null);
      }, this.timeoutMs);
      this.pending.set(sessionId, {
        summary: { turn, expiresAt: new Date(Date.now() + this.timeoutMs).toISOString() },
        resolve,
        timer,
      });
    });
  }

  // text — следующий вопрос; null — закончить сессию.
  answer(sessionId: string, text: string | null): QuestionOutcome {
    const entry = this.pending.get(sessionId);
    if (entry === undefined) {
      return 'notPending';
    }
    clearTimeout(entry.timer);
    this.pending.delete(sessionId);
    entry.resolve(text);
    return 'answered';
  }

  forSession(sessionId: string): PendingQuestionSummary | null {
    const entry = this.pending.get(sessionId);
    return entry === undefined ? null : { ...entry.summary };
  }

  // При остановке сервера: закончить все диалоги, чтобы сессии дописали трейсы.
  endAll(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.resolve(null);
    }
    this.pending.clear();
  }
}
