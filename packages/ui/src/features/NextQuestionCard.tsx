// Диалог в одной сессии (этап 6.1): ответ отдан, сессия ждёт следующего вопроса. История
// остаётся — следующий ход отправит модели и прошлые вопросы, и результаты тулов.

import { useState, type FormEvent, type ReactElement } from 'react';
import { askNextQuestion, finishSession } from '../api/serverApi';
import { Button } from '../components/Button';
import styles from './NextQuestionCard.module.css';

interface NextQuestionCardProps {
  sessionId: string;
  // Сколько ходов уже было.
  turn: number;
}

export function NextQuestionCard({ sessionId, turn }: NextQuestionCardProps): ReactElement {
  const [text, setText] = useState('');
  const { error, sending, send } = useSend(() => {
    setText('');
  });
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (text.trim() !== '') {
      send(() => askNextQuestion(sessionId, text.trim()));
    }
  };
  return (
    <form className={styles.card} onSubmit={submit} aria-live="polite">
      <div className={styles.kicker}>Ход {turn} закончен — можно спросить ещё</div>
      <p className={styles.note}>
        История диалога остаётся: модель получит и прошлые вопросы, и ответы, и результаты тулов.
        Поэтому каждый следующий запрос к модели длиннее предыдущего.
      </p>
      <label className={styles.label} htmlFor="next-question">
        Следующий вопрос
      </label>
      <textarea
        id="next-question"
        className={styles.input}
        value={text}
        rows={2}
        placeholder="Например: а что с гибридным графиком?"
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      {error !== null && <div className={styles.error}>Не отправилось: {error}</div>}
      <div className={styles.buttons}>
        <Button type="submit" variant="accent" disabled={sending || text.trim() === ''}>
          Спросить
        </Button>
        <Button
          type="button"
          variant="quiet"
          disabled={sending}
          onClick={() => {
            send(() => finishSession(sessionId));
          }}
        >
          Закончить сессию
        </Button>
      </div>
    </form>
  );
}

// Отправка на сервер: пока идёт — кнопки выключены, ошибка — под полем.
function useSend(onDone: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const send = (action: () => Promise<void>): void => {
    setSending(true);
    action()
      .then(() => {
        setError(null);
        onDone();
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        setSending(false);
      });
  };
  return { error, sending, send };
}
