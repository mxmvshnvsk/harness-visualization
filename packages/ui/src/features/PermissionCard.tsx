// Вопрос о разрешении: что агент хочет сделать, сколько осталось до отказа по тайм-ауту,
// и две кнопки. Ответ уходит обычным POST; что решено — придёт в потоке (permission_resolved).

import type { PendingPermissionSummary } from '@harness-visualization/server';
import { useEffect, useState, type ReactElement } from 'react';
import { answerPermission } from '../api/serverApi';
import { Button } from '../components/Button';
import styles from './PermissionCard.module.css';

interface PermissionCardProps {
  sessionId: string;
  pending: PendingPermissionSummary;
  // Когда вопрос задан: от этого момента считаем долю оставшегося времени.
  askedAt: string;
}

export function PermissionCard({ sessionId, pending, askedAt }: PermissionCardProps): ReactElement {
  const now = useNow();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const expiresAt = Date.parse(pending.expiresAt);
  const total = Math.max(1, expiresAt - Date.parse(askedAt));
  const left = Math.max(0, expiresAt - now);

  const answer = (approved: boolean): void => {
    setSending(true);
    answerPermission(sessionId, pending.toolCallId, approved)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        setSending(false);
      });
  };

  return (
    <section className={styles.card} aria-live="polite">
      <div className={styles.kicker}>Нужно разрешение</div>
      <div className={styles.action}>{pending.actionDescription}</div>
      <div className={styles.tool}>{pending.toolName}</div>
      <div className={styles.track} aria-hidden="true">
        <div className={styles.left} style={{ width: `${String((left / total) * 100)}%` }} />
      </div>
      <div className={styles.note}>
        Без ответа через {Math.round(left / 1000)} с действие будет запрещено (answeredBy: timeout)
      </div>
      {error !== null && <div className={styles.error}>Ответ не принят: {error}</div>}
      <div className={styles.buttons}>
        <Button
          variant="ink"
          disabled={sending}
          onClick={() => {
            answer(true);
          }}
        >
          Разрешить
        </Button>
        <Button
          variant="danger"
          disabled={sending}
          onClick={() => {
            answer(false);
          }}
        >
          Отказать
        </Button>
      </div>
    </section>
  );
}

// Текущее время, обновляется раз в секунду — для обратного отсчёта.
function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
}
