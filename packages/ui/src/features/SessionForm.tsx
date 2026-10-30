// Запуск новой сессии — по мокапу, одобренному автором: вопрос, что включить (галочками), кто ищет
// в базе знаний, effort. Значения — из harness.config.json, последний выбор запоминается в браузере.

import { useState, type FormEvent, type ReactElement } from 'react';
import { startSession } from '../api/serverApi';
import { Button } from '../components/Button';
import { toStartRequest, useSessionChoices, selectedSessionModel } from './session/sessionChoices';
import styles from './SessionForm.module.css';
import { SessionSettings, describeCost } from './session/SessionSettings';

// Поле вопроса: в него ставит курсор «Спросить агента самому» на стартовом экране.
export const QUESTION_FIELD_ID = 'session-question';

interface SessionFormProps {
  onStarted: (sessionId: string) => void;
}

export function SessionForm({ onStarted }: SessionFormProps): ReactElement {
  const [question, setQuestion] = useState('');
  const state = useSessionChoices();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const selectedModel = selectedSessionModel(state);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setStarting(true);
    startSession(toStartRequest(question, state.choices))
      .then((response) => {
        setError(null);
        state.change({ cleanWorkspace: false });
        onStarted(response.sessionId);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        setStarting(false);
      });
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <textarea
        id={QUESTION_FIELD_ID}
        className={styles.question}
        aria-label="Вопрос агенту"
        value={question}
        required
        placeholder="Вопрос агенту — например: удалёнка"
        onChange={(event) => {
          setQuestion(event.target.value);
        }}
      />
      <SessionSettings state={state} />
      {state.modelNotice !== null && (
        <p className={styles.note} role="status">
          {state.modelNotice}
        </p>
      )}
      {selectedModel?.available === false && (
        <p className={styles.error}>
          Нет ключа {selectedModel.apiKeyVariable}. Выберите другую модель или задайте ключ на
          сервере.
        </p>
      )}
      {error !== null && <div className={styles.error}>Сессия не запущена: {error}</div>}
      <SessionSubmit
        state={state}
        starting={starting}
        unavailable={selectedModel?.available === false}
      />
    </form>
  );
}

function SessionSubmit({
  state,
  starting,
  unavailable,
}: {
  state: ReturnType<typeof useSessionChoices>;
  starting: boolean;
  unavailable: boolean;
}): ReactElement {
  return (
    <div className={styles.foot}>
      <span className={styles.cost}>{describeCost(state)}</span>
      <Button type="submit" variant="accent" disabled={starting || unavailable}>
        {starting ? 'Запускаю…' : 'Запустить'}
      </Button>
    </div>
  );
}
