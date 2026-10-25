// Шапка открытого потока: что открыто и в каком он состоянии.

import type { SessionSummary, TraceStreamEnd } from '@harness-visualization/server';
import type { ReactElement } from 'react';
import type { EventStream } from '../api/useEventStream';
import { Badge } from '../components/Badge';
import { countEvents } from './SourceList';
import styles from './StreamHeader.module.css';

export type StreamEnd = SessionSummary | TraceStreamEnd;

interface StreamHeaderProps {
  title: string;
  source: string;
  synthetic: boolean;
  stream: EventStream<StreamEnd>;
}

export function StreamHeader({
  title,
  source,
  synthetic,
  stream,
}: StreamHeaderProps): ReactElement {
  return (
    <div className={styles.header}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{title}</h1>
        {synthetic && <Badge tone="error">синтетический: собран руками</Badge>}
      </div>
      <div className={styles.status}>
        <span className={styles.source}>{source}</span> · {describeStream(stream)}
      </div>
    </div>
  );
}

function describeStream(stream: EventStream<StreamEnd>): string {
  const count = countEvents(stream.events.length);
  switch (stream.state) {
    case 'idle':
      return '—';
    case 'open':
      return `поток открыт, ${count}`;
    case 'reconnecting':
      return `обрыв — переподключаюсь (Last-Event-ID), ${count}`;
    case 'ended':
      return describeEnd(stream.end, count);
  }
}

function describeEnd(end: StreamEnd | null, count: string): string {
  if (end === null) {
    return count;
  }
  if ('status' in end) {
    const status = end.status === 'failed' ? 'с ошибкой' : 'закончилась';
    return `сессия ${status}, ${count}. Трейс: ${end.tracePath ?? '—'}`;
  }
  const skipped = end.skippedLines > 0 ? `, пропущено строк: ${String(end.skippedLines)}` : '';
  return `трейс прочитан, ${count}${skipped}`;
}
