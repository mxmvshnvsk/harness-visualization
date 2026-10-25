// Что можно открыть: сессии этого запуска сервера и записанные трейсы из traces/.

import type { SessionSummary, TraceSummary } from '@harness-visualization/server';
import type { ReactElement, ReactNode } from 'react';
import type { Selection } from '../app/useSelection';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { plural } from '../text/plural';
import styles from './SourceList.module.css';

interface SourceSectionProps {
  title: string;
  error: string | null;
  onReload: () => void;
  children: ReactNode;
}

function SourceSection({ title, error, onReload, children }: SourceSectionProps): ReactElement {
  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <Button onClick={onReload}>обновить</Button>
      </div>
      {error !== null && <div className={styles.error}>Не загрузилось: {error}</div>}
      <ul className={styles.list}>{children}</ul>
    </section>
  );
}

interface SessionListProps {
  sessions: SessionSummary[];
  error: string | null;
  selection: Selection | null;
  onReload: () => void;
  onSelect: (selection: Selection) => void;
}

export function SessionList(props: SessionListProps): ReactElement {
  const { sessions, selection, onSelect } = props;
  // Свежие сверху: сервер отдаёт в порядке запуска.
  const items = [...sessions].reverse();
  return (
    <SourceSection title="Сессии сервера" error={props.error} onReload={props.onReload}>
      {items.length === 0 && <li className={styles.empty}>Пока ни одной</li>}
      {items.map((session) => (
        <li key={session.sessionId}>
          <button
            type="button"
            className={styles.item}
            aria-current={
              selection?.kind === 'session' && selection.sessionId === session.sessionId
            }
            onClick={() => {
              onSelect({ kind: 'session', sessionId: session.sessionId });
            }}
          >
            <span className={styles.itemTitle}>{session.question}</span>
            <span className={styles.meta}>
              {session.sessionId} · {describeStatus(session.status)} ·{' '}
              {countEvents(session.eventCount)}
            </span>
          </button>
        </li>
      ))}
    </SourceSection>
  );
}

interface TraceListProps {
  traces: TraceSummary[];
  error: string | null;
  selection: Selection | null;
  onReload: () => void;
  onSelect: (selection: Selection) => void;
}

export function TraceList(props: TraceListProps): ReactElement {
  const { traces, selection, onSelect } = props;
  return (
    <SourceSection title="Трейсы" error={props.error} onReload={props.onReload}>
      {traces.map((trace) => (
        <li key={trace.file}>
          <button
            type="button"
            className={styles.item}
            aria-current={selection?.kind === 'trace' && selection.file === trace.file}
            onClick={() => {
              onSelect({ kind: 'trace', file: trace.file });
            }}
          >
            <span className={styles.itemTitle}>
              {trace.synthetic && <Badge tone="error">синтетический</Badge>}
              {trace.kind !== 'session' && <Badge tone="judge">{trace.kind}</Badge>}
              {trace.title ?? trace.file}
            </span>
            <span className={styles.meta}>
              {formatDate(trace.startedAt)} · {countEvents(trace.eventCount)} ·{' '}
              {describeTraceState(trace)}
            </span>
          </button>
        </li>
      ))}
    </SourceSection>
  );
}

export function countEvents(count: number): string {
  return plural(count, { one: 'событие', few: 'события', many: 'событий' });
}

function describeStatus(status: SessionSummary['status']): string {
  switch (status) {
    case 'running':
      return 'идёт';
    case 'finished':
      return 'закончилась';
    case 'failed':
      return 'с ошибкой';
  }
}

function describeTraceState(trace: TraceSummary): string {
  if (trace.hasError) {
    return 'с ошибкой';
  }
  return trace.finished ? 'дописан' : 'оборван';
}

function formatDate(value: string | null): string {
  return value === null ? '—' : new Date(value).toLocaleString('ru-RU');
}
