import { describe, expect, it } from 'vitest';
import { workEnd, workMs } from './workTime';

const at = (type: string, seconds: number) => ({
  type,
  timestamp: new Date(Date.UTC(2026, 9, 26, 6, 0, 0) + seconds * 1000).toISOString(),
});

describe('время работы', () => {
  // Как в трейсе 7358c31d: ответ на 91,6 с, сессию закрыли на 224,5 с.
  const answered = [
    at('session_started', 0),
    at('user_message', 0.3),
    at('model_response', 80),
    at('awaiting_question', 91.6),
    at('mcp_server_stopped', 224.5),
    at('session_finished', 224.5),
  ];

  it('простой после ответа — не работа', () => {
    expect(workMs(answered)).toBe(91_600);
    expect(workEnd(answered)?.type).toBe('awaiting_question');
  });

  it('простой между вопросами вычитается, второй вопрос считается', () => {
    const twoQuestions = [
      ...answered.slice(0, 4),
      at('user_message', 150),
      at('model_response', 160),
      at('awaiting_question', 170),
    ];
    expect(workMs(twoQuestions)).toBe(91_600 + 20_000);
    expect(workEnd(twoQuestions)?.timestamp).toBe(at('', 170).timestamp);
  });

  it('сессия ещё работает — до последнего события', () => {
    const running = answered.slice(0, 3);
    expect(workMs(running)).toBe(80_000);
    expect(workEnd(running)?.type).toBe('model_response');
  });
});
