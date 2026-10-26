// Время работы против времени, пока сессия открыта. После ответа (awaiting_question) сессия
// ждёт следующего вопроса — минуту или час, это не работа агента. В трейсе 7358c31d ответ
// готов на 91,6 с, а сессию закрыли на 224,5 с: 133 с простоя. Простой — от awaiting_question
// до следующего вопроса пользователя или до конца записи.

interface Timed {
  type: string;
  timestamp: string;
}

// Сколько времени шла работа: всё время записи без простоев между ответом и новым вопросом.
export function workMs(events: readonly Timed[]): number {
  const first = events.at(0);
  if (first === undefined) {
    return 0;
  }
  let total = 0;
  let from = Date.parse(first.timestamp);
  let idle = false;
  for (const event of events) {
    const at = Date.parse(event.timestamp);
    if (!idle) {
      total += at - from;
    }
    from = at;
    if (event.type === 'awaiting_question') {
      idle = true;
    } else if (event.type === 'user_message') {
      idle = false;
    }
  }
  return total;
}

// Когда кончилась последняя работа: хвост простоя после последнего ответа не считаем.
export function workEnd(events: readonly Timed[]): Timed | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === 'user_message') {
      return events.at(-1);
    }
    if (event?.type === 'awaiting_question') {
      return event;
    }
  }
  return events.at(-1);
}
