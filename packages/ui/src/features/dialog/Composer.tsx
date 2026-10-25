// Поле ввода внизу колонки «Диалог»: всегда на месте. Пока агент отвечает, вопрос можно
// набрать заранее, а отправить — когда сессия ждёт вопроса. В записи поля нет: спросить
// можно только в новой сессии.

import { useState, type FormEvent, type ReactElement } from 'react';
import { askNextQuestion, finishSession } from '../../api/serverApi';
import { Button } from '../../components/Button';
import styles from './Dialog.module.css';

export type DialogMode = 'record' | 'ended' | 'working' | 'awaiting';

interface ComposerProps {
  mode: DialogMode;
  sessionId: string | null;
}

export function Composer({ mode, sessionId }: ComposerProps): ReactElement {
  const [text, setText] = useState('');
  const { error, sending, send } = useSend();
  if (mode === 'record' || mode === 'ended' || sessionId === null) {
    return <div className={styles.note}>{NOTES[mode]}</div>;
  }
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const question = text.trim();
    if (mode === 'awaiting' && question !== '') {
      send(
        () => askNextQuestion(sessionId, question),
        () => {
          setText('');
        },
      );
    }
  };
  return (
    <form className={styles.composer} onSubmit={submit}>
      <label className={styles.label} htmlFor="dialog-question">
        Следующий вопрос — в эту же сессию: модель получит и прошлые вопросы
      </label>
      <textarea
        id="dialog-question"
        className={styles.input}
        value={text}
        rows={3}
        placeholder="Например: а что с гибридным графиком?"
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      {error !== null && <div className={styles.error}>Не отправилось: {error}</div>}
      <ComposerActions
        mode={mode}
        sending={sending}
        canAsk={mode === 'awaiting' && text.trim() !== ''}
        onFinish={() => {
          send(() => finishSession(sessionId));
        }}
      />
    </form>
  );
}

interface ComposerActionsProps {
  mode: 'working' | 'awaiting';
  sending: boolean;
  canAsk: boolean;
  onFinish: () => void;
}

function ComposerActions({ mode, sending, canAsk, onFinish }: ComposerActionsProps): ReactElement {
  return (
    <div className={styles.row}>
      <span className={styles.hint}>
        {mode === 'working'
          ? 'Агент отвечает — вопрос можно набрать заранее'
          : 'Сессия ждёт вопроса'}
      </span>
      {mode === 'awaiting' && (
        <Button type="button" variant="quiet" disabled={sending} onClick={onFinish}>
          Закончить
        </Button>
      )}
      <Button type="submit" variant="accent" disabled={sending || !canAsk}>
        Спросить
      </Button>
    </div>
  );
}

const NOTES: Record<'record' | 'ended' | 'working' | 'awaiting', string> = {
  record: 'Это запись: реплики появляются по ходу плеера. Задать вопрос можно в новой сессии.',
  ended: 'Сессия закончена, трейс записан. Задать вопрос можно в новой сессии.',
  working: '',
  awaiting: '',
};

// Отправка на сервер: пока идёт — кнопки выключены, ошибка — под полем.
function useSend() {
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const send = (action: () => Promise<void>, onDone?: () => void): void => {
    setSending(true);
    action()
      .then(() => {
        setError(null);
        onDone?.();
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
