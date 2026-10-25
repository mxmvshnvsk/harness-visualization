// Запуск новой сессии. Всё, кроме вопроса, необязательно: пусто — значит «из harness.config.json».

import type { StartSessionRequest } from '@harness-visualization/server';
import { useState, type FormEvent, type ReactElement } from 'react';
import { startSession } from '../api/serverApi';
import { Button } from '../components/Button';
import styles from './SessionForm.module.css';

const RETRIEVAL_MODES = [
  { value: '', label: 'из настроек' },
  { value: 'tool', label: 'tool — ищет модель' },
  { value: 'auto', label: 'auto — ищет харнесс' },
  { value: 'rewrite', label: 'rewrite — харнесс по query от модели' },
] as const;

const REASONING_EFFORTS = ['', 'off', 'low', 'high', 'max'] as const;

interface SessionFormProps {
  onStarted: (sessionId: string) => void;
}

export function SessionForm({ onStarted }: SessionFormProps): ReactElement {
  const [question, setQuestion] = useState('');
  const [retrievalMode, setRetrievalMode] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState('');
  const [freshWorkspace, setFreshWorkspace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const request = buildRequest(question, retrievalMode, reasoningEffort, freshWorkspace);
    setStarting(true);
    startSession(request)
      .then((response) => {
        setError(null);
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
      <label className={styles.field}>
        <span className={styles.label}>Вопрос агенту</span>
        <textarea
          className={styles.question}
          value={question}
          required
          placeholder="Например: удалёнка"
          onChange={(event) => {
            setQuestion(event.target.value);
          }}
        />
      </label>
      <SessionOptions
        retrievalMode={retrievalMode}
        reasoningEffort={reasoningEffort}
        freshWorkspace={freshWorkspace}
        onRetrievalMode={setRetrievalMode}
        onReasoningEffort={setReasoningEffort}
        onFreshWorkspace={setFreshWorkspace}
      />
      {error !== null && <div className={styles.error}>Сессия не запущена: {error}</div>}
      <Button type="submit" variant="accent" disabled={starting}>
        {starting ? 'Запускаю…' : 'Запустить'}
      </Button>
    </form>
  );
}

interface SessionOptionsProps {
  retrievalMode: string;
  reasoningEffort: string;
  freshWorkspace: boolean;
  onRetrievalMode: (value: string) => void;
  onReasoningEffort: (value: string) => void;
  onFreshWorkspace: (value: boolean) => void;
}

function SessionOptions(props: SessionOptionsProps): ReactElement {
  const { retrievalMode, reasoningEffort, freshWorkspace } = props;
  const { onRetrievalMode, onReasoningEffort, onFreshWorkspace } = props;
  return (
    <>
      <div className={styles.options}>
        <label className={styles.field}>
          <span className={styles.label}>Retrieval</span>
          <select
            className={styles.select}
            value={retrievalMode}
            onChange={(event) => {
              onRetrievalMode(event.target.value);
            }}
          >
            {RETRIEVAL_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Reasoning effort</span>
          <select
            className={styles.select}
            value={reasoningEffort}
            onChange={(event) => {
              onReasoningEffort(event.target.value);
            }}
          >
            {REASONING_EFFORTS.map((effort) => (
              <option key={effort} value={effort}>
                {effort === '' ? 'из настроек' : effort}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={freshWorkspace}
          onChange={(event) => {
            onFreshWorkspace(event.target.checked);
          }}
        />
        пересоздать workspace из примеров
      </label>
    </>
  );
}

function buildRequest(
  question: string,
  retrievalMode: string,
  reasoningEffort: string,
  freshWorkspace: boolean,
): StartSessionRequest {
  // Значения списков совпадают с допустимыми на сервере; сервер всё равно проверит их сам (zod).
  return {
    question,
    ...(retrievalMode === ''
      ? {}
      : { retrievalMode: retrievalMode as StartSessionRequest['retrievalMode'] }),
    ...(reasoningEffort === ''
      ? {}
      : { reasoningEffort: reasoningEffort as StartSessionRequest['reasoningEffort'] }),
    ...(freshWorkspace ? { freshWorkspace } : {}),
  };
}
