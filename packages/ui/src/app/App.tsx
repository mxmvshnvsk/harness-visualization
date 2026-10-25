// Приложение-плеер (этап 8c): шапка с открытым потоком, виды на всю ширину, плеер внизу.
// Сессии, трейсы и запуск — в выезжающей панели, а пока ничего не открыто — на стартовом экране.
// Всё на экране выводится из списка событий потока — своего состояния сессии интерфейс не хранит.

import type { HarnessEvent } from '@harness-visualization/harness';
import type { TraceSummary } from '@harness-visualization/server';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { listSessions, listTraces, sessionEventsUrl, traceEventsUrl } from '../api/serverApi';
import { useEventStream, type EventStream } from '../api/useEventStream';
import { useServerList } from '../api/useServerList';
import { Button } from '../components/Button';
import { Drawer } from '../components/Drawer';
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sessions = useServerList(listSessions);
  const traces = useServerList(listTraces);
  const stream = useEventStream<StreamEnd>(streamUrl(selection));
  const sessionId = selection?.kind === 'session' ? selection.sessionId : null;
  const pending = usePendingPermission(sessionId, stream.events);
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);
  // Выбрали сессию или трейс — панель закрывается: дальше смотрим.
  const pick = useCallback(
    (next: Selection) => {
      select(next);
      setDrawerOpen(false);
      window.scrollTo({ top: 0 });
    },
    [select],
  );

  useReloadOnEnd(stream.state, sessions.reload, traces.reload);

  const sources = (
    <Sidebar sessions={sessions} traces={traces} selection={selection} onSelect={pick} />
  );
  if (selection === null) {
    return <StartScreen>{sources}</StartScreen>;
  }
  return (
    <div className={styles.page}>
      <Topbar
        {...describeSelection(selection, stream.events, traces.items)}
        stream={stream}
        onOpenSources={() => {
          setDrawerOpen(true);
        }}
      />
      {sessionId !== null && pending !== null && (
        <PermissionCard
          sessionId={sessionId}
          pending={pending}
          askedAt={findAskedAt(stream.events, pending.toolCallId)}
        />
      )}
      {/* key: другая сессия или трейс — выбор в инспекторе начинается заново. */}
      <StreamViews
        key={streamUrl(selection)}
        events={stream.events}
        live={selection.kind === 'session' && stream.state !== 'ended'}
      />
      <Drawer open={drawerOpen} label="Сессии и трейсы" onClose={closeDrawer}>
        {sources}
      </Drawer>
    </div>
  );
}

// Сессия закончилась — её статус в списке поменялся, а в traces/ появился трейс.
function useReloadOnEnd(
  state: EventStream<StreamEnd>['state'],
  reloadSessions: () => void,
  reloadTraces: () => void,
): void {
  useEffect(() => {
    if (state === 'ended') {
      reloadSessions();
      reloadTraces();
    }
  }, [state, reloadSessions, reloadTraces]);
}

interface TopbarProps {
  title: string;
  source: string;
  synthetic: boolean;
  stream: EventStream<StreamEnd>;
  onOpenSources: () => void;
}

// Шапка: что открыто, и кнопки, открывающие панель с сессиями, трейсами и запуском.
function Topbar({ onOpenSources, ...header }: TopbarProps): ReactElement {
  return (
    <header className={styles.topbar}>
      <StreamHeader {...header} />
      <div className={styles.toolbar}>
        <Button variant="quiet" onClick={onOpenSources}>
          Сессии и трейсы
        </Button>
        <Button variant="accent" onClick={onOpenSources}>
          Новый вопрос
        </Button>
      </div>
    </header>
  );
}

// Пока ничего не открыто — вопрос агенту и списки прямо на экране, без панели.
function StartScreen({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className={styles.start}>
      <div className={styles.startIntro}>
        <span className={styles.eyebrow}>Harness Visualization</span>
        <h1 className={styles.startTitle}>Как вопрос проходит через харнесс</h1>
        <p className={styles.startText}>
          Задайте вопрос агенту или откройте записанный трейс — и посмотрите по шагам: prompt,
          модель, политика, тулы, ответ.
        </p>
      </div>
      {children}
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
      {viewName === 'inspector' && (
        <InspectorView
          view={view}
          events={events}
          shown={cursor}
          clock={clock}
          schedule={schedule}
        />
      )}
      {viewName === 'events' && <EventList events={shown} />}
      <div className={styles.dock}>
        <div className={styles.dockInner}>
          <TokenomicsLine totals={view.totals} />
          <PlayerBar clock={clock} schedule={schedule} live={live} />
        </div>
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
