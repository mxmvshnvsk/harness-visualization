// Экран 8.1: запуск сессии, списки сессий и трейсов, лента событий и вопрос о разрешении.
// Всё на экране выводится из списка событий потока — своего состояния сессии интерфейс не хранит.

import type { HarnessEvent } from '@harness-visualization/harness';
import type { TraceSummary } from '@harness-visualization/server';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { listSessions, listTraces, sessionEventsUrl, traceEventsUrl } from '../api/serverApi';
import { useEventStream } from '../api/useEventStream';
import { useServerList } from '../api/useServerList';
import { EmptyState } from '../components/EmptyState';
import { Segmented } from '../components/Segmented';
import { EventList } from '../features/EventList';
import { FlowView } from '../features/flow/FlowView';
import { InspectorView } from '../features/inspector/InspectorView';
import { TokenomicsLine } from '../features/TokenomicsLine';
import { PermissionCard } from '../features/PermissionCard';
import { StreamHeader, type StreamEnd } from '../features/StreamHeader';
import { usePendingPermission } from '../features/usePendingPermission';
import { PlayerBar } from '../player/PlayerBar';
import { projectSession } from '../projections/projectSession';
import { buildActions, modelHostOf } from '../timeline/actions';
import { buildSchedule } from '../timeline/schedule';
import { useTimeline } from '../timeline/useTimeline';
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
              {/* key: другая сессия или трейс — выбор в инспекторе начинается заново. */}
              <StreamViews
                key={streamUrl(selection)}
                events={stream.events}
                live={selection.kind === 'session' && stream.state !== 'ended'}
              />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

const VIEWS = [
  { value: 'flow', label: 'Поток' },
  { value: 'inspector', label: 'Инспектор' },
  { value: 'events', label: 'Сырые события' },
] as const;

type ViewName = (typeof VIEWS)[number]['value'];

interface StreamViewsProps {
  events: HarnessEvent[];
  live: boolean;
}

// Все виды показывают события до курсора повтора — повтор и перемотка работают в каждом.
function StreamViews({ events, live }: StreamViewsProps): ReactElement {
  const [viewName, setViewName] = useState<ViewName>('flow');
  const modelHost = useMemo(() => modelHostOf(events), [events]);
  const actions = useMemo(() => buildActions(events, { modelHost }), [events, modelHost]);
  const schedule = useMemo(() => buildSchedule(actions), [actions]);
  const { clock, cursor } = useTimeline(events, schedule, live);
  const shown = useMemo(() => events.slice(0, cursor), [events, cursor]);
  // Проекция — чистая функция событий: пересчитываем, только когда изменился срез.
  const view = useMemo(() => projectSession(shown), [shown]);
  const liveStartedAt = live && events[0] !== undefined ? Date.parse(events[0].timestamp) : null;
  return (
    <div className={styles.views}>
      <Segmented label="Вид" options={VIEWS} value={viewName} onChange={setViewName} />
      {viewName === 'flow' && (
        <FlowView clock={clock} schedule={schedule} liveStartedAt={liveStartedAt} />
      )}
      {viewName === 'inspector' && <InspectorView view={view} />}
      {viewName === 'events' && <EventList events={shown} />}
      <div className={styles.dock}>
        <TokenomicsLine totals={view.totals} />
        <PlayerBar clock={clock} schedule={schedule} live={live} />
      </div>
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
