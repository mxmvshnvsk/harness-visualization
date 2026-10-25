// Экран 8.1: запуск сессии, списки сессий и трейсов, лента событий и вопрос о разрешении.
// Всё на экране выводится из списка событий потока — своего состояния сессии интерфейс не хранит.

import type { HarnessEvent } from '@harness-visualization/harness';
import type { TraceSummary } from '@harness-visualization/server';
import { useEffect, type ReactElement } from 'react';
import { listSessions, listTraces, sessionEventsUrl, traceEventsUrl } from '../api/serverApi';
import { useEventStream } from '../api/useEventStream';
import { useServerList } from '../api/useServerList';
import { EmptyState } from '../components/EmptyState';
import { EventList } from '../features/EventList';
import { PermissionCard } from '../features/PermissionCard';
import { StreamHeader, type StreamEnd } from '../features/StreamHeader';
import { usePendingPermission } from '../features/usePendingPermission';
import styles from './App.module.css';
import { Sidebar } from './Sidebar';
import { useSelection, type Selection } from './useSelection';

export function App(): ReactElement {
  const [selection, select] = useSelection();
  const sessions = useServerList(listSessions);
  const traces = useServerList(listTraces);
  const stream = useEventStream<StreamEnd>(streamUrl(selection));
  const sessionId = selection?.kind === 'session' ? selection.sessionId : null;
  const pending = usePendingPermission(sessionId, stream.events);

  // Сессия закончилась — её статус в списке поменялся, а в traces/ появился трейс.
  const { reload: reloadSessions } = sessions;
  const { reload: reloadTraces } = traces;
  useEffect(() => {
    if (stream.state === 'ended') {
      reloadSessions();
      reloadTraces();
    }
  }, [stream.state, reloadSessions, reloadTraces]);

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>Harness Visualization</div>
      </header>
      <main className={styles.layout}>
        <Sidebar sessions={sessions} traces={traces} selection={selection} onSelect={select} />
        <div className={styles.content}>
          {sessionId !== null && pending !== null && (
            <PermissionCard
              sessionId={sessionId}
              pending={pending}
              askedAt={findAskedAt(stream.events, pending.toolCallId)}
            />
          )}
          {selection === null ? (
            <EmptyState title="Ничего не открыто">
              Задайте вопрос агенту — и посмотрите, как он проходит через харнесс: prompt, модель,
              тулы, ответ. Или откройте записанный трейс.
            </EmptyState>
          ) : (
            <section className={styles.card}>
              <StreamHeader
                {...describeSelection(selection, stream.events, traces.items)}
                stream={stream}
              />
              <EventList events={stream.events} />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function streamUrl(selection: Selection | null): string | null {
  if (selection === null) {
    return null;
  }
  return selection.kind === 'session'
    ? sessionEventsUrl(selection.sessionId)
    : traceEventsUrl(selection.file);
}

function describeSelection(
  selection: Selection,
  events: HarnessEvent[],
  traces: TraceSummary[],
): { title: string; source: string; synthetic: boolean } {
  const question = events.find((event) => event.type === 'user_message');
  const title = question?.type === 'user_message' ? question.text : null;
  if (selection.kind === 'session') {
    return { title: title ?? 'Сессия', source: selection.sessionId, synthetic: false };
  }
  const trace = traces.find((item) => item.file === selection.file);
  return {
    title: title ?? trace?.title ?? selection.file,
    source: selection.file,
    synthetic: trace?.synthetic ?? false,
  };
}

function findAskedAt(events: HarnessEvent[], toolCallId: string): string {
  const request = events.find(
    (event) => event.type === 'permission_requested' && event.toolCallId === toolCallId,
  );
  return request?.timestamp ?? new Date().toISOString();
}
